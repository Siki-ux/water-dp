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
                logger.debug(
                    f"Evaluating {len(schema_definitions)} rules for schema {schema_name}"
                )
                thing_service = ThingService(schema_name)

                for definition in schema_definitions:
                    try:
                        # Fetch latest observations for the datastream
                        # We only need the latest 1
                        observations = thing_service.get_observations(
                            datastream_uuid=definition.datastream_id, limit=1
                        )

                        if not observations:
                            continue

                        latest_obs = observations[0]
                        self._evaluate_sensor_definition(definition, latest_obs.result)

                    except Exception as e:
                        logger.error(
                            f"Failed to evaluate rule {definition.id} for datastream {definition.datastream_id}: {e}"
                        )

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

    def evaluate_all_active_qaqc_rules(self):
        """
        Evaluate all active QA/QC-based alert rules.

        For each rule, queries observations in the configured time window and checks
        what fraction have been flagged by SaQC. Triggers an alert if the flagged
        ratio exceeds the configured threshold.

        Conditions format:
            {
                "flag_level": "BAD" | "QUESTIONABLE" | "ANY",
                "threshold_pct": 10,   # percent of flagged obs that triggers alert
                "window_hours": 24     # how far back to look
            }
        """
        from datetime import datetime, timedelta, timezone

        import psycopg2
        from psycopg2 import sql as pgsql

        from app.core.config import settings

        # Flag level → minimum annotation float value
        FLAG_THRESHOLDS = {
            "BAD": 255.0,
            "QUESTIONABLE": 2.0,
            "ANY": 0.0,
        }

        try:
            definitions = (
                self.db.query(AlertDefinition)
                .options(joinedload(AlertDefinition.project))
                .filter(
                    AlertDefinition.is_active,
                    AlertDefinition.alert_type == "qaqc",
                    AlertDefinition.datastream_id.isnot(None),
                )
                .all()
            )

            if not definitions:
                return

            conn = psycopg2.connect(
                host=settings.timeio_db_host,
                port=settings.timeio_db_port,
                dbname=settings.timeio_db_name,
                user=settings.timeio_db_user,
                password=settings.timeio_db_password,
            )

            try:
                for definition in definitions:
                    try:
                        schema = (
                            definition.project.schema_name
                            if definition.project
                            else None
                        )
                        if not schema:
                            continue

                        conditions = definition.conditions or {}
                        flag_level = conditions.get("flag_level", "BAD")
                        threshold_pct = float(conditions.get("threshold_pct", 10))
                        window_hours = int(conditions.get("window_hours", 24))
                        min_flag_value = FLAG_THRESHOLDS.get(flag_level, 255.0)

                        since = datetime.now(timezone.utc) - timedelta(
                            hours=window_hours
                        )

                        with conn.cursor() as cur:
                            cur.execute(
                                pgsql.SQL(
                                    """
                                    SELECT
                                        COUNT(*) AS total,
                                        COUNT(*) FILTER (
                                            WHERE result_quality IS NOT NULL
                                            AND (result_quality->>'annotation')::float >= %s
                                        ) AS flagged
                                    FROM {schema}.observation
                                    WHERE datastream_id = %s
                                    AND result_time >= %s
                                    """
                                ).format(schema=pgsql.Identifier(schema)),
                                (min_flag_value, int(definition.datastream_id), since),
                            )
                            row = cur.fetchone()

                        if not row or not row[0]:
                            continue

                        total, flagged = row
                        ratio_pct = (flagged / total) * 100

                        if ratio_pct >= threshold_pct:
                            self._create_alert(
                                definition,
                                f"{ratio_pct:.1f}% flagged ({flagged}/{total} obs, last {window_hours}h)",
                            )
                        else:
                            # Resolve active alert if condition no longer met
                            existing = (
                                self.db.query(Alert)
                                .filter(
                                    Alert.definition_id == definition.id,
                                    Alert.status == "active",
                                )
                                .first()
                            )
                            if existing:
                                existing.status = "resolved"
                                self.db.commit()

                    except Exception as e:
                        logger.error(
                            f"Failed to evaluate QA/QC rule {definition.id}: {e}"
                        )
            finally:
                conn.close()

        except Exception as e:
            logger.error(f"Error in QA/QC alert evaluation: {e}")

    def evaluate_qaqc_rules_for_thing(self, project_uuid: str, thing_uuid: str):
        """
        Evaluate QA/QC alert rules for a single project+thing.

        Called when TSM publishes a qaqc_done MQTT message, so evaluation is
        event-driven rather than on a polling schedule.
        """
        from datetime import datetime, timedelta, timezone

        import psycopg2
        from psycopg2 import sql as pgsql

        from app.core.config import settings

        FLAG_THRESHOLDS = {
            "BAD": 255.0,
            "QUESTIONABLE": 2.0,
            "ANY": 0.0,
        }

        try:
            definitions = (
                self.db.query(AlertDefinition)
                .options(joinedload(AlertDefinition.project))
                .filter(
                    AlertDefinition.is_active,
                    AlertDefinition.alert_type == "qaqc",
                    AlertDefinition.datastream_id.isnot(None),
                    AlertDefinition.project.has(Project.id == project_uuid),
                )
                .all()
            )

            if not definitions:
                return

            conn = psycopg2.connect(
                host=settings.timeio_db_host,
                port=settings.timeio_db_port,
                dbname=settings.timeio_db_name,
                user=settings.timeio_db_user,
                password=settings.timeio_db_password,
            )

            try:
                for definition in definitions:
                    try:
                        schema = (
                            definition.project.schema_name
                            if definition.project
                            else None
                        )
                        if not schema:
                            continue

                        conditions = definition.conditions or {}
                        flag_level = conditions.get("flag_level", "BAD")
                        threshold_pct = float(conditions.get("threshold_pct", 10))
                        window_hours = int(conditions.get("window_hours", 24))
                        min_flag_value = FLAG_THRESHOLDS.get(flag_level, 255.0)

                        since = datetime.now(timezone.utc) - timedelta(
                            hours=window_hours
                        )

                        with conn.cursor() as cur:
                            # Join via datastream to filter to the specific thing
                            cur.execute(
                                pgsql.SQL(
                                    """
                                    SELECT
                                        COUNT(*) AS total,
                                        COUNT(*) FILTER (
                                            WHERE o.result_quality IS NOT NULL
                                            AND (o.result_quality->>'annotation')::float >= %s
                                        ) AS flagged
                                    FROM {schema}.observation o
                                    JOIN {schema}.datastream ds ON ds.id = o.datastream_id
                                    JOIN {schema}.thing t ON t.id = ds.thing_id
                                    WHERE o.datastream_id = %s
                                    AND t.uuid = %s
                                    AND o.result_time >= %s
                                    """
                                ).format(schema=pgsql.Identifier(schema)),
                                (
                                    min_flag_value,
                                    int(definition.datastream_id),
                                    thing_uuid,
                                    since,
                                ),
                            )
                            row = cur.fetchone()

                        if not row or not row[0]:
                            continue

                        total, flagged = row
                        ratio_pct = (flagged / total) * 100

                        if ratio_pct >= threshold_pct:
                            self._create_alert(
                                definition,
                                f"{ratio_pct:.1f}% flagged ({flagged}/{total} obs, last {window_hours}h)",
                            )
                        else:
                            existing = (
                                self.db.query(Alert)
                                .filter(
                                    Alert.definition_id == definition.id,
                                    Alert.status == "active",
                                )
                                .first()
                            )
                            if existing:
                                existing.status = "resolved"
                                self.db.commit()

                    except Exception as e:
                        logger.error(
                            f"Failed to evaluate QA/QC rule {definition.id} for thing {thing_uuid}: {e}"
                        )
            finally:
                conn.close()

        except Exception as e:
            logger.error(f"Error evaluating QA/QC alerts for thing {thing_uuid}: {e}")

    def _create_alert(self, definition: AlertDefinition, value: Any):
        from datetime import datetime, timezone

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
            timestamp=datetime.now(timezone.utc),
            status="active",
        )
        self.db.add(alert)
        self.db.commit()
        logger.info(f"Passive Alert Triggered: {definition.name}")
