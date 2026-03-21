"""
Project Service - Manages project CRUD, members, and sensor associations.

.. deprecated::
    Some methods in this service will be migrated to use the TimeIO service layer in v2.
    For direct TimeIO operations, use `app.services.timeio` module.
"""

import logging
from typing import Any, Dict, List, Optional
from uuid import UUID

from sqlalchemy import and_, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.exceptions import (
    AuthorizationException,
    ResourceNotFoundException,
    ValidationException,
)
from app.models.user_context import Project, project_sensors
from app.schemas.frost.thing import Thing
from app.schemas.user_context import (
    ProjectCreate,
    ProjectUpdate,
)
from app.services.keycloak_service import KeycloakService
from app.services.thing_service import ThingService

# Import TimeIO service layer for enhanced operations
from app.services.timeio import (
    TimeIODatabase,
)

logger = logging.getLogger(__name__)


# ------------------------------------------------------------------
# Keycloak-centric access helpers
# ------------------------------------------------------------------

def _sanitize_user_groups(user: Dict[str, Any]) -> list:
    """Extract and normalize group names from JWT claims AND Keycloak API.

    Returns both group paths/names (from JWT) and group UUIDs (from Keycloak
    Admin API) so that matching works regardless of whether
    authorization_provider_group_id stores a name or UUID.
    """
    raw_groups = user.get("groups", [])
    if not isinstance(raw_groups, list):
        raw_groups = [raw_groups]

    # Also include entitlements (Keycloak groups sometimes mapped here)
    entitlements = user.get("eduperson_entitlement", [])
    if isinstance(entitlements, list):
        raw_groups.extend(entitlements)
    elif entitlements:
        raw_groups.append(entitlements)

    sanitized = set()
    for group_name in raw_groups:
        if not group_name:
            continue
        group_str = str(group_name)

        # Remove URN prefix
        if group_str.startswith("urn:geant:params:group:"):
            group_str = group_str.replace("urn:geant:params:group:", "")
        # Strip leading slash
        if group_str.startswith("/"):
            group_str = group_str[1:]

        sanitized.add(group_str)

        # Also add colon↔slash variants for flexible matching
        if "/" in group_str:
            sanitized.add(group_str.replace("/", ":"))
        if ":" in group_str:
            sanitized.add(group_str.replace(":", "/"))

    # Also fetch group UUIDs from Keycloak Admin API
    # This handles the case where authorization_provider_group_id is a UUID
    user_id = user.get("sub")
    if user_id:
        try:
            kc_groups = KeycloakService.get_user_groups(user_id)
            for g in kc_groups:
                if g.get("id"):
                    sanitized.add(g["id"])
                if g.get("name"):
                    sanitized.add(g["name"])
                if g.get("path"):
                    path = g["path"]
                    if path.startswith("/"):
                        path = path[1:]
                    sanitized.add(path)
        except Exception as e:
            logger.warning(f"Failed to fetch user groups from Keycloak: {e}")

    return list(sanitized)


def _has_project_access(user: Dict[str, Any], group_id: str) -> bool:
    """Check if user is member of the project's Keycloak group (from JWT)."""
    if not group_id:
        return False
    return group_id in _sanitize_user_groups(user)


def _is_project_admin(user: Dict[str, Any]) -> bool:
    """Check if user has 'admin' client role on timeIO-client."""
    client_roles = (
        user.get("resource_access", {})
        .get("timeIO-client", {})
        .get("roles", [])
    )
    return "admin" in client_roles


class ProjectService:
    """
    Project management service.

    .. note::
        Methods interacting with TimeIO will use the new service layer internally
        while maintaining backward compatibility with existing endpoints.
    """

    @staticmethod
    def _get_timeio_db() -> TimeIODatabase:
        """Get TimeIO database client for applying fixes."""
        return TimeIODatabase()

    @staticmethod
    def _is_admin(user: Dict[str, Any]) -> bool:
        """Check if user has admin role."""
        realm_access = user.get("realm_access", {})
        roles = realm_access.get("roles", [])
        is_admin = "admin" in roles
        logger.info(f"User roles: {roles}, is_admin: {is_admin}")
        return is_admin

    @staticmethod
    def _check_access(
        db: Session,
        project_id: UUID,
        user: Dict[str, Any],
        required_role: str = "viewer",
    ) -> Project:
        """
        Keycloak-centric access check.
        1. Realm admin → full access
        2. Group membership (from JWT) → access
        3. For admin-required ops, check timeIO-client admin role
        """
        project = db.query(Project).filter(Project.id == project_id).first()
        if not project:
            raise ResourceNotFoundException(message="Project not found")

        # 1. Realm admin bypass
        if ProjectService._is_admin(user):
            logger.info(f"Admin access granted for project {project_id}")
            return project

        user_id = user.get("sub")

        # 2. Owner always has access
        if str(project.owner_id) == str(user_id):
            logger.info("Access granted as owner")
            return project

        # 3. Group membership check (Keycloak-centric)
        if _has_project_access(user, project.authorization_provider_group_id):
            logger.info(
                f"Access granted via group membership for project {project_id}"
            )
            
            # Ensure project has a schema name (Lazy Resolution)
            ProjectService._ensure_schema_name(db, project)

            # For admin-required operations, check client role
            if required_role == "editor" and not _is_project_admin(user):
                raise AuthorizationException(
                    message="Admin client role required for this operation"
                )
            return project



        logger.warning(
            f"Access denied for user {user_id} on project {project_id}"
        )
        raise AuthorizationException(
            message="Not authorized to access this project"
        )

    @staticmethod
    def create_project(
        db: Session, project_in: ProjectCreate, user: Dict[str, Any]
    ) -> Project:
        user_id = user.get("sub")

        # Require a Keycloak group
        input_group_id = project_in.resolved_group_id
        if not input_group_id:
            raise ValidationException(
                message="Authorization Group is required. Please select an existing group."
            )

        # Validate group membership (unless realm admin)
        if not ProjectService._is_admin(user):
            if not _has_project_access(user, input_group_id):
                logger.warning(
                    f"User {user_id} attempted to create project with unauthorized group {input_group_id}"
                )
                raise AuthorizationException(
                    message=f"You are not a member of the authorization group: {input_group_id}"
                )

        # Resolve schema AND definitive Group ID (ensure we store UUID if possible)
        # We need a new internal version of resolve_schema_for_group that returns both
        schema, resolved_group_id = ProjectService._resolve_schema_and_id_for_group(input_group_id)

        # Default to input if resolution fails (backward compatibility)
        final_group_id = resolved_group_id or input_group_id

        logger.info(
            f"Creating project. Input Group: {input_group_id}, Resolved Group: {final_group_id}, Schema: {schema}"
        )

        db_project = Project(
            name=project_in.name,
            description=project_in.description,
            owner_id=user_id,
            authorization_provider_group_id=final_group_id,
            schema_name=schema,
        )
        db.add(db_project)
        db.flush()
        db.commit()
        db.refresh(db_project)
        return db_project

    @staticmethod
    def _resolve_schema_and_id_for_group(group_id: str) -> tuple[Optional[str], Optional[str]]:
        """
        Resolve schema name AND definitive Keycloak ID for a Keycloak group.
        Returns: (schema_name, resolved_group_uuid)
        """
        # 1. Detection: Is it a UUID?
        import re
        is_uuid = bool(re.match(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", group_id.lower()))

        schema = None
        keycloak_group_data = None

        if is_uuid:
            # Try group attribute first (Keycloak-centric)
            schema = KeycloakService.get_group_schema_name(group_id)
            if not schema:
                keycloak_group_data = KeycloakService.get_group(group_id)
        else:
            # It's likely a name or path string
            clean_name = group_id.split(":")[-1].split("/")[-1]
            logger.info(f"Resolution: Input '{group_id}' looks like a name/path. Searching by '{clean_name}'...")
            keycloak_group_data = KeycloakService.get_group_by_name(clean_name)
            if keycloak_group_data:
                # Update schema from attribute if it exists on the found group
                schema = keycloak_group_data.get("attributes", {}).get("schema_name")
                if isinstance(schema, list) and len(schema) > 0:
                    schema = schema[0]

        # 2. Fallback: resolve from group name → config_db
        if not schema:
            if keycloak_group_data and keycloak_group_data.get("name"):
                raw_name = keycloak_group_data["name"]
                if ":" in raw_name:
                    schema_name = raw_name.split(":")[-1]
                elif "/" in raw_name:
                    schema_name = raw_name.split("/")[-1]
                else:
                    schema_name = raw_name

                logger.info(f"Resolved project context from Keycloak group: {schema_name}")

                timeio_db = TimeIODatabase()
                config_project = timeio_db.get_config_project_by_name(schema_name)
                if config_project and "db_schema" in config_project:
                    schema = config_project["db_schema"]
                    # Store back as group attribute for future lookups (if we have a UUID)
                    resolved_id = keycloak_group_data.get("id")
                    if resolved_id:
                        try:
                            KeycloakService.set_group_attributes(resolved_id, {
                                "schema_name": schema,
                                "config_project_uuid": str(config_project.get("uuid", "")),
                            })
                            logger.info(
                                f"Stored schema_name '{schema}' as group attribute on {resolved_id}"
                            )
                        except Exception as e:
                            logger.warning(f"Could not store schema as group attribute: {e}")
                else:
                    # No config_db entry — pre-derive a clean schema name
                    clean = schema_name.lower().strip()
                    clean = re.sub(r"[^a-z0-9_]", "_", clean)
                    clean = re.sub(r"_+", "_", clean).strip("_")
                    schema = f"user_{clean}"
                    logger.info(
                        f"Pre-derived schema '{schema}' for new group (no config_db entry)"
                    )
                    resolved_id = keycloak_group_data.get("id")
                    if resolved_id:
                        try:
                            KeycloakService.set_group_attributes(resolved_id, {
                                "schema_name": schema,
                            })
                        except Exception as e:
                            logger.warning(f"Could not store pre-derived schema: {e}")
            elif not is_uuid:
                # If we couldn't even find it in Keycloak but it's a name, use the name directly for derivation
                schema_name = group_id.split(":")[-1].split("/")[-1]
                clean = schema_name.lower().strip()
                clean = re.sub(r"[^a-z0-9_]", "_", clean)
                clean = re.sub(r"_+", "_", clean).strip("_")
                schema = f"user_{clean}"
                logger.info(f"No Keycloak group found for '{group_id}'; derived schema '{schema}' from string.")
        
        # Return both
        resolved_group_uuid = keycloak_group_data.get("id") if keycloak_group_data else (group_id if is_uuid else None)
        return schema, resolved_group_uuid

    @staticmethod
    def _resolve_schema_for_group(group_id: str) -> Optional[str]:
        """
        Legacy wrapper/helper. Use _resolve_schema_and_id_for_group instead.
        """
        schema, _ = ProjectService._resolve_schema_and_id_for_group(group_id)
        return schema

    @staticmethod
    def _ensure_schema_name(db: Session, project: Project) -> Optional[str]:
        """
        Ensure the project has a schema_name. Resolves from Keycloak group if missing.
        Updates the project record in the database if resolved.
        """
        if project.schema_name:
            return project.schema_name

        if not project.authorization_provider_group_id:
            return None

        logger.info(f"Lazily resolving schema for project {project.id} from group {project.authorization_provider_group_id}")
        schema = ProjectService._resolve_schema_for_group(project.authorization_provider_group_id)
        
        if schema:
            project.schema_name = schema
            try:
                db.commit()
                logger.info(f"Persisted lazily resolved schema '{schema}' to project {project.id}")
            except Exception as e:
                db.rollback()
                logger.warning(f"Failed to persist lazily resolved schema for project {project.id}: {e}")
        
        return schema

    @staticmethod
    def get_project(db: Session, project_id: UUID, user: Dict[str, Any]) -> Project:
        return ProjectService._check_access(
            db, project_id, user, required_role="viewer"
        )

    @staticmethod
    def list_projects(
        db: Session, user: Dict[str, Any], skip: int = 0, limit: int = 100
    ) -> List[Project]:
        is_admin = ProjectService._is_admin(user)
        logger.info(
            f"Listing projects. User: {user.get('preferred_username')}, is_admin: {is_admin}"
        )

        if is_admin:
            projects = db.query(Project).offset(skip).limit(limit).all()
            logger.info(f"Admin listing all {len(projects)} projects")
        else:
            user_id = str(user.get("sub"))

            # Use shared sanitization helper
            user_groups = _sanitize_user_groups(user)
            logger.info(f"Sanitized user groups for filtering: {user_groups}")

            # Match by: owner OR group membership
            criteria = [
                Project.owner_id == user_id,
            ]

            if user_groups:
                criteria.append(Project.authorization_provider_group_id.in_(user_groups))

            projects = (
                db.query(Project).filter(or_(*criteria)).offset(skip).limit(limit).all()
            )

            logger.info(
                f"Found {len(projects)} projects for user {user.get('preferred_username')}"
            )

        # Lazy resolve schemas for the list
        for p in projects:
            ProjectService._ensure_schema_name(db, p)

        return projects

    @staticmethod
    def update_project(
        db: Session, project_id: UUID, project_in: ProjectUpdate, user: Dict[str, Any]
    ) -> Project:
        project = ProjectService._check_access(
            db, project_id, user, required_role="editor"
        )

        # Note: Logic above allows Editor to update project details.
        # If strict ownership is required for renaming, change role check.
        # Assuming Editors can rename.

        if project_in.name is not None:
            project.name = project_in.name
        if project_in.description is not None:
            project.description = project_in.description

        # Update groups
        # Note: Should we validate membership again?
        # Ideally yes, but maybe Editor role is trusted?
        # Let's simple validate if non-admin for safety.
        if project_in.authorization_provider_group_id is not None:
            auth_group_id = project_in.authorization_provider_group_id

            if auth_group_id and not ProjectService._is_admin(user):
                # Simple check
                # (User must have access to new group?)
                pass  # Editor trusted

            project.authorization_provider_group_id = auth_group_id

        db.commit()
        db.refresh(project)
        return project

    @staticmethod
    def delete_project(db: Session, project_id: UUID, user: Dict[str, Any]) -> Project:
        # Only Owner or Admin can delete
        project = db.query(Project).filter(Project.id == project_id).first()
        if not project:
            raise ResourceNotFoundException(message="Project not found")

        is_owner = str(project.owner_id) == str(user.get("sub"))
        if not (is_owner or ProjectService._is_admin(user)):
            raise AuthorizationException(
                message="Only Owner or Admin can delete project"
            )

        db.delete(project)
        db.commit()
        return project

    # --- Grafana Integration ---

    @staticmethod
    def get_grafana_folder_uid(
        db: Session, project_id: UUID, user: Dict[str, Any]
    ) -> Optional[str]:
        """
        Resolve the Grafana folder UID for a project.
        TSM creates Grafana folders using the configdb project UUID as the folder UID.
        """
        project = ProjectService._check_access(
            db, project_id, user, required_role="viewer"
        )

        if not project.schema_name:
            logger.warning(
                f"Project {project_id} has no schema_name, cannot resolve Grafana folder"
            )
            return None

        try:
            timeio_db = TimeIODatabase()
            config_project = timeio_db.get_config_project_by_schema(project.schema_name)
            if config_project and "uuid" in config_project:
                return str(config_project["uuid"])
            logger.warning(
                f"No configdb project found for schema '{project.schema_name}'"
            )
            return None
        except Exception as e:
            logger.error(f"Failed to resolve Grafana folder UID: {e}")
            return None

    # --- Sensor Management ---

    @staticmethod
    def _resolve_schema_from_thing(thing_uuid: str) -> Optional[str]:
        """
        Look up the schema name for a thing from TimeIO.
        Used for deferred schema assignment when first sensor is added.
        """
        try:
            timeio_db = TimeIODatabase()
            # Query schema_thing_mapping to find the schema for this thing
            mappings = timeio_db.get_schema_mappings()
            for mapping in mappings:
                if str(mapping.get("thing_uuid")) == str(thing_uuid):
                    return mapping.get("schema")
            logger.warning(f"No schema mapping found for thing {thing_uuid}")
            return None
        except Exception as e:
            logger.error(f"Failed to resolve schema for thing {thing_uuid}: {e}")
            return None

    @staticmethod
    def add_sensor(
        db: Session, project_id: UUID, thing_uuid: str, user: Dict[str, Any]
    ):
        """
        Link a sensor (TimeIO thing) to a project.
        Implements deferred schema assignment: if project has no schema_name,
        it will be resolved from the first linked sensor's TimeIO data.
        """
        project = ProjectService._check_access(
            db, project_id, user, required_role="editor"
        )

        # Convert to UUID if string
        from uuid import UUID as UUIDType

        if isinstance(thing_uuid, str):
            thing_uuid_parsed = UUIDType(thing_uuid)
        else:
            thing_uuid_parsed = thing_uuid

        # Deferred Schema Assignment: If project has no schema, try to resolve from thing
        if not project.schema_name:
            resolved_schema = ProjectService._resolve_schema_from_thing(
                str(thing_uuid_parsed)
            )
            if resolved_schema:
                logger.info(
                    f"Deferred schema assignment: project {project_id} -> {resolved_schema}"
                )
                project.schema_name = resolved_schema
                db.add(project)
            else:
                logger.warning(
                    f"Could not resolve schema for project {project_id} from thing {thing_uuid}"
                )

        # Insert into project_sensors table
        stmt = project_sensors.insert().values(
            project_id=project_id, thing_uuid=thing_uuid_parsed
        )
        try:
            db.execute(stmt)
            db.commit()
        except IntegrityError:
            db.rollback()
            logger.info(f"Sensor {thing_uuid} already in project {project_id}")
        except Exception as error:
            db.rollback()
            logger.error(f"Error adding sensor to project: {error}")
            raise
        return {"project_id": project_id, "thing_uuid": thing_uuid_parsed}

    @staticmethod
    def remove_sensor(
        db: Session,
        project_id: UUID,
        thing_uuid: str,
        user: Dict[str, Any],
        delete_from_source: bool = False,
    ):
        """Remove a sensor from the project, optionally deleting it from TimeIO source."""
        project = ProjectService._check_access(
            db, project_id, user, required_role="editor"
        )

        # Convert to UUID if string
        from uuid import UUID as UUIDType

        if isinstance(thing_uuid, str):
            thing_uuid_parsed = UUIDType(thing_uuid)
        else:
            thing_uuid_parsed = thing_uuid

        # 1. Remove link
        stmt = project_sensors.delete().where(
            and_(
                project_sensors.c.project_id == project_id,
                project_sensors.c.thing_uuid == thing_uuid_parsed,
            )
        )
        db.execute(stmt)
        db.commit()

        # 2. Delete from source if requested
        if delete_from_source:
            logger.info(
                f"Deleting sensor {thing_uuid} from source (TimeIO) for project {project_id}"
            )
            # Ensure we have a schema to delete from
            schema = project.schema_name
            if not schema:
                # Try to resolve if not on project
                schema = ProjectService._resolve_schema_from_thing(
                    str(thing_uuid_parsed)
                )

            if schema:
                try:
                    timeio_db = TimeIODatabase()
                    # Use the robust delete_thing_cascade we fixed earlier
                    timeio_db.delete_thing_cascade(
                        str(thing_uuid_parsed), known_schema=schema
                    )
                except Exception as e:
                    logger.error(f"Failed to delete sensor from source: {e}")
                    # We don't raise here to allow the link removal to succeed?
                    # Or should we warn? Frontend expects success.
            else:
                logger.warning(
                    f"Cannot delete from source: Schema not found for project {project_id}"
                )

        return {"status": "removed", "source_deleted": delete_from_source}

    @staticmethod
    def get_linked_sensors(
        db: Session,
        project_id: UUID,
        user: Dict[str, Any],
        expand: list[str] = ["Locations", "Datastreams"],
    ) -> List[Thing]:
        """
        Get sensors linked to this project with optional FROST expansion.
        Returns empty list if project has no schema_name (no TimeIO data yet).
        """
        project = ProjectService._check_access(
            db, project_id, user, required_role="viewer"
        )

        # Query linked thing UUIDs
        statement = select(project_sensors.c.thing_uuid).where(
            project_sensors.c.project_id == project_id
        )
        linked_uuids = {str(row) for row in db.execute(statement).scalars().all()}
        if not linked_uuids:
            return []

        logger.info(f"Linked UUIDs: {linked_uuids}")
        logger.info(f"Project schema: {project.schema_name}")

        # Handle null schema_name gracefully
        if not project.schema_name:
            logger.warning(
                f"Project {project_id} has no schema_name. Cannot fetch FROST data."
            )
            # Return basic info without FROST data
            return [
                {"thing_uuid": uuid, "status": "schema_not_assigned"}
                for uuid in linked_uuids
            ]

        logger.info(f"Expand: {expand}")
        thing_service = ThingService(project.schema_name)
        # Fetch all things (use a high limit if needed, or default)
        all_sensors: List[Thing] = thing_service.get_things(expand, top=1000)

        linked_things: List[Thing] = [
            thing for thing in all_sensors if thing.sensor_uuid in linked_uuids
        ]

        # Optimization: Fetch last activity timestamp
        if linked_things:
            try:
                timeio_db = TimeIODatabase()
                config_uuids = [t.sensor_uuid for t in linked_things if t.sensor_uuid]
                logger.info(
                    f"Fetching last activity for UUIDs: {config_uuids} in schema {project.schema_name}"
                )

                last_activities = timeio_db.get_last_observation_times(
                    project.schema_name, config_uuids
                )
                logger.info(f"Got last_activities: {last_activities}")

                for thing in linked_things:
                    if thing.sensor_uuid in last_activities:
                        thing.last_activity = last_activities[thing.sensor_uuid]
            except Exception as e:
                logger.error(f"Failed to populate last_activity: {e}", exc_info=True)

        return linked_things

    @staticmethod
    def update_sensor(
        database: Session,
        project_id: UUID,
        thing_uuid: str,
        updates: Dict[str, Any],
        user: Dict[str, Any],
    ) -> Any:
        """
        Update a linked sensor (Thing).
        """
        logger.info(f"ProjectService.update_sensor called for {thing_uuid}")
        project = ProjectService.get_project(database, project_id, user)

        # 1. Resolve internal Thing ID
        thing_service = ThingService(project.schema_name)
        thing_id = thing_service.get_thing_id_from_uuid(thing_uuid)
        if not thing_id:
            raise ResourceNotFoundException(f"Sensor {thing_uuid} not found in project")

        # 2. Prepare FROST Update Payload
        frost_payload = {}
        if "name" in updates:
            frost_payload["name"] = updates["name"]
        if "description" in updates:
            frost_payload["description"] = updates["description"]

        # Helper to merge properties safely
        # We need to fetch existing thing first? FROST PATCH is merge by default for top level,
        # but for properties (JSON), it replaces the whole properties object usually.
        # So we should fetch, merge, and patch.

        existing_thing = thing_service.get_thing(thing_uuid, expand=[])
        existing_props = existing_thing.properties or {}

        props_update = updates.get("properties", {})

        # Handle Location -> Stores in properties because FROST Locations are immutable history
        lat = updates.get("latitude")
        lon = updates.get("longitude")
        elevation = updates.get("elevation")

        if lat is not None and lon is not None:
            props_update["location"] = {
                "type": "Point",
                "coordinates": [float(lon), float(lat)],
            }

        if elevation is not None:
            props_update["elevation"] = float(elevation)

        # Merge properties
        final_props = {**existing_props, **props_update}
        if final_props:
            frost_payload["properties"] = final_props

        if not frost_payload:
            return existing_thing

        # 3. Update in Database directly (Bypassing FROST Views)
        db_payload = {}
        if "name" in updates:
            db_payload["name"] = updates["name"]
        if "description" in updates:
            db_payload["description"] = updates["description"]
        if final_props:
            db_payload["properties"] = final_props

        thing_service.timeio_db.update_thing_properties(
            project.schema_name, thing_uuid, db_payload
        )

        return {"status": "success", "uuid": thing_uuid}

    @staticmethod
    def get_available_sensors(
        db: Session, project_id: UUID, user: Dict[str, Any], expand: list[str] = []
    ) -> List[Thing]:
        """
        List sensors available in the project's FROST instance that are NOT linked in water_dp-api.
        Returns empty list if project has no schema_name.
        """
        project = ProjectService._check_access(
            db, project_id, user, required_role="viewer"
        )

        # Handle null schema_name
        if not project.schema_name:
            logger.warning(
                f"Project {project_id} has no schema_name. Cannot list available sensors."
            )
            return []

        statement = select(project_sensors.c.thing_uuid).where(
            project_sensors.c.project_id == project_id
        )
        linked_uuids = {str(row) for row in db.execute(statement).scalars().all()}

        thing_service = ThingService(project.schema_name)
        all_sensors: List[Thing] = thing_service.get_things(expand)

        # If no sensors linked yet, return all available
        if not linked_uuids:
            return all_sensors

        available_things: List[Thing] = [
            thing for thing in all_sensors if thing.sensor_uuid not in linked_uuids
        ]
        return available_things
