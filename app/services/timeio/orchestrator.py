from __future__ import annotations

import logging
import secrets
import string
import time
import uuid
from typing import Any, Dict, Optional

from app.core.config import settings
from app.services.timeio.crypto_utils import encrypt_password, hash_password_pbkdf2
from app.services.timeio.mqtt_client import MQTTClient
from app.services.timeio.timeio_db import TimeIODatabase

logger = logging.getLogger("timeio.orchestrator")


class TimeIOOrchestrator:
    """
    Orchestrator for managing TimeIO sensors via the native TSM flow.
    It constructs a configuration payload and sends it via MQTT to the TSM ConfigDB Updater,
    which handles the database insertions (including schema_thing_mapping) and triggers
    the infrastructure setup.
    """

    def __init__(self):
        self.db = TimeIODatabase()
        self.mqtt = MQTTClient()

    def _generate_password(self, length: int = 32) -> str:
        """Generate a secure random password."""
        alphabet = string.ascii_letters + string.digits
        return "".join(secrets.choice(alphabet) for _ in range(length))

    def create_sensor(
        self,
        project_group: str,
        sensor_name: str,
        description: str = "",
        properties: Optional[Dict[str, Any]] = None,
        geometry: Optional[Dict[str, Any]] = None,
        project_schema: Optional[str] = None,
        mqtt_device_type: str = "chirpstack_generic",
        mqtt_username: Optional[str] = None,
        mqtt_password: Optional[str] = None,
        mqtt_topic: Optional[str] = None,
        ingest_type: str = "mqtt",
        parser_id: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        Create a new sensor (Thing) in the TimeIO ecosystem.

        Args:
            project_group: Name of the project/group (e.g. "MyProject")
            sensor_name: Name of the sensor (e.g. "Sensor1")
            description: Optional description
            properties: Optional metadata
            geometry: Optional GeoJSON geometry
            project_schema: Optional known database schema
            mqtt_device_type: MQTT Device Type
            mqtt_username: Optional custom MQTT username
            mqtt_password: Optional custom MQTT password
            mqtt_topic: Optional custom MQTT topic (must follow pattern or be allowed by broker)
            ingest_type: Ingest type (default: "mqtt")

        Returns:
            Dict containing the created Thing's UUID and other details.
        """
        if properties is None:
            properties = {}

        # 1. Resolve Data
        project_name = project_group
        project_uuid = None
        target_schema = None

        if project_schema:
            lookup = self.db.get_project_uuid_by_schema(project_schema)
            if lookup:
                project_name = lookup["name"]
                project_uuid = lookup["uuid"]
                target_schema = project_schema
                logger.info(
                    f"Resolved Project via Schema '{project_schema}': {project_name} ({project_uuid})"
                )
            else:
                logger.warning(
                    f"Provided schema '{project_schema}' not found in DB. Falling back to derivation."
                )

        # Fallback / Default Derivation
        if not project_uuid:
            project_uuid = str(uuid.uuid5(uuid.NAMESPACE_DNS, project_name))

        if not target_schema:
            # Logic matches TSM's default behavior: user_<project_slug>
            project_slug = project_name.lower().replace(" ", "_")
            target_schema = f"user_{project_slug}"
            logger.info(f"Derived Target Schema: {target_schema}")

        # 2. Generate IDs and Credentials
        thing_uuid = str(uuid.uuid4())

        # Verify uniqueness
        if self.db.check_thing_exists(thing_uuid):
            logger.warning(f"UUID collision for {thing_uuid}, regenerating.")
            thing_uuid = str(uuid.uuid4())

        # Database credentials
        existing_db_config = self.db.get_database_config(target_schema)

        if existing_db_config:
            logger.info(
                f"Reusing existing database credentials for schema {target_schema}"
            )
            db_payload = {
                "schema": target_schema,
                "username": existing_db_config["username"],
                "password": existing_db_config["password"],
                "ro_username": existing_db_config["ro_username"],
                "ro_password": existing_db_config["ro_password"],
                "url": existing_db_config["url"],
                "ro_url": existing_db_config["ro_url"],
            }
        else:
            db_pass = self._generate_password()
            ro_pass = self._generate_password()

            db_payload = {
                "schema": target_schema,
                "username": target_schema,
                "password": encrypt_password(db_pass),
                "ro_username": f"ro_{target_schema}",
                "ro_password": encrypt_password(ro_pass),
                "url": f"postgresql://{target_schema}@database:5432/postgres",
                "ro_url": f"postgresql://ro_{target_schema}@database:5432/postgres",
            }

        # MQTT credentials
        mqtt_user = mqtt_username if mqtt_username else f"u_{thing_uuid.split('-')[0]}"
        mqtt_pass = mqtt_password if mqtt_password else self._generate_password()
        mqtt_hash = hash_password_pbkdf2(mqtt_pass)

        # Topic calculation
        # If user provides topic, use it. Otherwise default logic.
        final_mqtt_topic = mqtt_topic if mqtt_topic else f"mqtt_ingest/{mqtt_user}/data"

        # MinIO credentials
        bucket_name = f"b-{thing_uuid}"
        bucket_user = mqtt_user  # Reuse for simplicity
        bucket_pass = self._generate_password()

        # 3. Construct JSON Payload (Version 7)
        payload = {
            "version": 7,
            "uuid": thing_uuid,
            "name": sensor_name,
            "description": description,
            "ingest_type": ingest_type,
            "mqtt_device_type": mqtt_device_type,
            "project": {"name": project_name, "uuid": project_uuid},
            "database": db_payload,
            "mqtt": {
                "username": mqtt_user,
                "password": encrypt_password(mqtt_pass),
                "password_hash": mqtt_hash,
                "topic": final_mqtt_topic,
            },
            "raw_data_storage": {
                "bucket_name": bucket_name,
                "username": bucket_user,
                "password": encrypt_password(bucket_pass),
                "filename_pattern": "*",
            },
            "parsers": {
                "parsers": [],
            },
            "external_sftp": {},
            "external_api": {},
        }

        # 4. Publish to MQTT
        topic = "frontend_thing_update"
        logger.info(f"Publishing creation request for thing {thing_uuid} to {topic}")

        success = self.mqtt.publish_message(
            topic=topic,
            payload=payload,
            username=settings.mqtt_username,
            password=settings.mqtt_password,
        )

        if not success:
            logger.error(f"Failed to publish creation request for thing {thing_uuid}")
            raise RuntimeError("Failed to trigger TSM workflow via MQTT")

        # 5. Wait for Creation
        # We poll the ConfigDB Project DB table to check if the Thing ID is created
        # This confirms the worker has processed it.
        logger.info(f"Waiting for thing {thing_uuid} to be created in DB...")

        max_retries = 30
        retry_interval = 2

        for attempt in range(max_retries):
            # We assume the schema is created by the worker
            # But we might need to verify schema exists first?
            # get_thing_id_in_project_db handles schema lookup/error internally usually

            thing_id = self.db.get_thing_id_in_project_db(target_schema, thing_uuid)
            if thing_id:
                logger.info(
                    f"Thing {thing_uuid} created successfully with ID {thing_id}"
                )

                # 6. Post-Creation: Register Metadata/Properties
                self._register_metadata_and_location(
                    target_schema, thing_uuid, properties, geometry
                )

                # 7. Link Parser to S3 Store (for SFTP ingestion)
                if parser_id:
                    linked = False
                    for retry in range(5):
                        linked = self.db.link_thing_to_parser(thing_uuid, parser_id)
                        if linked:
                            logger.info(f"Linked parser {parser_id} to thing {thing_uuid}")
                            break
                        logger.info(f"Parser link attempt {retry + 1}/5 failed for {thing_uuid}, S3 store may not exist yet. Retrying...")
                        time.sleep(2)
                    if not linked:
                        logger.warning(f"Could not link parser {parser_id} to thing {thing_uuid} after 5 attempts")

                return {
                    "uuid": thing_uuid,
                    "id": thing_id,
                    "name": sensor_name,
                    "project_id": project_uuid,
                    "project_group": project_group,
                    "mqtt_device_type": mqtt_device_type,
                    "schema": target_schema,
                    # Legacy flat returns (keep for compatibility if needed internally)
                    "mqtt_username": mqtt_user,
                    "mqtt_password": mqtt_pass,
                    "mqtt_topic": payload["mqtt"]["topic"],
                    # Structured returns for API response
                    "mqtt": {
                        "username": mqtt_user,
                        "password": mqtt_pass,
                        "topic": payload["mqtt"]["topic"],
                        "device_type": mqtt_device_type,
                    },
                    "properties": properties,
                    "location": geometry,
                }

            time.sleep(retry_interval)

        logger.error(f"Timeout waiting for thing {thing_uuid} creation")
        raise TimeoutError(f"Thing creation timed out for {thing_uuid}")

    def _register_metadata_and_location(
        self,
        schema: str,
        thing_uuid: str,
        properties: Any,
        geometry: Dict[str, Any] = None,
    ):
        """
        Register additional metadata and location.
        """
        # Distinguish between List (Datastream Metadata) and Dict (Thing Properties)
        flat_props = []
        thing_props = {}

        if isinstance(properties, list):
            # It's a list of properties (metadata for datastreams)
            flat_props = properties
            # Handle Pydantic models if passed
            if flat_props and not isinstance(flat_props[0], dict):
                 flat_props = [p.dict() for p in flat_props]
        elif isinstance(properties, dict):
             flat_props = [{"name": k, "unit": str(v)} for k, v in properties.items()]
             thing_props = properties.copy()
        elif properties is None:
            pass
        else:
            logger.warning(f"Unknown properties format: {type(properties)}")

        # Ensure datastreams in project DB
        self.db.ensure_datastreams_in_project_db(schema, thing_uuid, flat_props)

        # Register metadata (units/labels)
        try:
            self.db.register_sensor_metadata(thing_uuid, flat_props)
        except Exception as e:
            logger.warning(
                f"Failed to register legacy SMS metadata for {thing_uuid}: {e}"
            )

        # Update Location/Properties in Thing table
        update_props = thing_props.copy()
        if geometry:
            # Flatten text coordinates for SQL View compatibility / Legacy support
            # Case 1: GeoJSON (New Standard)
            if geometry.get("type") == "Point" and "coordinates" in geometry:
                coords = geometry["coordinates"]
                if coords and len(coords) >= 2:
                    update_props["longitude"] = coords[0]
                    update_props["latitude"] = coords[1]
            # Case 2: Flat Dict (Legacy / Direct Input)
            elif "latitude" in geometry:
                update_props["latitude"] = geometry["latitude"]
                if "longitude" in geometry:
                    update_props["longitude"] = geometry["longitude"]
            
            # Store full geometry object
            update_props["location"] = geometry

        self.db.update_thing_properties(
            schema, thing_uuid, {"properties": update_props}
        )

    def sync_sensor(self, thing_uuid: str) -> bool:
        """
        Trigger a re-sync of the sensor's configuration.
        This re-publishes the full configuration to MQTT, which triggers
        the orchestration workers to re-deploy infrastructure (views, etc.).
        """
        logger.info(f"Triggering sync for sensor {thing_uuid}")

        # 1. Fetch full configuration
        payload = self.db.get_thing_full_config(thing_uuid)
        if not payload:
            logger.error(f"Failed to fetch configuration for sensor {thing_uuid}")
            return False

        # 2. Publish to MQTT
        topic = "frontend_thing_update"
        logger.info(f"Publishing sync request for thing {thing_uuid} to {topic}")

        success = self.mqtt.publish_message(
            topic=topic,
            payload=payload,
            username=settings.mqtt_username,
            password=settings.mqtt_password,
        )

        if not success:
            logger.error(f"Failed to publish sync request for thing {thing_uuid}")
            return False

        return True

    def delete_sensor(self, thing_uuid: str, known_schema: str = None) -> bool:
        """
        Delete a sensor and all its related data (Cascading).
        """
        logger.info(
            f"Deleting sensor {thing_uuid} (Schema: {known_schema or 'resolving'})"
        )
        return self.db.delete_thing_cascade(thing_uuid, known_schema=known_schema)

    def create_dataset(
        self,
        project_group: str,
        dataset_name: str,
        description: str = "",
        parser_config: Optional[Dict[str, Any]] = None,
        filename_pattern: str = "*.csv",
        project_schema: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Create a new dataset (Thing with ingest_type=sftp) for file-based data ingestion.

        Unlike sensors, datasets:
        - Use ingest_type="sftp" instead of "mqtt"
        - Have no location/geometry
        - Have station_type="dataset" in properties
        - Are designed for CSV file uploads to MinIO

        Args:
            project_group: Name of the project/group
            dataset_name: Name of the dataset
            description: Optional description
            parser_config: CSV parser settings (delimiter, timestamp format, etc.)
            filename_pattern: Glob pattern for matching files (default: *.csv)
            project_schema: Optional known database schema

        Returns:
            Dict containing the created dataset's UUID, bucket name, and other details.
        """
        if parser_config is None:
            parser_config = {}

        # 1. Resolve Project Data (same as create_sensor)
        project_name = project_group
        project_uuid = None
        target_schema = None

        if project_schema:
            lookup = self.db.get_project_uuid_by_schema(project_schema)
            if lookup:
                project_name = lookup["name"]
                project_uuid = lookup["uuid"]
                target_schema = project_schema
                logger.info(
                    f"Resolved Project via Schema '{project_schema}': {project_name} ({project_uuid})"
                )
            else:
                logger.warning(
                    f"Provided schema '{project_schema}' not found. Falling back to derivation."
                )

        if not project_uuid:
            project_uuid = str(uuid.uuid5(uuid.NAMESPACE_DNS, project_name))

        if not target_schema:
            project_slug = project_name.lower().replace(" ", "_")
            target_schema = f"user_{project_slug}"
            logger.info(f"Derived Target Schema: {target_schema}")

        # 2. Generate IDs and Credentials
        thing_uuid = str(uuid.uuid4())

        if self.db.check_thing_exists(thing_uuid):
            logger.warning(f"UUID collision for {thing_uuid}, regenerating.")
            thing_uuid = str(uuid.uuid4())

        # Database credentials (reuse existing if schema exists)
        existing_db_config = self.db.get_database_config(target_schema)

        if existing_db_config:
            logger.info(
                f"Reusing existing database credentials for schema {target_schema}"
            )
            db_payload = {
                "schema": target_schema,
                "username": existing_db_config["username"],
                "password": existing_db_config["password"],
                "ro_username": existing_db_config["ro_username"],
                "ro_password": existing_db_config["ro_password"],
                "url": existing_db_config["url"],
                "ro_url": existing_db_config["ro_url"],
            }
        else:
            db_pass = self._generate_password()
            ro_pass = self._generate_password()
            db_payload = {
                "schema": target_schema,
                "username": target_schema,
                "password": encrypt_password(db_pass),
                "ro_username": f"ro_{target_schema}",
                "ro_password": encrypt_password(ro_pass),
                "url": f"postgresql://{target_schema}@database:5432/postgres",
                "ro_url": f"postgresql://ro_{target_schema}@database:5432/postgres",
            }

        # MinIO bucket credentials
        bucket_name = f"b-{thing_uuid}"
        bucket_user = f"u_{thing_uuid.split('-')[0]}"
        bucket_pass = self._generate_password()

        # 3. Construct Parser Settings
        # TSM expects: skiprows, skipfooter, header, timestamp_columns
        # NOTE: When header=0, TSM auto-skips that line for column names.
        #       skiprows is for ADDITIONAL rows to skip (e.g. comments before header)
        #       Don't set skiprows based on user's "skip header" intention - header field handles that.
        parser_settings = {
            "type": "csvparser",
            "name": f"{dataset_name}_parser",
            "settings": {
                "delimiter": parser_config.get("delimiter", ","),
                "skiprows": parser_config.get(
                    "skiprows", 0
                ),  # Extra lines to skip before header
                "skipfooter": parser_config.get("skipfooter", 0),
                "encoding": parser_config.get("encoding", "utf-8"),
                "header": parser_config.get(
                    "header_line", 0
                ),  # Line index of header (0 = first line)
                # Default timestamp format: ISO 8601 (common for CSV exports)
                "timestamp_columns": parser_config.get(
                    "timestamp_columns",
                    [{"column": 0, "format": "%Y-%m-%dT%H:%M:%S.%fZ"}],
                ),
            },
        }

        # Add timestamp columns if provided (override default)
        if "timestamp_columns" in parser_config:
            parser_settings["settings"]["timestamp_columns"] = parser_config[
                "timestamp_columns"
            ]

        # 4. Construct JSON Payload (Version 7) - Dataset variant
        payload = {
            "version": 7,
            "uuid": thing_uuid,
            "name": dataset_name,
            "description": description,
            "ingest_type": "sftp",  # Key difference: file-based ingestion
            "properties": {"station_type": "dataset", "type": "static_dataset"},
            "project": {"name": project_name, "uuid": project_uuid},
            "database": db_payload,
            "mqtt": {},  # Empty - no MQTT for datasets
            "parsers": {"default": 0, "parsers": [parser_settings]},
            "raw_data_storage": {
                "bucket_name": bucket_name,
                "username": bucket_user,
                "password": encrypt_password(bucket_pass),
                "filename_pattern": filename_pattern,
            },
            "external_sftp": {},
            "external_api": {},
        }

        # 5. Publish to MQTT
        topic = "frontend_thing_update"
        logger.info(f"Publishing dataset creation request for {thing_uuid} to {topic}")

        success = self.mqtt.publish_message(
            topic=topic,
            payload=payload,
            username=settings.mqtt_username,
            password=settings.mqtt_password,
        )

        if not success:
            logger.error(f"Failed to publish dataset creation request for {thing_uuid}")
            raise RuntimeError("Failed to trigger TSM workflow via MQTT")

        # 6. Wait for Creation
        logger.info(f"Waiting for dataset {thing_uuid} to be created in DB...")

        max_retries = 30
        retry_interval = 2

        for attempt in range(max_retries):
            thing_id = self.db.get_thing_id_in_project_db(target_schema, thing_uuid)
            if thing_id:
                logger.info(
                    f"Dataset {thing_uuid} created successfully with ID {thing_id}"
                )

                # Update properties to ensure dataset type is set
                dataset_properties = {
                    "station_type": "dataset",
                    "type": "static_dataset",
                }
                self.db.update_thing_properties(
                    target_schema, thing_uuid, {"properties": dataset_properties}
                )

                return {
                    "uuid": thing_uuid,
                    "id": thing_id,
                    "name": dataset_name,
                    "project_group": project_group,
                    "schema": target_schema,
                    "bucket_name": bucket_name,
                    "parser_config": parser_settings["settings"],
                    "filename_pattern": filename_pattern,
                }

            time.sleep(retry_interval)

        logger.error(f"Timeout waiting for dataset {thing_uuid} creation")
        raise TimeoutError(f"Dataset creation timed out for {thing_uuid}")
