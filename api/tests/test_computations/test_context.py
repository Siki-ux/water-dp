"""
Unit tests for ComputationContext.
"""

import uuid
from unittest.mock import MagicMock, patch

from app.computations.context import ComputationContext

FROST_PATCH = "app.services.timeio.frost_client.FrostClient"
SETTINGS_PATCH = "app.core.config.settings"


def _make_ctx(
    script_id=None,
    project_name="test_schema",
):
    """Build a ComputationContext with all external deps mocked."""
    script_id = script_id or uuid.uuid4()

    db = MagicMock()

    # script_obj query → project_id
    mock_script = MagicMock()
    mock_script.project_id = uuid.uuid4()

    # project query → schema_name
    mock_project = MagicMock()
    mock_project.schema_name = project_name

    # chain: db.query().filter().first()
    db.query.return_value.filter.return_value.first.side_effect = [
        mock_script,
        mock_project,
    ]

    with patch(FROST_PATCH) as MockFrost, patch(SETTINGS_PATCH) as mock_settings:
        mock_settings.frost_url = "http://frost:8080"
        mock_settings.frost_version = "v1.1"
        mock_settings.frost_server = "frost"

        mock_frost_instance = MagicMock()
        MockFrost.return_value = mock_frost_instance

        ctx = ComputationContext(
            db=db,
            job_id="job-1",
            script_id=script_id,
            params={},
        )

    # The frost client was already instantiated; swap in a fresh mock for test control
    ctx._frost_client = MagicMock()
    ctx.db = db
    return ctx


# ===========================================================================
# Constructor
# ===========================================================================


class TestComputationContextInit:
    def test_builds_frost_client_with_project_name(self):
        script_id = uuid.uuid4()
        db = MagicMock()

        mock_script = MagicMock()
        mock_script.project_id = uuid.uuid4()
        mock_project = MagicMock()
        mock_project.schema_name = "user_proj"

        db.query.return_value.filter.return_value.first.side_effect = [
            mock_script,
            mock_project,
        ]

        with patch(FROST_PATCH) as MockFrost, patch(SETTINGS_PATCH) as s:
            s.frost_url = "http://frost:8080"
            s.frost_version = "v1.1"
            s.frost_server = "frost"

            ctx = ComputationContext(db=db, job_id="j", script_id=script_id, params={})

            MockFrost.assert_called_once_with(
                base_url="http://frost:8080",
                project_name="user_proj",
                version="v1.1",
                frost_server="frost",
            )
            assert ctx.job_id == "j"
            assert ctx.script_id == script_id

    def test_logs_warning_when_no_project_found(self):
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = (
            None  # script not found
        )

        with (
            patch(FROST_PATCH),
            patch(SETTINGS_PATCH) as s,
            patch("app.computations.context.logger") as mock_logger,
        ):
            s.frost_url = "http://frost"
            s.frost_version = "v1.1"
            s.frost_server = "frost"

            ComputationContext(db=db, job_id="j", script_id=uuid.uuid4(), params={})
            mock_logger.warning.assert_called_once()

    def test_no_project_name_when_script_missing(self):
        """If script not found, project_name stays None — FrostClient still constructed."""
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = None

        with patch(FROST_PATCH) as MockFrost, patch(SETTINGS_PATCH) as s:
            s.frost_url = "http://frost"
            s.frost_version = "v1.1"
            s.frost_server = "frost"

            ComputationContext(db=db, job_id="j", script_id=uuid.uuid4(), params={})
            MockFrost.assert_called_once()
            call_kwargs = MockFrost.call_args[1]
            assert call_kwargs["project_name"] is None

    def test_no_project_name_when_project_has_no_schema(self):
        """If project.schema_name is falsy, project_name stays None."""
        db = MagicMock()
        mock_script = MagicMock()
        mock_script.project_id = uuid.uuid4()
        mock_project = MagicMock()
        mock_project.schema_name = None

        db.query.return_value.filter.return_value.first.side_effect = [
            mock_script,
            mock_project,
        ]

        with patch(FROST_PATCH) as MockFrost, patch(SETTINGS_PATCH) as s:
            s.frost_url = "http://frost"
            s.frost_version = "v1.1"
            s.frost_server = "frost"

            ComputationContext(db=db, job_id="j", script_id=uuid.uuid4(), params={})
            call_kwargs = MockFrost.call_args[1]
            assert call_kwargs["project_name"] is None


# ===========================================================================
# get_sensor_data
# ===========================================================================


class TestGetSensorData:
    def test_returns_empty_when_no_datastreams(self):
        ctx = _make_ctx()
        ctx._frost_client.list_datastreams.return_value = []

        result = ctx.get_sensor_data("sensor-1")
        assert result == []

    def test_returns_observations_from_first_datastream(self):
        ctx = _make_ctx()
        ctx._frost_client.list_datastreams.return_value = [
            {"@iot.id": 10, "name": "Temperature"}
        ]
        ctx._frost_client.get_observations.return_value = [
            {"phenomenonTime": "2024-01-01T00:00:00Z", "result": 20.5}
        ]

        result = ctx.get_sensor_data("sensor-1", limit=1)
        assert len(result) == 1
        assert result[0]["result"] == 20.5

    def test_aggregates_observations_from_multiple_datastreams(self):
        ctx = _make_ctx()
        ctx._frost_client.list_datastreams.return_value = [
            {"@iot.id": 1},
            {"@iot.id": 2},
        ]
        ctx._frost_client.get_observations.side_effect = [
            [{"phenomenonTime": "2024-01-02T00:00:00Z", "result": 10}],
            [{"phenomenonTime": "2024-01-01T00:00:00Z", "result": 20}],
        ]

        result = ctx.get_sensor_data("sensor-1", limit=2)
        # Sorted by phenomenonTime descending: Jan 2 first
        assert result[0]["result"] == 10
        assert result[1]["result"] == 20

    def test_limit_applied_to_result(self):
        ctx = _make_ctx()
        ctx._frost_client.list_datastreams.return_value = [{"@iot.id": 1}]
        ctx._frost_client.get_observations.return_value = [
            {"phenomenonTime": "2024-01-03T00:00:00Z", "result": 1},
            {"phenomenonTime": "2024-01-02T00:00:00Z", "result": 2},
            {"phenomenonTime": "2024-01-01T00:00:00Z", "result": 3},
        ]

        result = ctx.get_sensor_data("sensor-1", limit=2)
        assert len(result) == 2

    def test_returns_empty_on_exception(self):
        ctx = _make_ctx()
        ctx._frost_client.list_datastreams.side_effect = Exception("FROST down")

        result = ctx.get_sensor_data("sensor-1")
        assert result == []


# ===========================================================================
# get_dataset
# ===========================================================================


class TestGetDataset:
    def test_returns_thing_data(self):
        ctx = _make_ctx()
        ctx._frost_client.get_thing.return_value = {"@iot.id": 5, "name": "Station"}

        result = ctx.get_dataset("ds-1")
        assert result["name"] == "Station"

    def test_returns_empty_dict_when_thing_is_none(self):
        ctx = _make_ctx()
        ctx._frost_client.get_thing.return_value = None

        result = ctx.get_dataset("ds-1")
        assert result == {}

    def test_returns_empty_dict_on_exception(self):
        ctx = _make_ctx()
        ctx._frost_client.get_thing.side_effect = Exception("Timeout")

        result = ctx.get_dataset("ds-1")
        assert result == {}


# ===========================================================================
# alert + _persist_alert
# ===========================================================================


class TestAlert:
    def test_alert_appends_to_internal_list(self):
        ctx = _make_ctx()
        ctx._frost_client  # ensure initialized

        # Stub _persist_alert to avoid DB interaction
        ctx._persist_alert = MagicMock()

        ctx.alert("Water level high", severity="critical")
        assert len(ctx._alerts_triggered) == 1
        assert ctx._alerts_triggered[0]["severity"] == "critical"
        assert ctx._alerts_triggered[0]["message"] == "Water level high"

    def test_alert_calls_persist(self):
        ctx = _make_ctx()
        ctx._persist_alert = MagicMock()

        ctx.alert("Test alert", details={"key": "val"}, severity="warning")
        ctx._persist_alert.assert_called_once_with(
            "Test alert", {"key": "val"}, "warning"
        )

    def test_alert_default_details_is_empty_dict(self):
        ctx = _make_ctx()
        ctx._persist_alert = MagicMock()

        ctx.alert("Bare alert")
        assert ctx._alerts_triggered[0]["details"] == {}

    def test_alert_timestamp_present(self):
        ctx = _make_ctx()
        ctx._persist_alert = MagicMock()

        ctx.alert("msg")
        assert "timestamp" in ctx._alerts_triggered[0]


class TestPersistAlert:
    def test_no_definitions_logs_warning(self):
        ctx = _make_ctx()
        ctx.db.query.return_value.filter.return_value.all.return_value = []

        with patch("app.computations.context.logger") as mock_logger:
            ctx._persist_alert("msg", {}, "warning")
            mock_logger.warning.assert_called_once()

    def test_saves_alert_for_each_definition(self):
        ctx = _make_ctx()

        mock_def1 = MagicMock()
        mock_def1.id = uuid.uuid4()
        mock_def2 = MagicMock()
        mock_def2.id = uuid.uuid4()

        ctx.db.query.return_value.filter.return_value.all.return_value = [
            mock_def1,
            mock_def2,
        ]

        ctx._persist_alert("Flood detected", {"level": 200}, "critical")

        assert ctx.db.add.call_count == 2
        ctx.db.commit.assert_called_once()

    def test_rollback_on_exception(self):
        ctx = _make_ctx()
        ctx.db.query.side_effect = Exception("DB error")

        # Should not raise
        ctx._persist_alert("msg", {}, "warning")
        ctx.db.rollback.assert_called_once()
