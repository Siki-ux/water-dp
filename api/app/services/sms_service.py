"""
SMS Service
Orchestrates SMS-related operations, aggregating data from FROST and ConfigDB.
"""

import asyncio
import logging
from typing import Any, Dict, List, Optional

from app.core.database import SessionLocal
from app.services.async_thing_service import AsyncThingService
from app.services.project_service import ProjectService
from app.services.rbac_service import is_realm_admin, parse_group_roles

# from app.services.timeio.timeio_db import TimeIODatabase  # Moved locally to break circularity
from app.services.timeio.crypto_utils import decrypt_password

logger = logging.getLogger(__name__)


class SMSService:
    @staticmethod
    def _get_accessible_schemas(user: dict) -> list:
        """
        Get list of schemas the user can access based on their Keycloak groups.
        Returns all schemas if user is realm admin.
        """
        from app.models.user_context import Project

        # Realm admin sees everything
        if is_realm_admin(user):
            return None  # None = no filter

        # Parse group names from JWT claim (no Keycloak Admin API call)
        jwt_groups: list = user.get("groups", [])
        group_roles = parse_group_roles(jwt_groups)
        group_names = list(group_roles.keys())  # e.g. ["UFZ-TSM:ProjectA"]
        if not group_names:
            return []  # No groups = no access

        with SessionLocal() as session:
            projects = (
                session.query(Project.schema_name)
                .filter(Project.authorization_provider_group_name.in_(group_names))
                .all()
            )
            return [p.schema_name for p in projects if p.schema_name]

    @staticmethod
    async def get_all_sensors_extended(
        page: int = 1,
        page_size: int = 20,
        user: dict = None,
        search: str = None,
        ingest_type: str = None,
    ) -> Dict[str, Any]:
        """
        Get sensors across projects with extended metadata.
        If user is provided, filters to only schemas accessible via their Keycloak groups.
        """
        from app.services.timeio.timeio_db import TimeIODatabase

        db = TimeIODatabase()
        offset = (page - 1) * page_size

        # Determine accessible schemas for filtering
        accessible_schemas = None
        if user:
            accessible_schemas = SMSService._get_accessible_schemas(user)
            if accessible_schemas is not None and not accessible_schemas:
                return {"items": [], "total": 0}  # User has no project access

        # Fetch from ConfigDB with optional schema filter
        db_result = db.get_all_sensors_paginated(
            limit=page_size,
            offset=offset,
            schemas=accessible_schemas,
            search=search,
            ingest_type=ingest_type,
        )
        items_db = db_result["items"]
        total = db_result["total"]

        if not items_db:
            return {"items": [], "total": total}

        # 2. Enrich with FROST Data — batch by schema to avoid N+1 HTTP calls
        # Group items by schema so we make one FROST request per schema instead of per item
        from collections import defaultdict

        schema_groups: Dict[str, List[Dict]] = defaultdict(list)
        for item in items_db:
            schema = item.get("schema_name")
            if schema:
                schema_groups[schema].append(item)

        # Fetch all things per schema in parallel (one FROST call per schema)
        frost_data_by_uuid: Dict[str, Dict] = {}

        async def fetch_schema_batch(schema: str, items: List[Dict]):
            """Fetch all Things for a schema with $filter on identifiers."""
            try:
                uuids = [it["uuid"] for it in items if it.get("uuid")]
                if not uuids:
                    return
                # Build OData 4.0 or-chain filter (no 'in' operator in STA 1.1)
                # Match both identifier and uuid — simulated Things may only have uuid
                filter_parts = [
                    f"(properties/identifier eq '{u}' or properties/uuid eq '{u}')"
                    for u in uuids
                ]
                filter_expr = " or ".join(filter_parts)
                service = AsyncThingService(schema)
                things = await service.get_things(
                    expand=["Locations"],
                    filter_expr=filter_expr,
                    top=len(uuids),
                )
                for thing in things:
                    if thing.sensor_uuid:
                        frost_data_by_uuid[thing.sensor_uuid] = {
                            "properties": thing.properties,
                            "latitude": thing.location.latitude if thing.location else None,
                            "longitude": thing.location.longitude if thing.location else None,
                        }
            except Exception as e:
                logger.warning(f"Failed to batch-fetch FROST data for schema {schema}: {e}")

        tasks = [
            fetch_schema_batch(schema, items)
            for schema, items in schema_groups.items()
        ]
        if tasks:
            await asyncio.gather(*tasks)

        enriched_items = []
        for item in items_db:
            # Merge
            sensor_data = {
                "uuid": item["uuid"],
                "name": item["name"],
                "description": item["description"],
                "project_name": item["project_name"],  # Extra useful info
                "schema_name": item["schema_name"],
                "ingest_type": item.get("ingest_type"),
                # Extended ConfigDB fields
                "mqtt_username": item["mqtt_username"],
                "mqtt_topic": item["mqtt_topic"],
                "device_type": item["device_type"],
                "parser": item["parser"],
                "parser_id": item["parser_id"],
                # Defaults
                "latitude": None,
                "longitude": None,
                "properties": {},
            }
            # Overlay FROST data
            frost_data = frost_data_by_uuid.get(item["uuid"])
            if frost_data:
                sensor_data.update(frost_data)

            enriched_items.append(sensor_data)

        return {"items": enriched_items, "total": total}

    @staticmethod
    async def get_sensor_details(uuid: str) -> Optional[Dict[str, Any]]:
        """
        Get full details for a single sensor (ConfigDB + FROST + Project Context).
        Project Agnostic (UUID lookup).
        """
        from app.services.timeio.timeio_db import TimeIODatabase

        db = TimeIODatabase()

        # 1. Fetch ConfigDB Data (includes schema_name)
        config = db.get_sensor_config_details(uuid)
        if not config:
            return None

        schema_name = config.get("schema_name")

        # 2. Fetch FROST Data
        frost_data = {}
        if schema_name:
            try:
                service = AsyncThingService(schema_name)
                thing = await service.get_thing(
                    uuid, expand=["Locations", "Datastreams"]
                )
                if thing:
                    frost_data = {
                        "properties": thing.properties,
                        "latitude": thing.location.coordinates.latitude
                        if thing.location and thing.location.coordinates
                        else None,
                        "longitude": thing.location.coordinates.longitude
                        if thing.location and thing.location.coordinates
                        else None,
                        "datastreams": [ds.dict() for ds in thing.datastreams]
                        if thing.datastreams
                        else [],
                    }
            except Exception as e:
                logger.error(f"Failed to fetch FROST details for {uuid}: {e}")

        # 3. Fetch Structured SMS Metadata
        sms_metadata = []
        try:
            sms_metadata = db.get_datastream_metadata(uuid)
        except Exception as e:
            logger.warning(f"Failed to fetch structured SMS metadata for {uuid}: {e}")

        # 4. Fetch External Source Config (ext_api / ext_sftp)
        ext_config = db.get_thing_external_config(uuid)
        external_api = None
        external_sftp = None
        if ext_config:
            if ext_config.get("external_api"):
                ea = ext_config["external_api"]
                external_api = {
                    "type_name": ea.get("type"),
                    "sync_interval": ea.get("sync_interval"),
                    "sync_enabled": ea.get("enabled"),
                    "settings": ea.get("settings") or {},
                }
            if ext_config.get("external_sftp"):
                external_sftp = ext_config["external_sftp"]

        # 5. Merge

        # Location logic: FROST > Properties > None
        lat = frost_data.get("latitude")
        lon = frost_data.get("longitude")

        if lat is None or lon is None:
            # Try to get from properties (legacy or direct input)
            props = config.get("properties") or {}
            # Check for direct keys
            if "latitude" in props and "longitude" in props:
                lat = props["latitude"]
                lon = props["longitude"]
            # Check for nested location object (geojson-like)
            elif "location" in props and isinstance(props["location"], dict):
                loc = props["location"]
                if "latitude" in loc and "longitude" in loc:
                    lat = loc["latitude"]
                    lon = loc["longitude"]

        result = {
            # Basic defaults from config
            "uuid": config["uuid"],
            "name": config["name"],
            "description": config.get("description"),
            "project_name": config.get("project_name"),
            "schema_name": schema_name,
            # Extended fields
            "mqtt_username": config["mqtt_username"],
            "mqtt_password": decrypt_password(config["mqtt_password"])
            if config.get("mqtt_password")
            else None,
            "mqtt_topic": config["mqtt_topic"],
            "device_type": config["device_type"],
            "device_type_id": config.get("device_type_id"),
            "parser": config["parser"],
            "parser_id": config["parser_id"],
            "ingest_type": config.get("ingest_type"),
            "ingest_type_id": config.get("ingest_type_id"),
            # S3 / File Ingestion
            "s3_bucket": config.get("s3_bucket"),
            "s3_user": config.get("s3_user"),
            "s3_password": config.get("s3_pass"),
            "filename_pattern": config.get("filename_pattern"),
            # External Sources
            "external_api": external_api,
            "external_sftp": external_sftp,
            # FROST / Computed fields
            "latitude": lat,
            "longitude": lon,
            "properties": frost_data.get("properties")
            or config.get("properties")
            or {},
            "datastreams": frost_data.get("datastreams", []),
            "datastream_metadata": sms_metadata,
        }
        return result

    @staticmethod
    async def update_sensor(
        uuid: str, update_data: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """
        Update sensor details (ConfigDB and optionally structured SMS metadata).
        """
        from app.services.timeio.timeio_db import TimeIODatabase

        db = TimeIODatabase()

        # Extract external source data before passing to basic config updater
        external_api_data = update_data.pop("external_api", None)
        external_sftp_data = update_data.pop("external_sftp", None)
        latitude = update_data.pop("latitude", None)
        longitude = update_data.pop("longitude", None)
        logger.info(
            f"update_sensor {uuid}: ext_api={'present' if external_api_data else 'None'}, ext_sftp={'present' if external_sftp_data else 'None'}"
        )

        # 1. Update basic ConfigDB config
        updated_config = db.update_sensor_config(uuid, update_data)
        if not updated_config:
            return None

        # 2. Update location if provided
        if latitude is not None and longitude is not None:
            try:
                config = db.get_sensor_config_details(uuid)
                if config and config.get("schema_name"):
                    schema = config["schema_name"]
                    # Read existing properties, merge location
                    existing = db.get_thing_properties(schema, uuid) or {}
                    existing["latitude"] = latitude
                    existing["longitude"] = longitude
                    existing["location"] = {
                        "type": "Point",
                        "coordinates": [longitude, latitude],
                    }
                    db.update_thing_properties(schema, uuid, {"properties": existing})
            except Exception as e:
                logger.error(f"Failed to update location for {uuid}: {e}")

        # 2. Update external API config if provided
        if external_api_data is not None:
            try:
                db.update_thing_external_api(uuid, external_api_data)
            except Exception as e:
                logger.error(f"Failed to update external API config for {uuid}: {e}")

        # 3. Update external SFTP config if provided
        if external_sftp_data is not None:
            try:
                db.update_thing_external_sftp(uuid, external_sftp_data)
            except Exception as e:
                logger.error(f"Failed to update external SFTP config for {uuid}: {e}")

        # 4. Re-sync sensor if external config was changed (updates crontab, etc.)
        if external_api_data is not None or external_sftp_data is not None:
            try:
                from app.services.timeio.orchestrator import TimeIOOrchestrator

                orchestrator = TimeIOOrchestrator()
                orchestrator.sync_sensor(uuid)
            except Exception as e:
                logger.error(f"Failed to trigger re-sync for {uuid}: {e}")

        # 5. Update structured SMS metadata if provided in update_data
        # This handles cases where we want to update metadata for multiple datastreams at once
        if "datastreams" in update_data and isinstance(
            update_data["datastreams"], list
        ):
            for ds in update_data["datastreams"]:
                if "id" in ds:
                    await SMSService.update_datastream_metadata(uuid, ds["id"], ds)

        # Refetch full details
        return await SMSService.get_sensor_details(uuid)

    @staticmethod
    async def delete_sensor(uuid: str, delete_from_source: bool = False) -> bool:
        """
        Delete a sensor (Project Agnostic).
        Resolves its project_id and calls ProjectService.remove_sensor.
        """
        from app.services.timeio.timeio_db import TimeIODatabase

        db = TimeIODatabase()
        config = db.get_sensor_config_details(uuid)
        if not config or not config.get("schema_name"):
            logger.warning(f"Sensor {uuid} config or schema not found for deletion")
            return False

        schema_name = config["schema_name"]

        # We need a DB session for ProjectService and to find our local Project
        with SessionLocal() as session:
            # Resolve the local Project ID from schema_name
            from app.models.user_context import Project

            local_project = (
                session.query(Project)
                .filter(Project.schema_name == schema_name)
                .first()
            )

            if not local_project:
                logger.warning(f"No local project found for schema track {schema_name}")
                return False

            project_id = local_project.id

            # Passing a minimal admin user object to bypass specific ownership check if admin
            admin_user = {"sub": "admin", "realm_access": {"roles": ["admin"]}}

            try:
                ProjectService.remove_sensor(
                    db=session,
                    project_id=project_id,
                    thing_uuid=uuid,
                    user=admin_user,
                    delete_from_source=delete_from_source,
                )
                return True
            except Exception as e:
                logger.error(f"Failed to delete sensor {uuid} via SMS: {e}")
                return False

    @staticmethod
    async def update_datastream_metadata(
        thing_uuid: str, datastream_id: int, metadata: Dict[str, Any]
    ) -> bool:
        """
        Update structured metadata for a single datastream.
        """
        from app.services.timeio.timeio_db import TimeIODatabase

        db = TimeIODatabase()

        # Extract fields from metadata dict
        unit = metadata.get("unit_of_measurement") or {}
        unit_symbol = unit.get("symbol") or metadata.get("unit_symbol")
        op_name = (metadata.get("observed_property") or {}).get("name") or metadata.get(
            "op_name"
        )

        success = db.upsert_datastream_metadata(
            thing_uuid=thing_uuid,
            datastream_id=datastream_id,
            unit_symbol=unit_symbol,
            op_name=op_name,
            accuracy=metadata.get("accuracy"),
            resolution=metadata.get("resolution"),
            measuring_range_min=metadata.get("measuring_range_min"),
            measuring_range_max=metadata.get("measuring_range_max"),
            aggregation_type=metadata.get("aggregation_type"),
        )

        if success:
            # Propagate name(label) and description to project database
            # This ensures display names update in the UI/FROST
            schema = db.get_schema_for_thing(thing_uuid)
            if schema:
                db.update_datastream_metadata(
                    schema=schema,
                    datastream_id=datastream_id,
                    name=metadata.get("name"),
                    description=metadata.get("description"),
                    unit_of_measurement=unit,
                )

        return success

    @staticmethod
    def get_all_device_types(page: int = 1, page_size: int = 100) -> Dict[str, Any]:
        """Get paginated device types."""
        from app.services.timeio.timeio_db import TimeIODatabase

        db = TimeIODatabase()
        offset = (page - 1) * page_size
        return db.get_all_mqtt_device_types(limit=page_size, offset=offset)

    @staticmethod
    def get_all_parsers(
        group_id: str, page: int = 1, page_size: int = 100
    ) -> Dict[str, Any]:
        """Get paginated parsers."""
        from app.services.timeio.timeio_db import TimeIODatabase

        db = TimeIODatabase()
        offset = (page - 1) * page_size
        return db.get_parsers_by_group(group_id, limit=page_size, offset=offset)

    @staticmethod
    def create_csv_parser(
        name: str,
        delimiter: str = ",",
        timestamp_column: int = 0,
        timestamp_format: str = "%Y-%m-%dT%H:%M:%S%z",
        header_line: int = 0,
        extra_params: Optional[Dict[str, Any]] = None,
    ) -> Optional[Dict[str, Any]]:
        """Create new CSV parser."""
        from app.services.timeio.timeio_db import TimeIODatabase

        db = TimeIODatabase()
        return db.create_csv_parser(
            name=name,
            delimiter=delimiter,
            timestamp_column=timestamp_column,
            timestamp_format=timestamp_format,
            header_line=header_line,
            extra_params=extra_params,
        )

    @staticmethod
    def get_parser_details(uuid: str) -> Optional[Dict[str, Any]]:
        """Get parser details by UUID."""
        from app.services.timeio.timeio_db import TimeIODatabase

        db = TimeIODatabase()
        return db.get_parser(uuid)

    @staticmethod
    def update_parser(
        uuid: str, update_data: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """Update parser details."""
        from app.services.timeio.timeio_db import TimeIODatabase

        db = TimeIODatabase()
        # Separate name and settings if needed, but db.update_parser handles it
        return db.update_parser(
            uuid, update_data.get("name"), update_data.get("settings")
        )

    @staticmethod
    def delete_parser(parser_id: int) -> Dict[str, Any]:
        """Delete a parser. Returns result dict with success status and linked sensors if any."""
        from app.services.timeio.timeio_db import TimeIODatabase

        db = TimeIODatabase()
        return db.delete_parser(parser_id)

    @staticmethod
    async def get_device_type_details(id: str) -> Optional[Dict[str, Any]]:
        """
        Get device type details, including code if applicable.
        """
        from app.services.timeio.timeio_db import TimeIODatabase

        db = TimeIODatabase()
        device_type = db.get_mqtt_device_type(id)

        if not device_type:
            return None

        # Check for custom parser script
        properties = device_type.get("properties") or {}
        script_bucket = properties.get("script_bucket")
        script_path = properties.get("script_path")

        if script_bucket and script_path:
            try:
                from app.services.minio_service import minio_service

                content = minio_service.get_file_content(script_bucket, script_path)
                if content:
                    device_type["code"] = content.decode("utf-8")
            except Exception as e:
                logger.error(f"Failed to fetch parser code for {id}: {e}")
                device_type["code_error"] = str(e)

        # If no custom code, check hardcoded parsers
        if "code" not in device_type:
            try:
                import os

                HARDCODED_PARSERS_DIR = "/app/hardcoded_parsers"
                if os.path.exists(HARDCODED_PARSERS_DIR):
                    name = device_type.get("name", "")
                    candidates = [f"{name}.py"]
                    if name.endswith("_api"):
                        candidates.append(f"{name[:-4]}.py")

                    # Also try matching any file that starts with the name
                    # (e.g. ydoc_ml417 -> ydoc_ml_417.py)
                    if os.path.isdir(HARDCODED_PARSERS_DIR):
                        for f in os.listdir(HARDCODED_PARSERS_DIR):
                            if f.endswith(".py"):
                                # Normalize: strip underscores for comparison
                                norm_f = f[:-3].replace("_", "")
                                norm_n = name.replace("_", "")
                                if norm_f == norm_n and f not in candidates:
                                    candidates.append(f)

                    for filename in candidates:
                        filepath = os.path.join(HARDCODED_PARSERS_DIR, filename)
                        if os.path.exists(filepath):
                            with open(filepath, "r") as f:
                                device_type["code"] = f.read()
                            break
            except Exception as e:
                logger.error(f"Failed to read hardcoded parser for {id}: {e}")

        return device_type

    @staticmethod
    def delete_device_type(id: str) -> bool:
        """
        Delete a device type and its associated script.
        """
        from app.services.timeio.timeio_db import TimeIODatabase

        db = TimeIODatabase()
        # Get details first to find script
        device_type = db.get_mqtt_device_type(id)
        if not device_type:
            return False

        # Delete from MinIO if script exists
        properties = device_type.get("properties") or {}
        script_bucket = properties.get("script_bucket")
        script_path = properties.get("script_path")

        if script_bucket and script_path:
            try:
                from app.services.minio_service import minio_service

                minio_service.remove_file(script_bucket, script_path)
            except Exception as e:
                logger.error(f"Failed to delete script for {id}: {e}")
                # Continue to delete from DB even if script deletion fails?
                # Probably yes, to avoid orphan records.

    @staticmethod
    def get_all_ingest_types() -> List[Dict[str, Any]]:
        """Get all available ingest types."""
        from app.services.timeio.timeio_db import TimeIODatabase

        db = TimeIODatabase()
        return db.get_all_ingest_types()
