import logging
import uuid
from datetime import datetime, timedelta
from typing import Dict, List, Optional

from sqlalchemy import and_, func
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import SessionLocal
from app.models.alerts import Alert, AlertDefinition
from app.models.user_context import Project
from app.services.timeio.frost_client import FrostClient, get_cached_frost_client
from app.services.timeio.timeio_db import TimeIODatabase

logger = logging.getLogger(__name__)


class MonitoringService:
    def __init__(self, db: Session = None):
        self.db = db or SessionLocal()
        self.timeio_db = TimeIODatabase()
        self.stats = {}

    def check_inactive_mqtt_things(self):
        """
        Check all MQTT things for inactivity (no data in last 24h).
        Trigger alerts and update status in FROST.
        """
        logger.info("Starting inactive MQTT things check")
        
        self.stats = {
            "total_mqtt_things": 0,
            "checked": 0,
            "queries_failed": 0,
            "inactive": 0,
            "active": 0,
            "alerts_created": 0,
            "alerts_resolved": 0,
            "status_updated": 0,
            "errors": 0
        }

        # 1. Get all MQTT Thing UUIDs from config_db
        try:
            mqtt_uuids = self.timeio_db.get_mqtt_things()
        except Exception as e:
            logger.error(f"Failed to fetch MQTT things from timeio_db: {e}")
            return

        if not mqtt_uuids:
            logger.info("No MQTT things found.")
            return

        logger.info(f"Found {len(mqtt_uuids)} MQTT things to check")
        self.stats["total_mqtt_things"] = len(mqtt_uuids)


        # 2. Get Schema Mappings to group by Project
        try:
            mappings = self.timeio_db.get_schema_mappings()
        except Exception as e:
            logger.error(f"Failed to fetch schema mappings: {e}")
            return

        # Map UUID -> Schema
        uuid_to_schema = {m["thing_uuid"]: m["schema"] for m in mappings}

        # Group UUIDs by Schema
        schema_groups: Dict[str, List[str]] = {}
        for thing_uuid in mqtt_uuids:
            if thing_uuid in uuid_to_schema:
                schema = uuid_to_schema[thing_uuid]
                if schema not in schema_groups:
                    schema_groups[schema] = []
                schema_groups[schema].append(thing_uuid)
            else:
                # This can happen for newly created things or things with broken mapping
                logger.warning(f"Thing {thing_uuid} has no schema mapping. Skipping.")

        # 3. Process each Project/Schema
        for schema, thing_uuids in schema_groups.items():
            try:
                self._process_project_things(schema, thing_uuids)
            except Exception as e:
                logger.error(f"Error processing project schema {schema}: {e}")
                self.stats["errors"] += 1
                
        logger.info(f"Inactive check completed. Stats: {self.stats}")
        return self.stats

    def _process_project_things(self, schema: str, thing_uuids: List[str]):
        """
        Check specific things within a project.
        """
        # Find Project by schema_name
        project = self.db.query(Project).filter(Project.schema_name == schema).first()
        if not project:
            logger.warning(
                f"No Project found for schema {schema}. Skipping monitoring."
            )
            return

        # Get/Create AlertDefinition
        alert_def = self._get_or_create_alert_definition(project.id)

        # Init Frost Client
        frost = get_cached_frost_client(
            base_url=settings.frost_url,
            project_name=schema,
            version=settings.frost_version,
            frost_server=settings.frost_server,
        )

        for thing_uuid in thing_uuids:
            try:
                self._check_thing_inactivity(frost, alert_def, thing_uuid)
            except Exception as e:
                logger.error(f"Error checking thing {thing_uuid}: {e}")
                self.stats["errors"] += 1

    def _get_or_create_alert_definition(self, project_id: uuid.UUID) -> AlertDefinition:
        """
        Ensure an AlertDefinition exists for Inactive Things.
        """
        name = "Inactive Sensor"
        definition = (
            self.db.query(AlertDefinition)
            .filter(
                AlertDefinition.project_id == project_id, AlertDefinition.name == name
            )
            .first()
        )

        if not definition:
            definition = AlertDefinition(
                name=name,
                description="Triggered when a sensor has not received data for 24 hours.",
                project_id=project_id,
                alert_type="nodata",
                severity="warning",
                conditions={"duration_hours": 24},
                is_active=True,
            )
            self.db.add(definition)
            self.db.commit()
            self.db.refresh(definition)
            logger.info(f"Created AlertDefinition '{name}' for project {project_id}")

        return definition


    def _check_thing_inactivity(
        self, frost: FrostClient, alert_def: AlertDefinition, thing_uuid: str
    ):
        # Fetch Thing with latest Observation
        # Filter by UUID property
        filter_str = f"properties/uuid eq '{thing_uuid}'"

        # Expansion: Datastreams -> Observations (Top 1 desc)
        # $expand=Datastreams($expand=Observations($top=1;$orderby=phenomenonTime desc))
        expand_str = (
            "Datastreams($expand=Observations($top=1;$orderby=phenomenonTime desc))"
        )

        things = frost.get_things(filter=filter_str, expand=expand_str)
        self.stats["checked"] += 1

        if not things:
            logger.warning(
                f"Thing {thing_uuid} not found in FROST (schema {frost.project_name})"
            )
            return

        thing_data = things[0]
        thing_id = thing_data.get("@iot.id")
        thing_name = thing_data.get("name", "Unknown")

        # Find latest observation time
        last_activity_time = None

        datastreams = thing_data.get("Datastreams", [])
        for ds in datastreams:
            observations = ds.get("Observations", [])
            if hasattr(observations, "get"): # Handle dict/list confusion if any
                # Should be list from FROST
                pass
            
            if isinstance(observations, list) and observations:
                obs = observations[0]
                # Try phenomenonTime, fall back to resultTime
                t_str = obs.get("phenomenonTime") or obs.get("resultTime")
                # Handle intervals? usually instant for MQTT
                if t_str and isinstance(t_str, str):
                    try:
                        # Only take start if interval
                        if "/" in t_str:
                            t_str = t_str.split("/")[1]  # Use end time of interval?

                        # Replace Z with +00:00 for fromisoformat (Py < 3.7 issue but safe strictly)
                        clean_t_str = t_str.replace("Z", "+00:00")
                        dt = datetime.fromisoformat(clean_t_str)
                        
                        # Ensure UTC aware
                        if dt.tzinfo is None:
                            # Assume UTC if no info
                             from datetime import timezone
                             dt = dt.replace(tzinfo=timezone.utc)
                             
                        if last_activity_time is None or dt > last_activity_time:
                            last_activity_time = dt
                    except ValueError:
                        pass

        # Check Inactivity
        is_inactive = False
        from datetime import timezone
        
        # Use timezone-aware UTC now
        now_aware = datetime.now(timezone.utc)

        if last_activity_time is None:
            # Never reported. 
            # Check created properties? Or just mark inactive.
            # User said: "didnt have any new data published last 24 hours"
            # If NO data ever, is it inactive? Yes.
            is_inactive = True
        else:
            if (now_aware - last_activity_time) > timedelta(hours=24):
                is_inactive = True
        
        if is_inactive:
            self.stats["inactive"] += 1
        else:
            self.stats["active"] += 1

        # Handle Alert and Status
        self._handle_status_update(
            frost,
            alert_def,
            thing_id,
            thing_data,
            is_inactive,
            last_activity_time,
            thing_name,
            thing_uuid,
        )

    def _handle_status_update(
        self,
        frost: FrostClient,
        alert_def: AlertDefinition,
        thing_id,
        thing_data,
        is_inactive: bool,
        last_activity_time: Optional[datetime],
        thing_name: str,
        thing_uuid: str,
    ):
        current_props = thing_data.get("properties", {}) or {}
        current_status = current_props.get("status", "inactive")

        if is_inactive:
            # 1. Trigger Alert if not already active
            self._ensure_alert_active(alert_def, thing_name, last_activity_time)

            # 2. Update Status if needed
            if current_status != "inactive":
                self._update_thing_status(
                    frost, thing_id, current_props, "inactive", thing_uuid
                )
        else:
            # 1. Resolve Alert if exists
            self._resolve_alert(alert_def, thing_name)

            # 2. Update Status if needed
            if current_status != "active":
                self._update_thing_status(
                    frost, thing_id, current_props, "active", thing_uuid
                )

    def _update_thing_status(
        self,
        frost: FrostClient,
        thing_id,
        current_props: Dict,
        new_status: str,
        thing_uuid: str,
    ):
        # deep copy props to avoid mutation issues
        new_props = current_props.copy()
        new_props["status"] = new_status

        # schema is frost.project_name
        schema = frost.project_name

        try:
            # Use TimeIODatabase to update directly
            # update_thing_properties takes (schema, thing_uuid, updates={"properties": ...})
            self.timeio_db.update_thing_properties(
                schema, thing_uuid, {"properties": new_props}
            )
            logger.info(f"Updated Thing {thing_uuid} status to {new_status}")
            self.stats["status_updated"] += 1
        except Exception as e:
            logger.error(f"Failed to update thing {thing_uuid} status: {e}")
            self.stats["errors"] += 1

    def _ensure_alert_active(
        self, alert_def: AlertDefinition, thing_name: str, last_activity: Optional[datetime]
    ):
        # Check if active alert exists for this Thing
        # We store thing_name in details to query it back
        # Note: JSONB query might vary by DB version.
        # using Python filtering if SQL approach is tricky with simple alchemy
        
        # SQLAlchemy JSONB path query: Alert.details['thing_name'].astext == thing_name
        # Assuming postgres
        

        existing = (
             self.db.query(Alert)
             .filter(
                 Alert.definition_id == alert_def.id,
                 Alert.status == "active",
                 func.jsonb_extract_path_text(Alert.details, 'thing_name') == thing_name
             )
             .first()
        )

        if not existing:
            last_seen = last_activity.isoformat() if last_activity else "Never"
            alert = Alert(
                definition_id=alert_def.id,
                message=f"Sensor '{thing_name}' is inactive. Last data: {last_seen}",
                details={"thing_name": thing_name, "last_activity": last_seen},
                status="active",
                timestamp=datetime.utcnow(),
            )
            self.db.add(alert)
            self.db.commit()
            logger.info(f"Raised inactive alert for {thing_name}")
            self.stats["alerts_created"] += 1

    def _resolve_alert(self, alert_def: AlertDefinition, thing_name: str):
        # Find active alert for this thing
        existing = (
             self.db.query(Alert)
             .filter(
                 Alert.definition_id == alert_def.id,
                 Alert.status == "active",
                 func.jsonb_extract_path_text(Alert.details, 'thing_name') == thing_name
             )
             .first()
        )

        if existing:
            existing.status = "resolved"
            existing.details = {**(existing.details or {}), "resolved_at": datetime.utcnow().isoformat()}
            self.db.commit()
            logger.info(f"Resolved alert for {thing_name}")
            self.stats["alerts_resolved"] += 1
