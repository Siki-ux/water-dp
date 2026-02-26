import logging
from typing import Any, Dict
from uuid import UUID

from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from app.models.alerts import Alert, AlertDefinition
from app.models.user_context import Project

logger = logging.getLogger(__name__)


class AlertEvaluator:
    """
    Evaluates 'Passive' alert rules against computation results.
    """

    def __init__(self, db: Session):
        self.db = db

    def evaluate_all_active_sensor_rules(self):
        """
        Periodically evaluate all active sensor-based rules against the latest data.
        """
        from app.services.thing_service import ThingService

        try:
            # Get active rules that have a datastream target
            # Join with Project to get schema_name
            definitions = (
                self.db.query(AlertDefinition)
                .options(joinedload(AlertDefinition.project))
                .filter(
                    AlertDefinition.is_active,
                    AlertDefinition.sensor_id.isnot(None),
                    AlertDefinition.datastream_id.isnot(None),
                )
                .all()
            )

            if not definitions:
                return

            # Group definitions by schema for efficiency
            schema_map = {}
            for d in definitions:
                schema = d.project.schema_name
                if not schema:
                    continue
                if schema not in schema_map:
                    schema_map[schema] = []
                schema_map[schema].append(d)

            for schema_name, schema_definitions in schema_map.items():
                logger.debug(f"Evaluating {len(schema_definitions)} rules for schema {schema_name}")
                thing_service = ThingService(schema_name)

                for definition in schema_definitions:
                    try:
                        # Fetch latest observations for the datastream
                        # We only need the latest 1
                        observations = thing_service.get_observations(
                            datastream_uuid=definition.datastream_id,
                            limit=1
                        )

                        if not observations:
                            continue

                        latest_obs = observations[0]
                        self._evaluate_sensor_definition(definition, latest_obs.result)

                    except Exception as e:
                        logger.error(f"Failed to evaluate rule {definition.id} for datastream {definition.datastream_id}: {e}")

        except Exception as e:
            logger.error(f"Error in periodic alert evaluation: {e}")

    def evaluate_result(self, job_id: str, script_id: UUID, result: Dict[str, Any]):
        """
        Check if the result triggers any alerts defined for this script.
        """
        try:
            # Find definitions targeting this script
            definitions = (
                self.db.query(AlertDefinition)
                .filter(
                    AlertDefinition.target_id == str(script_id),
                    AlertDefinition.is_active,
                    # We could filter by alert_type="computation_result" if we differentiate types strictly
                )
                .all()
            )

            for definition in definitions:
                self._evaluate_definition(definition, result)

        except Exception as e:
            logger.error(f"Error evaluating alerts for job {job_id}: {e}")

    def _evaluate_definition(self, definition: AlertDefinition, result: Dict[str, Any]):
        """
        Evaluate a single definition against the result dictionary.
        Conditions format: {"field": "risk_score", "operator": ">", "value": 50}
        """
        try:
            conditions = definition.conditions
            if not isinstance(conditions, dict):
                return

            # Simple logic: Single condition support for now
            field = conditions.get("field")
            operator = conditions.get("operator")
            threshold = conditions.get("value")

            if not field or not operator or threshold is None:
                return

            # Get value from result
            actual_value = result.get(field)
            if actual_value is None:
                return

            # Compare
            triggered = False
            if operator == ">":
                triggered = float(actual_value) > float(threshold)
            elif operator == "<":
                triggered = float(actual_value) < float(threshold)
            elif operator == "==":
                triggered = str(actual_value) == str(threshold)

            if triggered:
                self._create_alert(definition, actual_value)

        except Exception as e:
            logger.warning(f"Failed to evaluate definition {definition.id}: {e}")

    def evaluate_sensor_data(self, station_id: str, value: Any, parameter: str):
        """
        Evaluate sensor data against threshold rules.
        """
        try:
            # Find definitions targeting this station/datastream
            # target_id can be station_id (legacy) or we check datastream_id explicitly
            definitions = (
                self.db.query(AlertDefinition)
                .filter(
                    AlertDefinition.is_active,
                    or_(
                        AlertDefinition.target_id == str(station_id),
                        AlertDefinition.datastream_id == str(parameter),
                    ),
                )
                .all()
            )

            for definition in definitions:
                # Match alert_type with parameter. Current implementation assumes primary metric
                # comparison based on target_id (station) and conditions.

                self._evaluate_sensor_definition(definition, value)

        except Exception as e:
            logger.error(
                f"Error evaluating sensor alerts for station {station_id}: {e}"
            )

    def _evaluate_sensor_definition(self, definition: AlertDefinition, value: Any):
        try:
            conditions = definition.conditions
            if not isinstance(conditions, dict):
                return

            operator = conditions.get("operator")
            threshold = conditions.get("value")

            if not operator or threshold is None:
                return

            # Simple Threshold Check
            triggered = False
            try:
                val_float = float(value)
                thresh_float = float(threshold)

                if operator == ">":
                    triggered = val_float > thresh_float
                elif operator == "<":
                    triggered = val_float < thresh_float
                elif operator == "==":
                    triggered = val_float == thresh_float
            except (ValueError, TypeError):
                # If value is not numeric, skip threshold checks
                return

            if triggered:
                # Check if we should throttle? For now, just trigger.
                self._create_alert(definition, value)

        except Exception as e:
            logger.warning(f"Failed to evaluate sensor definition {definition.id}: {e}")

    def _create_alert(self, definition: AlertDefinition, value: Any):
        from datetime import datetime

        # Deduplication: Check if an active alert already exists for this definition
        existing_active = (
            self.db.query(Alert)
            .filter(Alert.definition_id == definition.id, Alert.status == "active")
            .first()
        )

        if existing_active:
            # Already active, do not spam
            return

        alert = Alert(
            definition_id=definition.id,
            message=f"Alert '{definition.name}' triggered: {value}",
            details={"value": value, "rule": definition.conditions},
            timestamp=datetime.utcnow(),
            status="active",
        )
        self.db.add(alert)
        self.db.commit()
        logger.info(f"Passive Alert Triggered: {definition.name}")
