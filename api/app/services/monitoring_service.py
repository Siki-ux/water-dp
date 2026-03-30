import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import SessionLocal
from app.models.alerts import Alert, AlertDefinition
from app.models.sensor_activity import SensorActivityConfig
from app.models.user_context import Project
from app.services.timeio.frost_client import get_cached_frost_client
from app.services.timeio.timeio_db import TimeIODatabase

logger = logging.getLogger(__name__)

# Ingest types for which activity tracking defaults to OFF
_SFTP_INGEST_TYPES = {"sftp", "extsftp"}


class MonitoringService:
    def __init__(self, db: Session = None):
        self.db = db or SessionLocal()
        self.timeio_db = TimeIODatabase()
        self.stats = {}

    # ------------------------------------------------------------------
    # MQTT event handler: called on every data_parsed message
    # ------------------------------------------------------------------

    def record_activity_for_thing(self, thing_uuid: str):
        """
        Record that a sensor produced data now.
        - Updates (or creates) its SensorActivityConfig.last_seen_at to UTC now.
        - Resolves any open inactivity alert.
        Called from the record_sensor_activity Celery task triggered by MQTT data_parsed.
        """
        if not thing_uuid:
            return

        config = self._get_or_create_activity_config(thing_uuid)
        if config is None:
            return

        config.last_seen_at = datetime.now(timezone.utc)
        self.db.commit()
        logger.debug("Recorded activity for thing %s", thing_uuid)

        # Resolve any open inactivity alert
        alert_def = (
            self.db.query(AlertDefinition)
            .filter(
                AlertDefinition.project_id == config.project_id,
                AlertDefinition.name == "Inactive Sensor",
            )
            .first()
        )
        if alert_def:
            thing_name = self._get_thing_name(thing_uuid)
            if thing_name:
                self._resolve_alert(alert_def, thing_name)

    # ------------------------------------------------------------------
    # Periodic check: called from Celery Beat every 30 min
    # ------------------------------------------------------------------

    def check_inactive_sensors(self):
        """
        Check all sensors whose activity tracking is enabled.
        Uses last_seen_at from SensorActivityConfig — no FROST polling.
        Creates inactivity alerts for sensors silent longer than their threshold,
        resolves alerts for sensors that have become active again.
        """
        logger.info("Starting sensor activity check")

        self.stats = {
            "tracked": 0,
            "inactive": 0,
            "active": 0,
            "alerts_created": 0,
            "alerts_resolved": 0,
            "errors": 0,
        }

        configs = (
            self.db.query(SensorActivityConfig)
            .filter(SensorActivityConfig.track_activity.is_(True))
            .all()
        )

        self.stats["tracked"] = len(configs)
        now = datetime.now(timezone.utc)

        for config in configs:
            try:
                self._check_config_inactivity(config, now)
            except Exception:
                logger.exception(
                    "Error checking activity for thing %s", config.thing_uuid
                )
                self.stats["errors"] += 1

        logger.info("Sensor activity check complete. Stats: %s", self.stats)
        return self.stats

    def _check_config_inactivity(self, config: SensorActivityConfig, now: datetime):
        threshold = timedelta(hours=config.inactivity_threshold_hours)
        last_seen = config.last_seen_at

        # Make last_seen tz-aware if it came back naive from the DB
        if last_seen is not None and last_seen.tzinfo is None:
            last_seen = last_seen.replace(tzinfo=timezone.utc)

        is_inactive = last_seen is None or (now - last_seen) > threshold

        alert_def = self._get_or_create_alert_definition(config.project_id)
        thing_name = self._get_thing_name(str(config.thing_uuid))

        if not thing_name:
            logger.warning(
                "No name found for thing %s, skipping alert", config.thing_uuid
            )
            return

        if is_inactive:
            self.stats["inactive"] += 1
            self._ensure_alert_active(alert_def, thing_name, last_seen)
            self._update_frost_status(config, "inactive")
        else:
            self.stats["active"] += 1
            self._resolve_alert(alert_def, thing_name)
            self._update_frost_status(config, "active")

    # ------------------------------------------------------------------
    # Alert definition management
    # ------------------------------------------------------------------

    def _get_or_create_alert_definition(self, project_id: uuid.UUID) -> AlertDefinition:
        name = "Inactive Sensor"
        definition = (
            self.db.query(AlertDefinition)
            .filter(
                AlertDefinition.project_id == project_id,
                AlertDefinition.name == name,
            )
            .first()
        )
        if not definition:
            definition = AlertDefinition(
                name=name,
                description="Triggered when a sensor has not received data within the configured threshold.",
                project_id=project_id,
                alert_type="nodata",
                severity="warning",
                conditions={"duration_hours": 24},
                is_active=True,
            )
            self.db.add(definition)
            self.db.commit()
            self.db.refresh(definition)
            logger.info("Created AlertDefinition '%s' for project %s", name, project_id)
        return definition

    def _ensure_alert_active(
        self,
        alert_def: AlertDefinition,
        thing_name: str,
        last_activity: Optional[datetime],
    ):
        existing = (
            self.db.query(Alert)
            .filter(
                Alert.definition_id == alert_def.id,
                Alert.status == "active",
                func.jsonb_extract_path_text(Alert.details, "thing_name") == thing_name,
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
            logger.info("Raised inactive alert for %s", thing_name)
            self.stats["alerts_created"] += 1

    def _resolve_alert(self, alert_def: AlertDefinition, thing_name: str):
        existing = (
            self.db.query(Alert)
            .filter(
                Alert.definition_id == alert_def.id,
                Alert.status == "active",
                func.jsonb_extract_path_text(Alert.details, "thing_name") == thing_name,
            )
            .first()
        )
        if existing:
            existing.status = "resolved"
            existing.details = {
                **(existing.details or {}),
                "resolved_at": datetime.utcnow().isoformat(),
            }
            self.db.commit()
            logger.info("Resolved inactivity alert for %s", thing_name)
            self.stats["alerts_resolved"] = self.stats.get("alerts_resolved", 0) + 1

    # ------------------------------------------------------------------
    # SensorActivityConfig helpers
    # ------------------------------------------------------------------

    def _get_or_create_activity_config(
        self, thing_uuid: str
    ) -> Optional[SensorActivityConfig]:
        """
        Return existing SensorActivityConfig or auto-create with defaults.
        Returns None if the thing's project cannot be determined.
        """
        try:
            thing_uuid_obj = uuid.UUID(thing_uuid)
        except ValueError:
            logger.warning("record_activity_for_thing: invalid UUID %s", thing_uuid)
            return None

        config = (
            self.db.query(SensorActivityConfig)
            .filter(SensorActivityConfig.thing_uuid == thing_uuid_obj)
            .first()
        )
        if config:
            return config

        # Auto-create: look up project and ingest type
        try:
            mappings = self.timeio_db.get_schema_mappings()
        except Exception:
            logger.exception(
                "_get_or_create_activity_config: failed to fetch schema mappings"
            )
            return None

        schema = next(
            (m["schema"] for m in mappings if m["thing_uuid"] == thing_uuid), None
        )
        if not schema:
            logger.warning(
                "_get_or_create_activity_config: no schema for %s", thing_uuid
            )
            return None

        project = self.db.query(Project).filter(Project.schema_name == schema).first()
        if not project:
            logger.warning(
                "_get_or_create_activity_config: no project for schema %s", schema
            )
            return None

        track = self._default_track_activity(thing_uuid)
        config = SensorActivityConfig(
            thing_uuid=thing_uuid_obj,
            project_id=project.id,
            track_activity=track,
            inactivity_threshold_hours=24,
            last_seen_at=None,
        )
        self.db.add(config)
        self.db.commit()
        self.db.refresh(config)
        logger.info(
            "Auto-created SensorActivityConfig for %s (track=%s)", thing_uuid, track
        )
        return config

    def _default_track_activity(self, thing_uuid: str) -> bool:
        """Return the default track_activity value based on ingest type."""
        try:
            things = self.timeio_db.get_all_things_with_ingest_type()
            entry = next((t for t in things if t["uuid"] == thing_uuid), None)
            if entry and entry["ingest_type"] in _SFTP_INGEST_TYPES:
                return False
        except Exception:
            logger.exception("_default_track_activity: failed to fetch ingest type")
        return True

    # ------------------------------------------------------------------
    # FROST status update (best-effort, only from periodic check)
    # ------------------------------------------------------------------

    def _update_frost_status(self, config: SensorActivityConfig, new_status: str):
        try:
            mappings = self.timeio_db.get_schema_mappings()
        except Exception:
            return
        thing_uuid = str(config.thing_uuid)
        schema = next(
            (m["schema"] for m in mappings if m["thing_uuid"] == thing_uuid), None
        )
        if not schema:
            return
        try:
            frost = get_cached_frost_client(
                base_url=settings.frost_url,
                project_name=schema,
                version=settings.frost_version,
                frost_server=settings.frost_server,
            )
            things = frost.get_things(filter=f"properties/uuid eq '{thing_uuid}'")
            if not things:
                return
            thing_data = things[0]
            current_props = thing_data.get("properties", {}) or {}
            if current_props.get("status") == new_status:
                return
            new_props = {**current_props, "status": new_status}
            self.timeio_db.update_thing_properties(
                schema, thing_uuid, {"properties": new_props}
            )
            self.stats["status_updated"] = self.stats.get("status_updated", 0) + 1
        except Exception:
            logger.exception("_update_frost_status: failed for %s", thing_uuid)

    # ------------------------------------------------------------------
    # Utility
    # ------------------------------------------------------------------

    def _get_thing_name(self, thing_uuid: str) -> Optional[str]:
        """Look up thing name from TimeIO DB via schema mapping."""
        try:
            mappings = self.timeio_db.get_schema_mappings()
        except Exception:
            return None
        schema = next(
            (m["schema"] for m in mappings if m["thing_uuid"] == thing_uuid), None
        )
        if not schema:
            return None
        try:
            import psycopg2
            from psycopg2 import sql as pgsql

            conn = psycopg2.connect(
                host=settings.timeio_db_host,
                port=settings.timeio_db_port,
                dbname=settings.timeio_db_name,
                user=settings.timeio_db_user,
                password=settings.timeio_db_password,
            )
            with conn:
                with conn.cursor() as cur:
                    cur.execute(
                        pgsql.SQL(
                            "SELECT name FROM {schema}.thing WHERE uuid = %s"
                        ).format(schema=pgsql.Identifier(schema)),
                        (thing_uuid,),
                    )
                    row = cur.fetchone()
            conn.close()
            return row[0] if row else None
        except Exception:
            logger.exception("_get_thing_name: DB lookup failed for %s", thing_uuid)
            return None
