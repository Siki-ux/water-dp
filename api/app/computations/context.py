import logging
from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID

from sqlalchemy.orm import Session

from app.models.alerts import Alert, AlertDefinition
from app.models.computations import ComputationScript
from app.models.user_context import Project

logger = logging.getLogger(__name__)


class ComputationContext:
    """
    Context object passed to computation scripts.
    Provides secure access to data and alerting capabilities.
    """

    def __init__(
        self, db: Session, job_id: str, script_id: UUID, params: Dict[str, Any]
    ):
        self.db = db
        self.job_id = job_id
        self.script_id = script_id
        self.params = params
        self._alerts_triggered: List[Dict[str, Any]] = []

        # Initialize FrostClient
        from app.core.config import settings
        from app.services.timeio.frost_client import FrostClient

        # Resolve Project Schema for FrostClient
        # We need to identify which project this script belongs to
        script_obj = (
            self.db.query(ComputationScript)
            .filter(ComputationScript.id == self.script_id)
            .first()
        )

        project_name = None
        if script_obj:
            project = (
                self.db.query(Project)
                .filter(Project.id == script_obj.project_id)
                .first()
            )
            if project and project.schema_name:
                project_name = project.schema_name

        if not project_name:
            # Fallback or Error?
            # Only if we can't find the project, we might fail or use a default.
            # However, FrostClient NEEDS a project_name.
            # Let's log a warning and maybe try a default if configured, or fail gracefully.
            logger.warning(
                f"Could not resolve project schema for script {script_id}. defaulting to 'god_mode' or failing."
            )
            # If no schema found, maybe we shouldn't init the client or init with dummy?
            # But subsequent calls will fail.
            # Let's guess 'timeio' or similar if nothing found?
            # Or better, let it fail at request time if not set?
            pass

        self._frost_client = FrostClient(
            base_url=settings.frost_url,
            project_name=project_name,
            version=settings.frost_version,
            frost_server=settings.frost_server,
        )

    def get_sensor_data(self, sensor_id: str, limit: int = 1) -> List[Dict[str, Any]]:
        """
        Fetch latest data for a sensor (Thing ID).
        Proxy to FrostClient.
        """
        try:
            # Note: TSM/FROST structure usually requires querying Datastreams for data,
            # not just "Thing ID".
            # TimeSeriesService.get_latest_data(sensor_id) was doing some magic or
            # likely fetching observations for datastreams of that thing.
            # FrostClient `get_observations` needs a Datastream ID.

            # Helper to find datastreams for a thing
            datastreams = self._frost_client.list_datastreams(thing_id=sensor_id)
            if not datastreams:
                return []

            # Fetch latest observation for the first datastream (or all?)
            # Legacy expected a list of Dicts.
            # Let's aggregate from all datastreams of this thing?

            all_obs = []
            for ds in datastreams:
                ds_id = ds.get("@iot.id")
                obs = self._frost_client.get_observations(
                    datastream_id=ds_id, limit=limit
                )
                all_obs.extend(obs)

            # Sort by time desc
            all_obs.sort(key=lambda x: x.get("phenomenonTime"), reverse=True)
            return all_obs[:limit]

        except Exception as e:
            logger.error(f"Context Error fetching data for {sensor_id}: {e}")
            return []

    def get_dataset(self, dataset_id: str) -> Dict[str, Any]:
        """
        Fetch dataset properties (metadata).
        For now, returns the Thing's properties which represents the dataset.
        """
        try:
            thing = self._frost_client.get_thing(dataset_id)
            return thing if thing else {}
        except Exception as e:
            logger.error(f"Context Error fetching dataset {dataset_id}: {e}")
            return {}

    def alert(
        self,
        message: str,
        details: Optional[Dict[str, Any]] = None,
        severity: str = "warning",
    ):
        """
        Trigger an alert from within the script.
        """
        alert_data = {
            "message": message,
            "details": details or {},
            "severity": severity,
            "timestamp": datetime.utcnow().isoformat(),
        }
        self._alerts_triggered.append(alert_data)
        logger.info(f"Script {self.script_id} triggered alert: {message}")

        # Persist immediately or queue?
        # Ideally we persist immediately so it's recorded even if script crashes later.
        self._persist_alert(message, details, severity)

    def _persist_alert(self, message: str, details: Dict[str, Any], severity: str):
        """
        Internal: Save alert to DB linking to the Script (Definition target).
        Lookup logic finds active AlertDefinitions targeting this script ID.
        """
        try:
            # Find definitions that target this script
            definitions = (
                self.db.query(AlertDefinition)
                .filter(
                    AlertDefinition.target_id == str(self.script_id),
                    AlertDefinition.is_active,
                )
                .all()
            )

            if not definitions:
                logger.warning(
                    f"No active AlertDefinition found for script {self.script_id}. Alert not saved."
                )
                return

            # For now, trigger ALL definitions associated with this script
            # Refinement: Pass a 'rule_name' to ctx.alert to match Definition.name?
            for definition in definitions:
                # Logic to filter by severity could go here
                new_alert = Alert(
                    definition_id=definition.id,
                    message=message,
                    details=details,
                    timestamp=datetime.utcnow(),
                    status="active",
                )
                self.db.add(new_alert)
            self.db.commit()

        except Exception as e:
            logger.error(f"Failed to persist alert: {e}")
            self.db.rollback()
