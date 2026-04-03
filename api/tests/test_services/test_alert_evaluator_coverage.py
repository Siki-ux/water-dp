"""
Comprehensive unit tests for AlertEvaluator to maximise code coverage.

Covers:
- evaluate_result: operators >, <, ==; missing field; non-dict conditions; dedup
- _evaluate_definition: edge cases (missing field/operator/value, None actual_value)
- evaluate_sensor_data: threshold operators, non-numeric values, DB query paths
- _evaluate_sensor_definition: operators, non-numeric, missing conditions keys
- evaluate_all_active_sensor_rules: schema grouping, empty defs, observation fetch
- evaluate_all_active_qaqc_rules: flag thresholds, resolve path, no rows, exceptions
- evaluate_qaqc_rules_for_thing: triggered & resolved paths, no schema, no defs
- _create_alert: deduplication (existing active alert skips creation)
"""

import uuid
from unittest.mock import MagicMock, patch

from app.models.alerts import Alert, AlertDefinition
from app.models.user_context import Project
from app.services.alert_evaluator import AlertEvaluator

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_definition(**overrides):
    """Create a mock AlertDefinition with sensible defaults."""
    d = MagicMock(spec=AlertDefinition)
    d.id = overrides.get("id", uuid.uuid4())
    d.name = overrides.get("name", "Test Rule")
    d.is_active = overrides.get("is_active", True)
    d.conditions = overrides.get("conditions", {"operator": ">", "value": 50})
    d.target_id = overrides.get("target_id", None)
    d.sensor_id = overrides.get("sensor_id", None)
    d.datastream_id = overrides.get("datastream_id", None)
    d.alert_type = overrides.get("alert_type", "threshold")
    d.severity = overrides.get("severity", "warning")
    # Attach a mock project
    proj = MagicMock()
    proj.schema_name = overrides.get("schema_name", "test_schema")
    proj.id = overrides.get("project_id", uuid.uuid4())
    d.project = proj
    return d


def _mock_db_no_existing_alert(db):
    """Configure db.query(Alert).filter(...).first() to return None (no dup)."""
    original_side_effect = db.query.side_effect

    def side_effect(model):
        if model is Alert:
            m = MagicMock()
            m.filter.return_value.first.return_value = None
            return m
        if original_side_effect:
            return original_side_effect(model)
        return MagicMock()

    db.query.side_effect = side_effect


# ---------------------------------------------------------------------------
# evaluate_result
# ---------------------------------------------------------------------------


class TestEvaluateResult:
    def test_greater_than_triggers(self):
        db = MagicMock()
        defn = _make_definition(
            conditions={"field": "risk_score", "operator": ">", "value": 50},
            target_id="script-1",
        )

        def qse(model):
            if model is AlertDefinition:
                m = MagicMock()
                m.filter.return_value.all.return_value = [defn]
                return m
            if model is Alert:
                m = MagicMock()
                m.filter.return_value.first.return_value = None
                return m
            return MagicMock()

        db.query.side_effect = qse
        ev = AlertEvaluator(db)
        ev.evaluate_result("j1", uuid.uuid4(), {"risk_score": 80})
        assert db.add.called

    def test_less_than_triggers(self):
        db = MagicMock()
        defn = _make_definition(
            conditions={"field": "temp", "operator": "<", "value": 0},
            target_id="script-1",
        )

        def qse(model):
            if model is AlertDefinition:
                m = MagicMock()
                m.filter.return_value.all.return_value = [defn]
                return m
            if model is Alert:
                m = MagicMock()
                m.filter.return_value.first.return_value = None
                return m
            return MagicMock()

        db.query.side_effect = qse
        ev = AlertEvaluator(db)
        ev.evaluate_result("j1", uuid.uuid4(), {"temp": -5})
        assert db.add.called

    def test_equal_triggers(self):
        db = MagicMock()
        defn = _make_definition(
            conditions={"field": "status", "operator": "==", "value": "FAIL"},
            target_id="script-1",
        )

        def qse(model):
            if model is AlertDefinition:
                m = MagicMock()
                m.filter.return_value.all.return_value = [defn]
                return m
            if model is Alert:
                m = MagicMock()
                m.filter.return_value.first.return_value = None
                return m
            return MagicMock()

        db.query.side_effect = qse
        ev = AlertEvaluator(db)
        ev.evaluate_result("j1", uuid.uuid4(), {"status": "FAIL"})
        assert db.add.called

    def test_not_triggered_when_below_threshold(self):
        db = MagicMock()
        defn = _make_definition(
            conditions={"field": "risk_score", "operator": ">", "value": 50},
            target_id="script-1",
        )

        def qse(model):
            if model is AlertDefinition:
                m = MagicMock()
                m.filter.return_value.all.return_value = [defn]
                return m
            return MagicMock()

        db.query.side_effect = qse
        ev = AlertEvaluator(db)
        ev.evaluate_result("j1", uuid.uuid4(), {"risk_score": 10})
        assert not db.add.called

    def test_no_definitions_found(self):
        db = MagicMock()
        db.query.return_value.filter.return_value.all.return_value = []
        ev = AlertEvaluator(db)
        ev.evaluate_result("j1", uuid.uuid4(), {"risk_score": 100})
        assert not db.add.called

    def test_missing_field_in_result(self):
        db = MagicMock()
        defn = _make_definition(
            conditions={"field": "missing_key", "operator": ">", "value": 0},
            target_id="s1",
        )

        def qse(model):
            if model is AlertDefinition:
                m = MagicMock()
                m.filter.return_value.all.return_value = [defn]
                return m
            return MagicMock()

        db.query.side_effect = qse
        ev = AlertEvaluator(db)
        ev.evaluate_result("j1", uuid.uuid4(), {"other": 99})
        assert not db.add.called

    def test_conditions_not_dict(self):
        db = MagicMock()
        defn = _make_definition(conditions="not a dict", target_id="s1")

        def qse(model):
            if model is AlertDefinition:
                m = MagicMock()
                m.filter.return_value.all.return_value = [defn]
                return m
            return MagicMock()

        db.query.side_effect = qse
        ev = AlertEvaluator(db)
        ev.evaluate_result("j1", uuid.uuid4(), {"x": 1})
        assert not db.add.called

    def test_conditions_missing_operator(self):
        db = MagicMock()
        defn = _make_definition(
            conditions={"field": "x", "value": 1},  # no operator
            target_id="s1",
        )

        def qse(model):
            if model is AlertDefinition:
                m = MagicMock()
                m.filter.return_value.all.return_value = [defn]
                return m
            return MagicMock()

        db.query.side_effect = qse
        ev = AlertEvaluator(db)
        ev.evaluate_result("j1", uuid.uuid4(), {"x": 5})
        assert not db.add.called

    def test_conditions_missing_value(self):
        db = MagicMock()
        defn = _make_definition(
            conditions={"field": "x", "operator": ">"},  # no value
            target_id="s1",
        )

        def qse(model):
            if model is AlertDefinition:
                m = MagicMock()
                m.filter.return_value.all.return_value = [defn]
                return m
            return MagicMock()

        db.query.side_effect = qse
        ev = AlertEvaluator(db)
        ev.evaluate_result("j1", uuid.uuid4(), {"x": 5})
        assert not db.add.called

    def test_conditions_missing_field(self):
        db = MagicMock()
        defn = _make_definition(
            conditions={"operator": ">", "value": 1},  # no field
            target_id="s1",
        )

        def qse(model):
            if model is AlertDefinition:
                m = MagicMock()
                m.filter.return_value.all.return_value = [defn]
                return m
            return MagicMock()

        db.query.side_effect = qse
        ev = AlertEvaluator(db)
        ev.evaluate_result("j1", uuid.uuid4(), {"x": 5})
        assert not db.add.called

    def test_outer_exception_is_caught(self):
        db = MagicMock()
        db.query.side_effect = RuntimeError("db gone")
        ev = AlertEvaluator(db)
        # Should not raise
        ev.evaluate_result("j1", uuid.uuid4(), {})


# ---------------------------------------------------------------------------
# _create_alert  (deduplication)
# ---------------------------------------------------------------------------


class TestCreateAlert:
    def test_dedup_skips_when_active_alert_exists(self):
        db = MagicMock()
        defn = _make_definition()
        existing = MagicMock(spec=Alert)

        db.query.return_value.filter.return_value.first.return_value = existing

        ev = AlertEvaluator(db)
        ev._create_alert(defn, 99)
        assert not db.add.called

    def test_creates_alert_when_no_existing(self):
        db = MagicMock()
        defn = _make_definition(name="MyRule", conditions={"operator": ">", "value": 5})

        db.query.return_value.filter.return_value.first.return_value = None

        ev = AlertEvaluator(db)
        ev._create_alert(defn, 42)
        assert db.add.called
        alert = db.add.call_args[0][0]
        assert isinstance(alert, Alert)
        assert "MyRule" in alert.message
        assert alert.status == "active"
        assert alert.details["value"] == 42
        db.commit.assert_called_once()


# ---------------------------------------------------------------------------
# evaluate_sensor_data
# ---------------------------------------------------------------------------


class TestEvaluateSensorData:
    def _setup(self, definitions):
        db = MagicMock()

        def qse(model):
            if model is AlertDefinition:
                m = MagicMock()
                m.filter.return_value.all.return_value = definitions
                return m
            if model is Alert:
                m = MagicMock()
                m.filter.return_value.first.return_value = None
                return m
            return MagicMock()

        db.query.side_effect = qse
        return db

    def test_gt_triggers(self):
        defn = _make_definition(conditions={"operator": ">", "value": 30})
        db = self._setup([defn])
        ev = AlertEvaluator(db)
        ev.evaluate_sensor_data("station-1", 35.0, "temperature")
        assert db.add.called

    def test_lt_triggers(self):
        defn = _make_definition(conditions={"operator": "<", "value": 0})
        db = self._setup([defn])
        ev = AlertEvaluator(db)
        ev.evaluate_sensor_data("station-1", -2.0, "temperature")
        assert db.add.called

    def test_eq_triggers(self):
        defn = _make_definition(conditions={"operator": "==", "value": 100})
        db = self._setup([defn])
        ev = AlertEvaluator(db)
        ev.evaluate_sensor_data("station-1", 100.0, "level")
        assert db.add.called

    def test_not_triggered(self):
        defn = _make_definition(conditions={"operator": ">", "value": 100})
        db = self._setup([defn])
        ev = AlertEvaluator(db)
        ev.evaluate_sensor_data("station-1", 50.0, "level")
        assert not db.add.called

    def test_non_numeric_value_skipped(self):
        defn = _make_definition(conditions={"operator": ">", "value": 10})
        db = self._setup([defn])
        ev = AlertEvaluator(db)
        ev.evaluate_sensor_data("station-1", "not-a-number", "ph")
        assert not db.add.called

    def test_non_numeric_threshold_skipped(self):
        defn = _make_definition(conditions={"operator": ">", "value": "abc"})
        db = self._setup([defn])
        ev = AlertEvaluator(db)
        ev.evaluate_sensor_data("station-1", 10, "ph")
        assert not db.add.called

    def test_conditions_not_dict(self):
        defn = _make_definition(conditions=[1, 2, 3])
        db = self._setup([defn])
        ev = AlertEvaluator(db)
        ev.evaluate_sensor_data("station-1", 10, "ph")
        assert not db.add.called

    def test_conditions_missing_operator(self):
        defn = _make_definition(conditions={"value": 10})
        db = self._setup([defn])
        ev = AlertEvaluator(db)
        ev.evaluate_sensor_data("station-1", 20, "ph")
        assert not db.add.called

    def test_conditions_missing_value(self):
        defn = _make_definition(conditions={"operator": ">"})
        db = self._setup([defn])
        ev = AlertEvaluator(db)
        ev.evaluate_sensor_data("station-1", 20, "ph")
        assert not db.add.called

    def test_no_definitions(self):
        db = self._setup([])
        ev = AlertEvaluator(db)
        ev.evaluate_sensor_data("station-1", 20, "ph")
        assert not db.add.called

    def test_outer_exception_caught(self):
        db = MagicMock()
        db.query.side_effect = RuntimeError("boom")
        ev = AlertEvaluator(db)
        ev.evaluate_sensor_data("s1", 1, "p")  # should not raise

    def test_inner_exception_caught(self):
        """Exception inside _evaluate_sensor_definition is caught per-definition."""
        defn = _make_definition(conditions={"operator": ">", "value": 10})
        db = MagicMock()

        call_count = 0

        def qse(model):
            nonlocal call_count
            if model is AlertDefinition:
                m = MagicMock()
                m.filter.return_value.all.return_value = [defn]
                return m
            if model is Alert:
                # Simulate error during dedup check inside _create_alert
                raise RuntimeError("inner boom")
            return MagicMock()

        db.query.side_effect = qse
        ev = AlertEvaluator(db)
        ev.evaluate_sensor_data("s1", 20, "p")  # should not raise


# ---------------------------------------------------------------------------
# evaluate_all_active_sensor_rules
# ---------------------------------------------------------------------------


class TestEvaluateAllActiveSensorRules:
    @patch("app.services.alert_evaluator.AlertEvaluator._evaluate_sensor_definition")
    def test_groups_by_schema_and_evaluates(self, mock_eval_def):
        db = MagicMock()

        proj_a = MagicMock(spec=Project)
        proj_a.schema_name = "schema_a"
        proj_b = MagicMock(spec=Project)
        proj_b.schema_name = "schema_b"

        d1 = _make_definition(sensor_id="s1", datastream_id="ds1")
        d1.project = proj_a
        d2 = _make_definition(sensor_id="s2", datastream_id="ds2")
        d2.project = proj_b

        db.query.return_value.options.return_value.filter.return_value.all.return_value = [
            d1,
            d2,
        ]

        obs_mock = MagicMock()
        obs_mock.result = 42.0

        with patch("app.services.thing_service.ThingService") as MockTS:
            instance = MockTS.return_value
            instance.get_observations.return_value = [obs_mock]

            ev = AlertEvaluator(db)
            ev.evaluate_all_active_sensor_rules()

        assert mock_eval_def.call_count == 2
        # Verify ThingService was instantiated for both schemas
        MockTS.assert_any_call("schema_a")
        MockTS.assert_any_call("schema_b")

    def test_no_definitions_returns_early(self):
        db = MagicMock()
        db.query.return_value.options.return_value.filter.return_value.all.return_value = []
        ev = AlertEvaluator(db)
        ev.evaluate_all_active_sensor_rules()
        # No error, just returns

    def test_empty_observations_skipped(self):
        db = MagicMock()
        defn = _make_definition(sensor_id="s1", datastream_id="ds1")

        db.query.return_value.options.return_value.filter.return_value.all.return_value = [
            defn
        ]

        with patch("app.services.thing_service.ThingService") as MockTS:
            instance = MockTS.return_value
            instance.get_observations.return_value = []

            ev = AlertEvaluator(db)
            ev.evaluate_all_active_sensor_rules()

        assert not db.add.called

    def test_definition_with_no_schema_skipped(self):
        db = MagicMock()
        defn = _make_definition(sensor_id="s1", datastream_id="ds1")
        defn.project.schema_name = None

        db.query.return_value.options.return_value.filter.return_value.all.return_value = [
            defn
        ]

        ev = AlertEvaluator(db)
        ev.evaluate_all_active_sensor_rules()
        # No ThingService calls expected

    def test_per_definition_exception_caught(self):
        db = MagicMock()
        defn = _make_definition(sensor_id="s1", datastream_id="ds1")

        db.query.return_value.options.return_value.filter.return_value.all.return_value = [
            defn
        ]

        with patch("app.services.thing_service.ThingService") as MockTS:
            instance = MockTS.return_value
            instance.get_observations.side_effect = RuntimeError("network error")

            ev = AlertEvaluator(db)
            ev.evaluate_all_active_sensor_rules()  # should not raise

    def test_outer_exception_caught(self):
        db = MagicMock()
        db.query.side_effect = RuntimeError("db down")
        ev = AlertEvaluator(db)
        ev.evaluate_all_active_sensor_rules()  # should not raise


# ---------------------------------------------------------------------------
# evaluate_all_active_qaqc_rules
# ---------------------------------------------------------------------------


class TestEvaluateAllActiveQaqcRules:
    def _patch_psycopg2_and_settings(self):
        """Return patches for psycopg2.connect and settings."""
        patcher_pg = patch("psycopg2.connect")
        patcher_settings = patch("app.core.config.settings")
        return patcher_pg, patcher_settings

    def test_no_definitions_returns_early(self):
        db = MagicMock()
        db.query.return_value.options.return_value.filter.return_value.all.return_value = []
        ev = AlertEvaluator(db)
        ev.evaluate_all_active_qaqc_rules()

    def test_triggered_creates_alert(self):
        db = MagicMock()
        defn = _make_definition(
            alert_type="qaqc",
            datastream_id="123",
            conditions={"flag_level": "BAD", "threshold_pct": 10, "window_hours": 24},
        )

        db.query.return_value.options.return_value.filter.return_value.all.return_value = [
            defn
        ]

        # Mock psycopg2 cursor returning 100 total, 50 flagged (50%)
        mock_cursor = MagicMock()
        mock_cursor.fetchone.return_value = (100, 50)
        mock_cursor.__enter__ = MagicMock(return_value=mock_cursor)
        mock_cursor.__exit__ = MagicMock(return_value=False)

        mock_conn = MagicMock()
        mock_conn.cursor.return_value = mock_cursor

        # Alert dedup check
        def qse(model):
            if model is Alert:
                m = MagicMock()
                m.filter.return_value.first.return_value = None
                return m
            return MagicMock()

        with (
            patch("psycopg2.connect", return_value=mock_conn),
            patch("app.core.config.settings"),
        ):
            # Re-assign query side effect after the initial query for definitions
            _original_query = db.query

            call_idx = [0]

            def smart_query(model):
                call_idx[0] += 1
                if model is AlertDefinition:
                    m = MagicMock()
                    m.options.return_value.filter.return_value.all.return_value = [defn]
                    return m
                if model is Alert:
                    m = MagicMock()
                    m.filter.return_value.first.return_value = None
                    return m
                return MagicMock()

            db.query.side_effect = smart_query

            ev = AlertEvaluator(db)
            ev.evaluate_all_active_qaqc_rules()

        assert db.add.called

    def test_below_threshold_resolves_existing(self):
        db = MagicMock()
        defn = _make_definition(
            alert_type="qaqc",
            datastream_id="123",
            conditions={"flag_level": "BAD", "threshold_pct": 50, "window_hours": 24},
        )

        db.query.return_value.options.return_value.filter.return_value.all.return_value = [
            defn
        ]

        # 100 total, 5 flagged = 5% < 50% threshold
        mock_cursor = MagicMock()
        mock_cursor.fetchone.return_value = (100, 5)
        mock_cursor.__enter__ = MagicMock(return_value=mock_cursor)
        mock_cursor.__exit__ = MagicMock(return_value=False)

        mock_conn = MagicMock()
        mock_conn.cursor.return_value = mock_cursor

        existing_alert = MagicMock(spec=Alert)
        existing_alert.status = "active"

        def smart_query(model):
            if model is AlertDefinition:
                m = MagicMock()
                m.options.return_value.filter.return_value.all.return_value = [defn]
                return m
            if model is Alert:
                m = MagicMock()
                m.filter.return_value.first.return_value = existing_alert
                return m
            return MagicMock()

        db.query.side_effect = smart_query

        with (
            patch("psycopg2.connect", return_value=mock_conn),
            patch("app.core.config.settings"),
        ):
            ev = AlertEvaluator(db)
            ev.evaluate_all_active_qaqc_rules()

        assert existing_alert.status == "resolved"
        db.commit.assert_called()

    def test_below_threshold_no_existing_alert(self):
        db = MagicMock()
        defn = _make_definition(
            alert_type="qaqc",
            datastream_id="123",
            conditions={"flag_level": "BAD", "threshold_pct": 50, "window_hours": 24},
        )

        mock_cursor = MagicMock()
        mock_cursor.fetchone.return_value = (100, 5)
        mock_cursor.__enter__ = MagicMock(return_value=mock_cursor)
        mock_cursor.__exit__ = MagicMock(return_value=False)

        mock_conn = MagicMock()
        mock_conn.cursor.return_value = mock_cursor

        def smart_query(model):
            if model is AlertDefinition:
                m = MagicMock()
                m.options.return_value.filter.return_value.all.return_value = [defn]
                return m
            if model is Alert:
                m = MagicMock()
                m.filter.return_value.first.return_value = None
                return m
            return MagicMock()

        db.query.side_effect = smart_query

        with (
            patch("psycopg2.connect", return_value=mock_conn),
            patch("app.core.config.settings"),
        ):
            ev = AlertEvaluator(db)
            ev.evaluate_all_active_qaqc_rules()

        assert not db.add.called

    def test_no_rows_skipped(self):
        db = MagicMock()
        defn = _make_definition(
            alert_type="qaqc",
            datastream_id="123",
            conditions={"flag_level": "BAD", "threshold_pct": 10, "window_hours": 24},
        )

        db.query.return_value.options.return_value.filter.return_value.all.return_value = [
            defn
        ]

        mock_cursor = MagicMock()
        mock_cursor.fetchone.return_value = None
        mock_cursor.__enter__ = MagicMock(return_value=mock_cursor)
        mock_cursor.__exit__ = MagicMock(return_value=False)

        mock_conn = MagicMock()
        mock_conn.cursor.return_value = mock_cursor

        with (
            patch("psycopg2.connect", return_value=mock_conn),
            patch("app.core.config.settings"),
        ):
            ev = AlertEvaluator(db)
            ev.evaluate_all_active_qaqc_rules()

        assert not db.add.called

    def test_zero_total_skipped(self):
        db = MagicMock()
        defn = _make_definition(
            alert_type="qaqc",
            datastream_id="123",
            conditions={
                "flag_level": "QUESTIONABLE",
                "threshold_pct": 10,
                "window_hours": 48,
            },
        )

        db.query.return_value.options.return_value.filter.return_value.all.return_value = [
            defn
        ]

        mock_cursor = MagicMock()
        mock_cursor.fetchone.return_value = (0, 0)
        mock_cursor.__enter__ = MagicMock(return_value=mock_cursor)
        mock_cursor.__exit__ = MagicMock(return_value=False)

        mock_conn = MagicMock()
        mock_conn.cursor.return_value = mock_cursor

        with (
            patch("psycopg2.connect", return_value=mock_conn),
            patch("app.core.config.settings"),
        ):
            ev = AlertEvaluator(db)
            ev.evaluate_all_active_qaqc_rules()

        assert not db.add.called

    def test_no_schema_skipped(self):
        db = MagicMock()
        defn = _make_definition(alert_type="qaqc", datastream_id="123")
        defn.project.schema_name = None

        db.query.return_value.options.return_value.filter.return_value.all.return_value = [
            defn
        ]

        mock_cursor = MagicMock()
        mock_cursor.__enter__ = MagicMock(return_value=mock_cursor)
        mock_cursor.__exit__ = MagicMock(return_value=False)

        mock_conn = MagicMock()
        mock_conn.cursor.return_value = mock_cursor

        with (
            patch("psycopg2.connect", return_value=mock_conn),
            patch("app.core.config.settings"),
        ):
            ev = AlertEvaluator(db)
            ev.evaluate_all_active_qaqc_rules()

        assert not mock_cursor.execute.called

    def test_no_project_skipped(self):
        db = MagicMock()
        defn = _make_definition(alert_type="qaqc", datastream_id="123")
        defn.project = None

        db.query.return_value.options.return_value.filter.return_value.all.return_value = [
            defn
        ]

        mock_cursor = MagicMock()
        mock_cursor.__enter__ = MagicMock(return_value=mock_cursor)
        mock_cursor.__exit__ = MagicMock(return_value=False)

        mock_conn = MagicMock()
        mock_conn.cursor.return_value = mock_cursor

        with (
            patch("psycopg2.connect", return_value=mock_conn),
            patch("app.core.config.settings"),
        ):
            ev = AlertEvaluator(db)
            ev.evaluate_all_active_qaqc_rules()

        assert not mock_cursor.execute.called

    def test_per_definition_exception_caught(self):
        db = MagicMock()
        defn = _make_definition(alert_type="qaqc", datastream_id="123")

        db.query.return_value.options.return_value.filter.return_value.all.return_value = [
            defn
        ]

        mock_cursor = MagicMock()
        mock_cursor.execute.side_effect = RuntimeError("sql error")
        mock_cursor.__enter__ = MagicMock(return_value=mock_cursor)
        mock_cursor.__exit__ = MagicMock(return_value=False)

        mock_conn = MagicMock()
        mock_conn.cursor.return_value = mock_cursor

        with (
            patch("psycopg2.connect", return_value=mock_conn),
            patch("app.core.config.settings"),
        ):
            ev = AlertEvaluator(db)
            ev.evaluate_all_active_qaqc_rules()  # should not raise

    def test_outer_exception_caught(self):
        db = MagicMock()
        db.query.side_effect = RuntimeError("boom")
        ev = AlertEvaluator(db)
        ev.evaluate_all_active_qaqc_rules()  # should not raise

    def test_conn_closed_even_on_error(self):
        db = MagicMock()
        defn = _make_definition(alert_type="qaqc", datastream_id="123")

        db.query.return_value.options.return_value.filter.return_value.all.return_value = [
            defn
        ]

        mock_conn = MagicMock()
        mock_conn.cursor.side_effect = RuntimeError("cursor fail")

        with (
            patch("psycopg2.connect", return_value=mock_conn),
            patch("app.core.config.settings"),
        ):
            ev = AlertEvaluator(db)
            ev.evaluate_all_active_qaqc_rules()

        mock_conn.close.assert_called_once()

    def test_flag_level_any(self):
        """Test that flag_level=ANY uses threshold 0.0."""
        db = MagicMock()
        defn = _make_definition(
            alert_type="qaqc",
            datastream_id="123",
            conditions={"flag_level": "ANY", "threshold_pct": 5, "window_hours": 12},
        )

        mock_cursor = MagicMock()
        mock_cursor.fetchone.return_value = (200, 20)  # 10% >= 5%
        mock_cursor.__enter__ = MagicMock(return_value=mock_cursor)
        mock_cursor.__exit__ = MagicMock(return_value=False)

        mock_conn = MagicMock()
        mock_conn.cursor.return_value = mock_cursor

        def smart_query(model):
            if model is AlertDefinition:
                m = MagicMock()
                m.options.return_value.filter.return_value.all.return_value = [defn]
                return m
            if model is Alert:
                m = MagicMock()
                m.filter.return_value.first.return_value = None
                return m
            return MagicMock()

        db.query.side_effect = smart_query

        with (
            patch("psycopg2.connect", return_value=mock_conn),
            patch("app.core.config.settings"),
        ):
            ev = AlertEvaluator(db)
            ev.evaluate_all_active_qaqc_rules()

        assert db.add.called
        # Verify the min_flag_value passed to SQL is 0.0 (ANY threshold)
        execute_args = mock_cursor.execute.call_args
        params = execute_args[0][1]
        assert params[0] == 0.0

    def test_default_conditions(self):
        """Test defaults when conditions dict is empty."""
        db = MagicMock()
        defn = _make_definition(
            alert_type="qaqc",
            datastream_id="456",
            conditions={},  # all defaults
        )

        mock_cursor = MagicMock()
        mock_cursor.fetchone.return_value = (100, 15)  # 15% >= 10% default
        mock_cursor.__enter__ = MagicMock(return_value=mock_cursor)
        mock_cursor.__exit__ = MagicMock(return_value=False)

        mock_conn = MagicMock()
        mock_conn.cursor.return_value = mock_cursor

        def smart_query(model):
            if model is AlertDefinition:
                m = MagicMock()
                m.options.return_value.filter.return_value.all.return_value = [defn]
                return m
            if model is Alert:
                m = MagicMock()
                m.filter.return_value.first.return_value = None
                return m
            return MagicMock()

        db.query.side_effect = smart_query

        with (
            patch("psycopg2.connect", return_value=mock_conn),
            patch("app.core.config.settings"),
        ):
            ev = AlertEvaluator(db)
            ev.evaluate_all_active_qaqc_rules()

        assert db.add.called
        # Default flag_level "BAD" -> 255.0
        execute_args = mock_cursor.execute.call_args
        params = execute_args[0][1]
        assert params[0] == 255.0

    def test_conditions_none_uses_defaults(self):
        """When conditions is None, `conditions or {}` yields empty dict."""
        db = MagicMock()
        defn = _make_definition(
            alert_type="qaqc",
            datastream_id="456",
            conditions=None,
        )

        mock_cursor = MagicMock()
        mock_cursor.fetchone.return_value = (50, 10)  # 20% >= 10%
        mock_cursor.__enter__ = MagicMock(return_value=mock_cursor)
        mock_cursor.__exit__ = MagicMock(return_value=False)

        mock_conn = MagicMock()
        mock_conn.cursor.return_value = mock_cursor

        def smart_query(model):
            if model is AlertDefinition:
                m = MagicMock()
                m.options.return_value.filter.return_value.all.return_value = [defn]
                return m
            if model is Alert:
                m = MagicMock()
                m.filter.return_value.first.return_value = None
                return m
            return MagicMock()

        db.query.side_effect = smart_query

        with (
            patch("psycopg2.connect", return_value=mock_conn),
            patch("app.core.config.settings"),
        ):
            ev = AlertEvaluator(db)
            ev.evaluate_all_active_qaqc_rules()

        assert db.add.called


# ---------------------------------------------------------------------------
# evaluate_qaqc_rules_for_thing
# ---------------------------------------------------------------------------


class TestEvaluateQaqcRulesForThing:
    def test_no_definitions_returns_early(self):
        db = MagicMock()
        db.query.return_value.options.return_value.filter.return_value.all.return_value = []
        ev = AlertEvaluator(db)
        ev.evaluate_qaqc_rules_for_thing("proj-uuid", "thing-uuid")

    def test_triggered_creates_alert(self):
        db = MagicMock()
        defn = _make_definition(
            alert_type="qaqc",
            datastream_id="789",
            conditions={"flag_level": "BAD", "threshold_pct": 10, "window_hours": 24},
        )

        mock_cursor = MagicMock()
        mock_cursor.fetchone.return_value = (100, 30)  # 30% >= 10%
        mock_cursor.__enter__ = MagicMock(return_value=mock_cursor)
        mock_cursor.__exit__ = MagicMock(return_value=False)

        mock_conn = MagicMock()
        mock_conn.cursor.return_value = mock_cursor

        def smart_query(model):
            if model is AlertDefinition:
                m = MagicMock()
                m.options.return_value.filter.return_value.all.return_value = [defn]
                return m
            if model is Alert:
                m = MagicMock()
                m.filter.return_value.first.return_value = None
                return m
            return MagicMock()

        db.query.side_effect = smart_query

        with (
            patch("psycopg2.connect", return_value=mock_conn),
            patch("app.core.config.settings"),
        ):
            ev = AlertEvaluator(db)
            ev.evaluate_qaqc_rules_for_thing("proj-uuid", "thing-uuid")

        assert db.add.called
        alert = db.add.call_args[0][0]
        assert "flagged" in alert.message

    def test_below_threshold_resolves(self):
        db = MagicMock()
        defn = _make_definition(
            alert_type="qaqc",
            datastream_id="789",
            conditions={"flag_level": "BAD", "threshold_pct": 50, "window_hours": 24},
        )

        mock_cursor = MagicMock()
        mock_cursor.fetchone.return_value = (100, 5)  # 5% < 50%
        mock_cursor.__enter__ = MagicMock(return_value=mock_cursor)
        mock_cursor.__exit__ = MagicMock(return_value=False)

        mock_conn = MagicMock()
        mock_conn.cursor.return_value = mock_cursor

        existing_alert = MagicMock(spec=Alert)
        existing_alert.status = "active"

        def smart_query(model):
            if model is AlertDefinition:
                m = MagicMock()
                m.options.return_value.filter.return_value.all.return_value = [defn]
                return m
            if model is Alert:
                m = MagicMock()
                m.filter.return_value.first.return_value = existing_alert
                return m
            return MagicMock()

        db.query.side_effect = smart_query

        with (
            patch("psycopg2.connect", return_value=mock_conn),
            patch("app.core.config.settings"),
        ):
            ev = AlertEvaluator(db)
            ev.evaluate_qaqc_rules_for_thing("proj-uuid", "thing-uuid")

        assert existing_alert.status == "resolved"
        db.commit.assert_called()

    def test_below_threshold_no_existing(self):
        db = MagicMock()
        defn = _make_definition(
            alert_type="qaqc",
            datastream_id="789",
            conditions={"flag_level": "BAD", "threshold_pct": 50, "window_hours": 24},
        )

        mock_cursor = MagicMock()
        mock_cursor.fetchone.return_value = (100, 5)
        mock_cursor.__enter__ = MagicMock(return_value=mock_cursor)
        mock_cursor.__exit__ = MagicMock(return_value=False)

        mock_conn = MagicMock()
        mock_conn.cursor.return_value = mock_cursor

        def smart_query(model):
            if model is AlertDefinition:
                m = MagicMock()
                m.options.return_value.filter.return_value.all.return_value = [defn]
                return m
            if model is Alert:
                m = MagicMock()
                m.filter.return_value.first.return_value = None
                return m
            return MagicMock()

        db.query.side_effect = smart_query

        with (
            patch("psycopg2.connect", return_value=mock_conn),
            patch("app.core.config.settings"),
        ):
            ev = AlertEvaluator(db)
            ev.evaluate_qaqc_rules_for_thing("proj-uuid", "thing-uuid")

        assert not db.add.called

    def test_no_rows_skipped(self):
        db = MagicMock()
        defn = _make_definition(alert_type="qaqc", datastream_id="789")

        db.query.return_value.options.return_value.filter.return_value.all.return_value = [
            defn
        ]

        mock_cursor = MagicMock()
        mock_cursor.fetchone.return_value = None
        mock_cursor.__enter__ = MagicMock(return_value=mock_cursor)
        mock_cursor.__exit__ = MagicMock(return_value=False)

        mock_conn = MagicMock()
        mock_conn.cursor.return_value = mock_cursor

        with (
            patch("psycopg2.connect", return_value=mock_conn),
            patch("app.core.config.settings"),
        ):
            ev = AlertEvaluator(db)
            ev.evaluate_qaqc_rules_for_thing("proj-uuid", "thing-uuid")

        assert not db.add.called

    def test_zero_total_skipped(self):
        db = MagicMock()
        defn = _make_definition(alert_type="qaqc", datastream_id="789")

        db.query.return_value.options.return_value.filter.return_value.all.return_value = [
            defn
        ]

        mock_cursor = MagicMock()
        mock_cursor.fetchone.return_value = (0, 0)
        mock_cursor.__enter__ = MagicMock(return_value=mock_cursor)
        mock_cursor.__exit__ = MagicMock(return_value=False)

        mock_conn = MagicMock()
        mock_conn.cursor.return_value = mock_cursor

        with (
            patch("psycopg2.connect", return_value=mock_conn),
            patch("app.core.config.settings"),
        ):
            ev = AlertEvaluator(db)
            ev.evaluate_qaqc_rules_for_thing("proj-uuid", "thing-uuid")

        assert not db.add.called

    def test_no_schema_skipped(self):
        db = MagicMock()
        defn = _make_definition(alert_type="qaqc", datastream_id="789")
        defn.project.schema_name = None

        db.query.return_value.options.return_value.filter.return_value.all.return_value = [
            defn
        ]

        mock_cursor = MagicMock()
        mock_cursor.__enter__ = MagicMock(return_value=mock_cursor)
        mock_cursor.__exit__ = MagicMock(return_value=False)

        mock_conn = MagicMock()
        mock_conn.cursor.return_value = mock_cursor

        with (
            patch("psycopg2.connect", return_value=mock_conn),
            patch("app.core.config.settings"),
        ):
            ev = AlertEvaluator(db)
            ev.evaluate_qaqc_rules_for_thing("proj-uuid", "thing-uuid")

        assert not mock_cursor.execute.called

    def test_no_project_skipped(self):
        db = MagicMock()
        defn = _make_definition(alert_type="qaqc", datastream_id="789")
        defn.project = None

        db.query.return_value.options.return_value.filter.return_value.all.return_value = [
            defn
        ]

        mock_cursor = MagicMock()
        mock_cursor.__enter__ = MagicMock(return_value=mock_cursor)
        mock_cursor.__exit__ = MagicMock(return_value=False)

        mock_conn = MagicMock()
        mock_conn.cursor.return_value = mock_cursor

        with (
            patch("psycopg2.connect", return_value=mock_conn),
            patch("app.core.config.settings"),
        ):
            ev = AlertEvaluator(db)
            ev.evaluate_qaqc_rules_for_thing("proj-uuid", "thing-uuid")

        assert not mock_cursor.execute.called

    def test_per_definition_exception_caught(self):
        db = MagicMock()
        defn = _make_definition(alert_type="qaqc", datastream_id="789")

        db.query.return_value.options.return_value.filter.return_value.all.return_value = [
            defn
        ]

        mock_cursor = MagicMock()
        mock_cursor.execute.side_effect = RuntimeError("sql error")
        mock_cursor.__enter__ = MagicMock(return_value=mock_cursor)
        mock_cursor.__exit__ = MagicMock(return_value=False)

        mock_conn = MagicMock()
        mock_conn.cursor.return_value = mock_cursor

        with (
            patch("psycopg2.connect", return_value=mock_conn),
            patch("app.core.config.settings"),
        ):
            ev = AlertEvaluator(db)
            ev.evaluate_qaqc_rules_for_thing("proj-uuid", "thing-uuid")

    def test_outer_exception_caught(self):
        db = MagicMock()
        db.query.side_effect = RuntimeError("boom")
        ev = AlertEvaluator(db)
        ev.evaluate_qaqc_rules_for_thing("proj-uuid", "thing-uuid")

    def test_conn_closed_on_success(self):
        db = MagicMock()
        defn = _make_definition(alert_type="qaqc", datastream_id="789")

        db.query.return_value.options.return_value.filter.return_value.all.return_value = [
            defn
        ]

        mock_cursor = MagicMock()
        mock_cursor.fetchone.return_value = None
        mock_cursor.__enter__ = MagicMock(return_value=mock_cursor)
        mock_cursor.__exit__ = MagicMock(return_value=False)

        mock_conn = MagicMock()
        mock_conn.cursor.return_value = mock_cursor

        with (
            patch("psycopg2.connect", return_value=mock_conn),
            patch("app.core.config.settings"),
        ):
            ev = AlertEvaluator(db)
            ev.evaluate_qaqc_rules_for_thing("proj-uuid", "thing-uuid")

        mock_conn.close.assert_called_once()

    def test_questionable_flag_level(self):
        db = MagicMock()
        defn = _make_definition(
            alert_type="qaqc",
            datastream_id="789",
            conditions={
                "flag_level": "QUESTIONABLE",
                "threshold_pct": 5,
                "window_hours": 6,
            },
        )

        mock_cursor = MagicMock()
        mock_cursor.fetchone.return_value = (100, 20)  # 20% >= 5%
        mock_cursor.__enter__ = MagicMock(return_value=mock_cursor)
        mock_cursor.__exit__ = MagicMock(return_value=False)

        mock_conn = MagicMock()
        mock_conn.cursor.return_value = mock_cursor

        def smart_query(model):
            if model is AlertDefinition:
                m = MagicMock()
                m.options.return_value.filter.return_value.all.return_value = [defn]
                return m
            if model is Alert:
                m = MagicMock()
                m.filter.return_value.first.return_value = None
                return m
            return MagicMock()

        db.query.side_effect = smart_query

        with (
            patch("psycopg2.connect", return_value=mock_conn),
            patch("app.core.config.settings"),
        ):
            ev = AlertEvaluator(db)
            ev.evaluate_qaqc_rules_for_thing("proj-uuid", "thing-uuid")

        assert db.add.called
        execute_args = mock_cursor.execute.call_args
        params = execute_args[0][1]
        assert params[0] == 2.0  # QUESTIONABLE threshold

    def test_unknown_flag_level_defaults_to_bad(self):
        """Unknown flag_level falls through .get() to default 255.0."""
        db = MagicMock()
        defn = _make_definition(
            alert_type="qaqc",
            datastream_id="789",
            conditions={
                "flag_level": "UNKNOWN_LEVEL",
                "threshold_pct": 5,
                "window_hours": 6,
            },
        )

        mock_cursor = MagicMock()
        mock_cursor.fetchone.return_value = (100, 10)  # 10% >= 5%
        mock_cursor.__enter__ = MagicMock(return_value=mock_cursor)
        mock_cursor.__exit__ = MagicMock(return_value=False)

        mock_conn = MagicMock()
        mock_conn.cursor.return_value = mock_cursor

        def smart_query(model):
            if model is AlertDefinition:
                m = MagicMock()
                m.options.return_value.filter.return_value.all.return_value = [defn]
                return m
            if model is Alert:
                m = MagicMock()
                m.filter.return_value.first.return_value = None
                return m
            return MagicMock()

        db.query.side_effect = smart_query

        with (
            patch("psycopg2.connect", return_value=mock_conn),
            patch("app.core.config.settings"),
        ):
            ev = AlertEvaluator(db)
            ev.evaluate_qaqc_rules_for_thing("proj-uuid", "thing-uuid")

        execute_args = mock_cursor.execute.call_args
        params = execute_args[0][1]
        assert params[0] == 255.0  # default fallback


# ---------------------------------------------------------------------------
# _evaluate_definition (direct unit tests for edge cases)
# ---------------------------------------------------------------------------


class TestEvaluateDefinitionDirect:
    def test_unknown_operator_does_not_trigger(self):
        db = MagicMock()
        defn = _make_definition(
            conditions={"field": "x", "operator": "!=", "value": 5},
        )
        ev = AlertEvaluator(db)
        ev._evaluate_definition(defn, {"x": 10})
        assert not db.add.called

    def test_value_zero_threshold_is_valid(self):
        """value=0 should not be treated as missing (threshold is None check)."""
        db = MagicMock()
        defn = _make_definition(
            conditions={"field": "score", "operator": ">", "value": 0},
        )

        db.query.return_value.filter.return_value.first.return_value = None

        ev = AlertEvaluator(db)
        ev._evaluate_definition(defn, {"score": 5})
        assert db.add.called

    def test_float_conversion_error_caught(self):
        """Non-numeric actual_value in > comparison triggers exception path."""
        db = MagicMock()
        defn = _make_definition(
            conditions={"field": "x", "operator": ">", "value": 10},
        )
        ev = AlertEvaluator(db)
        # "abc" cannot be float(), exception caught by outer try/except
        ev._evaluate_definition(defn, {"x": "abc"})
        assert not db.add.called


# ---------------------------------------------------------------------------
# _evaluate_sensor_definition (direct unit tests)
# ---------------------------------------------------------------------------


class TestEvaluateSensorDefinitionDirect:
    def test_unknown_operator_does_not_trigger(self):
        db = MagicMock()
        defn = _make_definition(conditions={"operator": ">=", "value": 10})
        ev = AlertEvaluator(db)
        ev._evaluate_sensor_definition(defn, 15)
        assert not db.add.called

    def test_exact_threshold_gt_does_not_trigger(self):
        db = MagicMock()
        defn = _make_definition(conditions={"operator": ">", "value": 10})
        ev = AlertEvaluator(db)
        ev._evaluate_sensor_definition(defn, 10)
        assert not db.add.called

    def test_exact_threshold_lt_does_not_trigger(self):
        db = MagicMock()
        defn = _make_definition(conditions={"operator": "<", "value": 10})
        ev = AlertEvaluator(db)
        ev._evaluate_sensor_definition(defn, 10)
        assert not db.add.called

    def test_exact_threshold_eq_triggers(self):
        db = MagicMock()
        defn = _make_definition(conditions={"operator": "==", "value": 10})
        db.query.return_value.filter.return_value.first.return_value = None
        ev = AlertEvaluator(db)
        ev._evaluate_sensor_definition(defn, 10)
        assert db.add.called

    def test_string_value_returns_early(self):
        db = MagicMock()
        defn = _make_definition(conditions={"operator": ">", "value": 10})
        ev = AlertEvaluator(db)
        ev._evaluate_sensor_definition(defn, "not_a_number")
        assert not db.add.called

    def test_none_value_returns_early(self):
        db = MagicMock()
        defn = _make_definition(conditions={"operator": ">", "value": 10})
        ev = AlertEvaluator(db)
        ev._evaluate_sensor_definition(defn, None)
        assert not db.add.called
