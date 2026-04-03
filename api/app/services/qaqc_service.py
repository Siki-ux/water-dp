"""
QA/QC Service

Manages QA/QC configurations in TSM's ConfigDB (config_db.qaqc and config_db.qaqc_test).
Actual QC execution is handled by the tsm-orchestration worker-run-qaqc container;
this service only manages config CRUD and triggers runs via MQTT.
"""

import json
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID

import psycopg2
from psycopg2.extras import RealDictCursor

from app.core.config import settings
from app.services.timeio.mqtt_client import MQTTClient

logger = logging.getLogger(__name__)

# MQTT topic the QC worker listens on (same as data_parsed)
_QC_TRIGGER_TOPIC = "data_parsed"


class QAQCService:
    """
    Provides CRUD operations for QA/QC configurations stored in TSM ConfigDB,
    plus a manual trigger via MQTT.

    All writes go directly to config_db schema in the TimeIO PostgreSQL database.
    This mirrors the pattern used in TimeIODatabase (timeio_db.py).
    """

    def __init__(self):
        self._db_host = getattr(settings, "timeio_db_host", "localhost")
        self._db_port = getattr(settings, "timeio_db_port", 5432)
        self._database = getattr(settings, "timeio_db_name", "postgres")
        self._user = getattr(settings, "timeio_db_user", "postgres")
        self._password = getattr(settings, "timeio_db_password", "postgres")
        self._mqtt = MQTTClient()

    def _get_connection(self):
        return psycopg2.connect(
            host=self._db_host,
            port=self._db_port,
            database=self._database,
            user=self._user,
            password=self._password,
            cursor_factory=RealDictCursor,
        )

    # ------------------------------------------------------------------
    # Project resolution
    # ------------------------------------------------------------------

    def get_tsm_project(self, schema_name: str) -> Optional[Dict[str, Any]]:
        """
        Resolve a water_dp schema_name (e.g. 'user_myproject') to the
        TSM config_db.project row.

        Returns dict with keys: id, uuid, name  — or None if not found.
        """
        conn = self._get_connection()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT p.id, p.uuid, p.name
                    FROM config_db.project p
                    JOIN config_db.database d ON p.database_id = d.id
                    WHERE d.schema = %s
                    LIMIT 1
                    """,
                    (schema_name,),
                )
                row = cur.fetchone()
                return dict(row) if row else None
        finally:
            conn.close()

    def list_schemas_with_configs(self) -> list:
        """
        Return all TSM projects (schemas) that have at least one QAQC config,
        plus projects with no configs (so the SMS can still show them).
        Returns: [{id, uuid, name, schema_name, config_count}]
        """
        conn = self._get_connection()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT
                        p.id,
                        p.uuid,
                        p.name,
                        d.schema AS schema_name,
                        COUNT(q.id) AS config_count
                    FROM config_db.project p
                    JOIN config_db.database d ON p.database_id = d.id
                    LEFT JOIN config_db.qaqc q ON q.project_id = p.id
                    GROUP BY p.id, p.uuid, p.name, d.schema
                    ORDER BY p.name
                    """,
                )
                return [dict(r) for r in cur.fetchall()]
        finally:
            conn.close()

    # ------------------------------------------------------------------
    # QAQC Config CRUD
    # ------------------------------------------------------------------

    def list_configs(self, tsm_project_id: int) -> List[Dict[str, Any]]:
        """List all QA/QC configurations for a TSM project."""
        conn = self._get_connection()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT id, name, project_id, context_window, "default" AS is_default
                    FROM config_db.qaqc
                    WHERE project_id = %s
                    ORDER BY id
                    """,
                    (tsm_project_id,),
                )
                return [dict(r) for r in cur.fetchall()]
        finally:
            conn.close()

    def get_config(self, qaqc_id: int) -> Optional[Dict[str, Any]]:
        """Get a single QA/QC configuration by ID."""
        conn = self._get_connection()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT id, name, project_id, context_window, "default" AS is_default
                    FROM config_db.qaqc
                    WHERE id = %s
                    """,
                    (qaqc_id,),
                )
                row = cur.fetchone()
                return dict(row) if row else None
        finally:
            conn.close()

    def create_config(
        self,
        tsm_project_id: Optional[int],
        name: str,
        context_window: str,
        is_default: bool = False,
    ) -> int:
        """
        Create a new QA/QC configuration.

        If is_default=True, clears the default flag on all other configs in the project first.
        Returns the new config ID.
        """
        conn = self._get_connection()
        try:
            with conn.cursor() as cur:
                if is_default and tsm_project_id is not None:
                    cur.execute(
                        'UPDATE config_db.qaqc SET "default" = FALSE WHERE project_id = %s',
                        (tsm_project_id,),
                    )
                cur.execute(
                    """
                    INSERT INTO config_db.qaqc (name, project_id, context_window, "default")
                    VALUES (%s, %s, %s, %s)
                    RETURNING id
                    """,
                    (name, tsm_project_id, context_window, is_default),
                )
                new_id = cur.fetchone()["id"]
            conn.commit()
            return new_id
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def update_config(
        self,
        qaqc_id: int,
        tsm_project_id: Optional[int],
        name: Optional[str] = None,
        context_window: Optional[str] = None,
        is_default: Optional[bool] = None,
    ) -> None:
        """Update an existing QA/QC configuration."""
        conn = self._get_connection()
        try:
            with conn.cursor() as cur:
                if is_default is True and tsm_project_id is not None:
                    cur.execute(
                        'UPDATE config_db.qaqc SET "default" = FALSE WHERE project_id = %s AND id != %s',
                        (tsm_project_id, qaqc_id),
                    )

                fields: Dict[str, Any] = {}
                if name is not None:
                    fields["name"] = name
                if context_window is not None:
                    fields["context_window"] = context_window
                if is_default is not None:
                    fields['"default"'] = is_default

                if not fields:
                    return

                set_clause = ", ".join(f"{k} = %s" for k in fields)
                values = list(fields.values()) + [qaqc_id]
                cur.execute(
                    f"UPDATE config_db.qaqc SET {set_clause} WHERE id = %s",
                    values,
                )
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def delete_config(self, qaqc_id: int) -> None:
        """Delete a QA/QC configuration and all its tests."""
        conn = self._get_connection()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "DELETE FROM config_db.qaqc_test WHERE qaqc_id = %s",
                    (qaqc_id,),
                )
                cur.execute(
                    "DELETE FROM config_db.qaqc WHERE id = %s",
                    (qaqc_id,),
                )
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    # ------------------------------------------------------------------
    # QAQCTest CRUD
    # ------------------------------------------------------------------

    def list_tests(self, qaqc_id: int) -> List[Dict[str, Any]]:
        """List all tests for a QA/QC configuration, ordered by position."""
        conn = self._get_connection()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT id, qaqc_id, function, name, position, args, streams
                    FROM config_db.qaqc_test
                    WHERE qaqc_id = %s
                    ORDER BY COALESCE(position, 9999), id
                    """,
                    (qaqc_id,),
                )
                return [dict(r) for r in cur.fetchall()]
        finally:
            conn.close()

    def create_test(
        self,
        qaqc_id: int,
        function: str,
        name: Optional[str] = None,
        position: Optional[int] = None,
        args: Optional[Dict[str, Any]] = None,
        streams: Optional[List[Dict[str, Any]]] = None,
    ) -> int:
        """Create a new QC test. Returns the new test ID."""
        conn = self._get_connection()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO config_db.qaqc_test
                        (qaqc_id, function, name, position, args, streams)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    RETURNING id
                    """,
                    (
                        qaqc_id,
                        function,
                        name,
                        position,
                        json.dumps(args) if args is not None else None,
                        json.dumps(streams) if streams is not None else None,
                    ),
                )
                new_id = cur.fetchone()["id"]
            conn.commit()
            return new_id
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def update_test(
        self,
        test_id: int,
        function: Optional[str] = None,
        name: Optional[str] = None,
        position: Optional[int] = None,
        args: Optional[Dict[str, Any]] = None,
        streams: Optional[List[Dict[str, Any]]] = None,
    ) -> None:
        """Update an existing QC test."""
        fields: Dict[str, Any] = {}
        if function is not None:
            fields["function"] = function
        if name is not None:
            fields["name"] = name
        if position is not None:
            fields["position"] = position
        if args is not None:
            fields["args"] = json.dumps(args)
        if streams is not None:
            fields["streams"] = json.dumps(streams)

        if not fields:
            return

        conn = self._get_connection()
        try:
            with conn.cursor() as cur:
                set_clause = ", ".join(f"{k} = %s" for k in fields)
                values = list(fields.values()) + [test_id]
                cur.execute(
                    f"UPDATE config_db.qaqc_test SET {set_clause} WHERE id = %s",
                    values,
                )
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def delete_test(self, test_id: int) -> None:
        """Delete a single QC test."""
        conn = self._get_connection()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "DELETE FROM config_db.qaqc_test WHERE id = %s",
                    (test_id,),
                )
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    # ------------------------------------------------------------------
    # Per-sensor QA/QC
    # ------------------------------------------------------------------

    def get_thing_qaqc(self, thing_uuid: str) -> Optional[Dict[str, Any]]:
        """
        Get the per-sensor QA/QC config assigned to a Thing (via legacy_qaqc_id).
        Returns the qaqc row (with tests) or None.
        """
        conn = self._get_connection()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT q.id, q.name, q.project_id, q.context_window, q."default" AS is_default
                    FROM config_db.thing t
                    JOIN config_db.qaqc q ON t.legacy_qaqc_id = q.id
                    WHERE t.uuid = %s
                    """,
                    (thing_uuid,),
                )
                row = cur.fetchone()
                return dict(row) if row else None
        finally:
            conn.close()

    def assign_thing_qaqc(
        self,
        thing_uuid: str,
        name: str,
        context_window: str,
    ) -> int:
        """
        Create a per-sensor QA/QC config (project_id=NULL) and link it
        to the Thing via legacy_qaqc_id. Returns the new qaqc ID.
        """
        conn = self._get_connection()
        try:
            with conn.cursor() as cur:
                # Create the qaqc record with project_id = NULL
                cur.execute(
                    """
                    INSERT INTO config_db.qaqc (name, project_id, context_window, "default")
                    VALUES (%s, NULL, %s, FALSE)
                    RETURNING id
                    """,
                    (name, context_window),
                )
                qaqc_id = cur.fetchone()["id"]

                # Link to thing
                cur.execute(
                    "UPDATE config_db.thing SET legacy_qaqc_id = %s WHERE uuid = %s",
                    (qaqc_id, thing_uuid),
                )
            conn.commit()
            return qaqc_id
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def unassign_thing_qaqc(self, thing_uuid: str) -> None:
        """Unassign and delete the per-sensor QA/QC config for a Thing."""
        conn = self._get_connection()
        try:
            with conn.cursor() as cur:
                # Get current legacy_qaqc_id
                cur.execute(
                    "SELECT legacy_qaqc_id FROM config_db.thing WHERE uuid = %s",
                    (thing_uuid,),
                )
                row = cur.fetchone()
                if not row or row["legacy_qaqc_id"] is None:
                    return

                qaqc_id = row["legacy_qaqc_id"]

                # Unlink from thing first
                cur.execute(
                    "UPDATE config_db.thing SET legacy_qaqc_id = NULL WHERE uuid = %s",
                    (thing_uuid,),
                )
                # Delete tests and config
                cur.execute(
                    "DELETE FROM config_db.qaqc_test WHERE qaqc_id = %s",
                    (qaqc_id,),
                )
                cur.execute(
                    "DELETE FROM config_db.qaqc WHERE id = %s AND project_id IS NULL",
                    (qaqc_id,),
                )
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    # ------------------------------------------------------------------
    # Trigger
    # ------------------------------------------------------------------

    def trigger_qaqc(
        self,
        project_uuid: str,
        qaqc_name: str,
        start_date: datetime,
        end_date: datetime,
    ) -> bool:
        """
        Publish a v2 MQTT trigger message to run QC for a project.

        The worker-run-qaqc container in tsm-orchestration picks this up
        on the data_parsed topic.
        """
        payload = {
            "version": 2,
            "project_uuid": project_uuid,
            "qc_settings_name": qaqc_name,
            "start_date": start_date.isoformat(),
            "end_date": end_date.isoformat(),
        }
        logger.info(
            f"Triggering QC for project={project_uuid} config={qaqc_name} "
            f"range=[{start_date.isoformat()}, {end_date.isoformat()}]"
        )
        return self._mqtt.publish_message(_QC_TRIGGER_TOPIC, payload)

    def trigger_thing_qaqc(self, thing_uuid: str) -> bool:
        """
        Publish a v1 MQTT trigger message to run QC for a specific Thing.
        Uses the same data_parsed topic but the worker resolves the config
        via legacy_qaqc_id.
        """
        payload = {
            "version": 1,
            "thing_uuid": thing_uuid,
        }
        logger.info(f"Triggering per-sensor QC for thing={thing_uuid}")
        return self._mqtt.publish_message(_QC_TRIGGER_TOPIC, payload)
