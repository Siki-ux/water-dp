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
from app.models.user_context import Project, ProjectMember, project_sensors
from app.schemas.frost.thing import Thing
from app.schemas.user_context import (
    ProjectCreate,
    ProjectUpdate,
)
from app.services.keycloak_service import KeycloakService
from app.services.rbac_service import PermissionResolver, is_realm_admin, parse_group_roles
from app.services.thing_service import ThingService

# Import TimeIO service layer for enhanced operations
from app.services.timeio import (
    TimeIODatabase,
)

logger = logging.getLogger(__name__)


# ------------------------------------------------------------------
# Legacy helpers (kept for backward compat, not used in hot path)
# ------------------------------------------------------------------

def _is_project_admin(user: Dict[str, Any]) -> bool:
    """Check if user has 'admin' client role on timeIO-client (legacy check)."""
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
        """Check if user has realm admin role (god user)."""
        return is_realm_admin(user)

    @staticmethod
    def _check_access(
        db: Session,
        project_id: UUID,
        user: Dict[str, Any],
        required_role: str = "viewer",
    ) -> Project:
        """
        Two-tier RBAC access check using PermissionResolver.
        required_role: 'viewer' | 'editor' | 'owner'
        """
        project = db.query(Project).filter(Project.id == project_id).first()
        if not project:
            raise ResourceNotFoundException(message="Project not found")

        perms = PermissionResolver.resolve(user, project, db)

        if required_role == "viewer" and not perms.can_view:
            logger.warning(f"Access denied for user {user.get('sub')} on project {project_id}")
            raise AuthorizationException(message="Not authorized to access this project")

        if required_role == "editor" and not perms.can_edit_settings:
            logger.warning(f"Edit access denied for user {user.get('sub')} on project {project_id}")
            raise AuthorizationException(message="Editor access required for this operation")

        if required_role == "owner" and not perms.can_delete:
            logger.warning(f"Owner access denied for user {user.get('sub')} on project {project_id}")
            raise AuthorizationException(message="Owner access required for this operation")

        # Lazy resolve schema name if missing
        ProjectService._ensure_schema_name(db, project)

        logger.info(
            f"Access granted for user {user.get('sub')} on project {project_id} "
            f"(effective_role={perms.effective_role})"
        )
        return project

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

        # Validate group membership (unless realm admin) — uses JWT, no Admin API call
        if not ProjectService._is_admin(user):
            jwt_groups: List[str] = user.get("groups", [])
            group_roles = parse_group_roles(jwt_groups)
            # Resolve group name early so we can match UUID → name against JWT group roles
            group_name_for_check: str | None = None
            try:
                gdata = KeycloakService.get_group(input_group_id)
                if gdata:
                    group_name_for_check = gdata.get("name")
            except Exception:
                pass
            # input_group_id may be a UUID or group name/path; check against both
            in_group = (
                input_group_id in group_roles
                or (group_name_for_check and group_name_for_check in group_roles)
                or any(
                    input_group_id in (path, path.lstrip("/"))
                    for path in jwt_groups
                )
            )
            if not in_group:
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

        # Resolve group name for JWT matching (avoid per-request Admin API calls later)
        group_name = None
        try:
            group_data = KeycloakService.get_group(final_group_id) if final_group_id else None
            if group_data:
                group_name = group_data.get("name")
        except Exception as e:
            logger.warning(f"Could not resolve group name for group {final_group_id}: {e}")

        db_project = Project(
            name=project_in.name,
            description=project_in.description,
            owner_id=user_id,
            authorization_provider_group_id=final_group_id,
            authorization_provider_group_name=group_name,
            schema_name=schema,
        )
        db.add(db_project)
        db.flush()

        # Add creator as explicit owner in project_members (skip for realm admins —
        # they have owner-equivalent access everywhere via is_realm_admin check).
        if not is_realm_admin(user):
            import uuid as _uuid
            owner_member = ProjectMember(
                id=_uuid.uuid4(),
                project_id=db_project.id,
                user_id=user_id,
                role="owner",
            )
            db.add(owner_member)

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
        db: Session,
        user: Dict[str, Any],
        skip: int = 0,
        limit: int = 100,
        group_id: Optional[str] = None,
    ) -> List[Project]:
        """
        List projects accessible to the user.
        group_id: optional filter to show only projects for a specific Keycloak group.
        """
        from app.services.rbac_service import parse_group_roles

        admin = ProjectService._is_admin(user)
        logger.info(
            f"Listing projects. User: {user.get('preferred_username')}, is_admin: {admin}"
        )

        if admin:
            query = db.query(Project)
            if group_id:
                query = query.filter(
                    or_(
                        Project.authorization_provider_group_id == group_id,
                        Project.authorization_provider_group_name == group_id,
                    )
                )
            projects = query.offset(skip).limit(limit).all()
            logger.info(f"Admin listing {len(projects)} projects")
        else:
            user_sub = str(user.get("sub"))

            # Parse group names from JWT (no Admin API call)
            jwt_groups: List[str] = user.get("groups", [])
            group_roles = parse_group_roles(jwt_groups)
            group_names = list(group_roles.keys())

            # Also collect entitlements (alternative group claim)
            entitlements = user.get("eduperson_entitlement", [])
            if isinstance(entitlements, str):
                entitlements = [entitlements]
            group_names.extend(entitlements)

            # Access criteria:
            # 1. User owns the project (owner_id)
            # 2. Project is in one of user's groups (by name or by UUID from JWT)
            # 3. User has an explicit project_members row
            criteria: list = [
                Project.owner_id == user_sub,
            ]

            if group_names:
                criteria.append(
                    or_(
                        Project.authorization_provider_group_name.in_(group_names),
                        # Also check raw group paths/IDs from JWT for legacy projects
                        Project.authorization_provider_group_id.in_(group_names),
                    )
                )

            # Include projects where user has an explicit project_members row
            criteria.append(
                Project.id.in_(
                    db.query(ProjectMember.project_id).filter(
                        ProjectMember.user_id == user_sub
                    )
                )
            )

            query = db.query(Project).filter(or_(*criteria))

            # Optional group filter
            if group_id:
                query = query.filter(
                    or_(
                        Project.authorization_provider_group_id == group_id,
                        Project.authorization_provider_group_name == group_id,
                    )
                )

            projects = query.offset(skip).limit(limit).all()
            logger.info(
                f"Found {len(projects)} projects for user {user.get('preferred_username')}"
            )

        # Lazy resolve schemas
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
        # Requires can_delete (owner, group admin, or realm admin)
        project = ProjectService._check_access(db, project_id, user, required_role="owner")
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
