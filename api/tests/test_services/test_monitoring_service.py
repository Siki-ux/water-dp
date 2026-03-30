"""Comprehensive unit tests for MonitoringService."""

import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

import pytest

from app.models.alerts import Alert, AlertDefinition
from app.models.sensor_activity import SensorActivityConfig
from app.services.monitoring_service import _SFTP_INGEST_TYPES, MonitoringService

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def mock_db():
    return MagicMock()


@pytest.fixture
def mock_timeio_db():
    return MagicMock()


@pytest.fixture
def service(mock_db, mock_timeio_db):
    with patch(
        "app.services.monitoring_service.TimeIODatabase",
        return_value=mock_timeio_db,
    ):
        svc = MonitoringService(db=mock_db)
    return svc


@pytest.fixture
def thing_uuid():
    return str(uuid.uuid4())


@pytest.fixture
def project_id():
    return uuid.uuid4()


@pytest.fixture
def alert_def_id():
    return uuid.uuid4()


def _make_config(thing_uuid_str, project_id, **overrides):
    defaults = dict(
        id=uuid.uuid4(),
        thing_uuid=uuid.UUID(thing_uuid_str),
        project_id=project_id,
        track_activity=True,
        inactivity_threshold_hours=24,
        last_seen_at=datetime.now(timezone.utc),
    )
    defaults.update(overrides)
    config = MagicMock(spec=SensorActivityConfig)
    for k, v in defaults.items():
        setattr(config, k, v)
    return config


def _make_alert_def(project_id, alert_def_id=None):
    ad = MagicMock(spec=AlertDefinition)
    ad.id = alert_def_id or uuid.uuid4()
    ad.project_id = project_id
    ad.name = "Inactive Sensor"
    return ad


# ===========================================================================
# __init__
# ===========================================================================


class TestInit:
    def test_uses_provided_db(self, mock_db, mock_timeio_db):
        with patch(
            "app.services.monitoring_service.TimeIODatabase",
            return_value=mock_timeio_db,
        ):
            svc = MonitoringService(db=mock_db)
        assert svc.db is mock_db

    def test_creates_session_when_none(self, mock_timeio_db):
        mock_session = MagicMock()
        with (
            patch(
                "app.services.monitoring_service.TimeIODatabase",
                return_value=mock_timeio_db,
            ),
            patch(
                "app.services.monitoring_service.SessionLocal",
                return_value=mock_session,
            ),
        ):
            svc = MonitoringService(db=None)
        assert svc.db is mock_session

    def test_stats_initialized_empty(self, service):
        assert service.stats == {}


# ===========================================================================
# record_activity_for_thing
# ===========================================================================


class TestRecordActivityForThing:
    def test_noop_when_empty_string(self, service, mock_db):
        service.record_activity_for_thing("")
        mock_db.commit.assert_not_called()

    def test_noop_when_none(self, service, mock_db):
        service.record_activity_for_thing(None)
        mock_db.commit.assert_not_called()

    def test_noop_when_config_none(self, service, mock_db, thing_uuid):
        service._get_or_create_activity_config = MagicMock(return_value=None)
        service.record_activity_for_thing(thing_uuid)
        mock_db.commit.assert_not_called()

    def test_updates_last_seen_and_commits(
        self, service, mock_db, thing_uuid, project_id
    ):
        config = _make_config(thing_uuid, project_id)
        service._get_or_create_activity_config = MagicMock(return_value=config)
        # No alert definition found
        mock_db.query.return_value.filter.return_value.first.return_value = None

        service.record_activity_for_thing(thing_uuid)

        assert config.last_seen_at is not None
        mock_db.commit.assert_called()

    def test_resolves_existing_inactivity_alert(
        self, service, mock_db, thing_uuid, project_id, alert_def_id
    ):
        config = _make_config(thing_uuid, project_id)
        service._get_or_create_activity_config = MagicMock(return_value=config)

        alert_def = _make_alert_def(project_id, alert_def_id)
        mock_db.query.return_value.filter.return_value.first.return_value = alert_def

        service._get_thing_name = MagicMock(return_value="Sensor-A")
        service._resolve_alert = MagicMock()

        service.record_activity_for_thing(thing_uuid)

        service._resolve_alert.assert_called_once_with(alert_def, "Sensor-A")

    def test_no_resolve_when_no_alert_def(
        self, service, mock_db, thing_uuid, project_id
    ):
        config = _make_config(thing_uuid, project_id)
        service._get_or_create_activity_config = MagicMock(return_value=config)
        mock_db.query.return_value.filter.return_value.first.return_value = None

        service._resolve_alert = MagicMock()
        service.record_activity_for_thing(thing_uuid)

        service._resolve_alert.assert_not_called()

    def test_no_resolve_when_thing_name_none(
        self, service, mock_db, thing_uuid, project_id
    ):
        config = _make_config(thing_uuid, project_id)
        service._get_or_create_activity_config = MagicMock(return_value=config)

        alert_def = _make_alert_def(project_id)
        mock_db.query.return_value.filter.return_value.first.return_value = alert_def

        service._get_thing_name = MagicMock(return_value=None)
        service._resolve_alert = MagicMock()

        service.record_activity_for_thing(thing_uuid)

        service._resolve_alert.assert_not_called()


# ===========================================================================
# check_inactive_sensors
# ===========================================================================


class TestCheckInactiveSensors:
    def test_returns_stats_empty_configs(self, service, mock_db):
        mock_db.query.return_value.filter.return_value.all.return_value = []
        stats = service.check_inactive_sensors()
        assert stats["tracked"] == 0
        assert stats["inactive"] == 0
        assert stats["active"] == 0

    def test_active_sensor_counted(self, service, mock_db, thing_uuid, project_id):
        config = _make_config(
            thing_uuid,
            project_id,
            last_seen_at=datetime.now(timezone.utc) - timedelta(hours=1),
            inactivity_threshold_hours=24,
        )
        mock_db.query.return_value.filter.return_value.all.return_value = [config]

        service._get_or_create_alert_definition = MagicMock(
            return_value=_make_alert_def(project_id)
        )
        service._get_thing_name = MagicMock(return_value="Sensor-A")
        service._resolve_alert = MagicMock()
        service._update_frost_status = MagicMock()

        stats = service.check_inactive_sensors()

        assert stats["tracked"] == 1
        assert stats["active"] == 1
        assert stats["inactive"] == 0

    def test_inactive_sensor_counted(self, service, mock_db, thing_uuid, project_id):
        config = _make_config(
            thing_uuid,
            project_id,
            last_seen_at=datetime.now(timezone.utc) - timedelta(hours=48),
            inactivity_threshold_hours=24,
        )
        mock_db.query.return_value.filter.return_value.all.return_value = [config]

        service._get_or_create_alert_definition = MagicMock(
            return_value=_make_alert_def(project_id)
        )
        service._get_thing_name = MagicMock(return_value="Sensor-A")
        service._ensure_alert_active = MagicMock()
        service._update_frost_status = MagicMock()

        stats = service.check_inactive_sensors()

        assert stats["inactive"] == 1
        service._ensure_alert_active.assert_called_once()

    def test_inactive_when_last_seen_none(
        self, service, mock_db, thing_uuid, project_id
    ):
        config = _make_config(
            thing_uuid,
            project_id,
            last_seen_at=None,
            inactivity_threshold_hours=24,
        )
        mock_db.query.return_value.filter.return_value.all.return_value = [config]

        service._get_or_create_alert_definition = MagicMock(
            return_value=_make_alert_def(project_id)
        )
        service._get_thing_name = MagicMock(return_value="Sensor-A")
        service._ensure_alert_active = MagicMock()
        service._update_frost_status = MagicMock()

        stats = service.check_inactive_sensors()

        assert stats["inactive"] == 1

    def test_exception_in_check_increments_errors(
        self, service, mock_db, thing_uuid, project_id
    ):
        config = _make_config(thing_uuid, project_id)
        mock_db.query.return_value.filter.return_value.all.return_value = [config]

        service._check_config_inactivity = MagicMock(side_effect=RuntimeError("boom"))

        stats = service.check_inactive_sensors()

        assert stats["errors"] == 1
        assert stats["tracked"] == 1

    def test_skips_sensor_when_thing_name_none(
        self, service, mock_db, thing_uuid, project_id
    ):
        config = _make_config(
            thing_uuid,
            project_id,
            last_seen_at=None,
            inactivity_threshold_hours=24,
        )
        mock_db.query.return_value.filter.return_value.all.return_value = [config]

        service._get_or_create_alert_definition = MagicMock(
            return_value=_make_alert_def(project_id)
        )
        service._get_thing_name = MagicMock(return_value=None)
        service._ensure_alert_active = MagicMock()
        service._update_frost_status = MagicMock()

        stats = service.check_inactive_sensors()

        service._ensure_alert_active.assert_not_called()
        # Should not count as inactive or active because it returned early
        assert stats["inactive"] == 0
        assert stats["active"] == 0


# ===========================================================================
# _check_config_inactivity
# ===========================================================================


class TestCheckConfigInactivity:
    def test_naive_last_seen_made_aware(self, service, thing_uuid, project_id):
        """A naive datetime from DB should be treated as UTC."""
        naive_dt = datetime(2024, 1, 1, 0, 0, 0)  # no tzinfo
        config = _make_config(
            thing_uuid,
            project_id,
            last_seen_at=naive_dt,
            inactivity_threshold_hours=24,
        )

        service._get_or_create_alert_definition = MagicMock(
            return_value=_make_alert_def(project_id)
        )
        service._get_thing_name = MagicMock(return_value="Sensor-A")
        service._ensure_alert_active = MagicMock()
        service._update_frost_status = MagicMock()
        service.stats = {
            "inactive": 0,
            "active": 0,
            "alerts_created": 0,
            "alerts_resolved": 0,
        }

        now = datetime.now(timezone.utc)
        service._check_config_inactivity(config, now)

        # naive_dt is old, should be inactive
        service._ensure_alert_active.assert_called_once()

    def test_active_sensor_resolves_alert(self, service, thing_uuid, project_id):
        recent = datetime.now(timezone.utc) - timedelta(hours=1)
        config = _make_config(
            thing_uuid,
            project_id,
            last_seen_at=recent,
            inactivity_threshold_hours=24,
        )

        alert_def = _make_alert_def(project_id)
        service._get_or_create_alert_definition = MagicMock(return_value=alert_def)
        service._get_thing_name = MagicMock(return_value="Sensor-A")
        service._resolve_alert = MagicMock()
        service._update_frost_status = MagicMock()
        service.stats = {
            "inactive": 0,
            "active": 0,
            "alerts_created": 0,
            "alerts_resolved": 0,
        }

        service._check_config_inactivity(config, datetime.now(timezone.utc))

        service._resolve_alert.assert_called_once_with(alert_def, "Sensor-A")
        assert service.stats["active"] == 1


# ===========================================================================
# _get_or_create_alert_definition
# ===========================================================================


class TestGetOrCreateAlertDefinition:
    def test_returns_existing(self, service, mock_db, project_id):
        existing = _make_alert_def(project_id)
        mock_db.query.return_value.filter.return_value.first.return_value = existing

        result = service._get_or_create_alert_definition(project_id)

        assert result is existing
        mock_db.add.assert_not_called()

    def test_creates_when_missing(self, service, mock_db, project_id):
        mock_db.query.return_value.filter.return_value.first.return_value = None

        service._get_or_create_alert_definition(project_id)

        mock_db.add.assert_called_once()
        mock_db.commit.assert_called()
        mock_db.refresh.assert_called_once()
        added = mock_db.add.call_args[0][0]
        assert isinstance(added, AlertDefinition)
        assert added.name == "Inactive Sensor"
        assert added.alert_type == "nodata"
        assert added.project_id == project_id


# ===========================================================================
# _ensure_alert_active
# ===========================================================================


class TestEnsureAlertActive:
    def test_creates_alert_when_no_existing(self, service, mock_db, project_id):
        service.stats = {"alerts_created": 0}
        alert_def = _make_alert_def(project_id)
        mock_db.query.return_value.filter.return_value.first.return_value = None

        last_activity = datetime(2024, 6, 1, 12, 0, 0, tzinfo=timezone.utc)
        service._ensure_alert_active(alert_def, "Sensor-A", last_activity)

        mock_db.add.assert_called_once()
        added = mock_db.add.call_args[0][0]
        assert isinstance(added, Alert)
        assert "Sensor-A" in added.message
        assert added.details["thing_name"] == "Sensor-A"
        assert added.status == "active"
        assert service.stats["alerts_created"] == 1

    def test_creates_alert_last_activity_none(self, service, mock_db, project_id):
        service.stats = {"alerts_created": 0}
        alert_def = _make_alert_def(project_id)
        mock_db.query.return_value.filter.return_value.first.return_value = None

        service._ensure_alert_active(alert_def, "Sensor-B", None)

        added = mock_db.add.call_args[0][0]
        assert "Never" in added.message
        assert added.details["last_activity"] == "Never"

    def test_noop_when_alert_exists(self, service, mock_db, project_id):
        service.stats = {"alerts_created": 0}
        alert_def = _make_alert_def(project_id)
        existing_alert = MagicMock(spec=Alert)
        mock_db.query.return_value.filter.return_value.first.return_value = (
            existing_alert
        )

        service._ensure_alert_active(alert_def, "Sensor-A", datetime.now(timezone.utc))

        mock_db.add.assert_not_called()
        assert service.stats["alerts_created"] == 0


# ===========================================================================
# _resolve_alert
# ===========================================================================


class TestResolveAlert:
    def test_resolves_existing_alert(self, service, mock_db, project_id):
        service.stats = {"alerts_resolved": 0}
        alert_def = _make_alert_def(project_id)
        existing = MagicMock(spec=Alert)
        existing.status = "active"
        existing.details = {"thing_name": "Sensor-A"}
        mock_db.query.return_value.filter.return_value.first.return_value = existing

        service._resolve_alert(alert_def, "Sensor-A")

        assert existing.status == "resolved"
        assert "resolved_at" in existing.details
        mock_db.commit.assert_called()
        assert service.stats["alerts_resolved"] == 1

    def test_noop_when_no_active_alert(self, service, mock_db, project_id):
        service.stats = {"alerts_resolved": 0}
        alert_def = _make_alert_def(project_id)
        mock_db.query.return_value.filter.return_value.first.return_value = None

        service._resolve_alert(alert_def, "Sensor-A")

        mock_db.commit.assert_not_called()
        assert service.stats["alerts_resolved"] == 0

    def test_resolves_with_none_details(self, service, mock_db, project_id):
        """Edge case: existing.details is None."""
        service.stats = {"alerts_resolved": 0}
        alert_def = _make_alert_def(project_id)
        existing = MagicMock(spec=Alert)
        existing.status = "active"
        existing.details = None
        mock_db.query.return_value.filter.return_value.first.return_value = existing

        service._resolve_alert(alert_def, "Sensor-A")

        assert existing.status == "resolved"
        assert "resolved_at" in existing.details


# ===========================================================================
# _get_or_create_activity_config
# ===========================================================================


class TestGetOrCreateActivityConfig:
    def test_invalid_uuid_returns_none(self, service):
        result = service._get_or_create_activity_config("not-a-uuid")
        assert result is None

    def test_returns_existing_config(self, service, mock_db, thing_uuid):
        existing = MagicMock(spec=SensorActivityConfig)
        mock_db.query.return_value.filter.return_value.first.return_value = existing

        result = service._get_or_create_activity_config(thing_uuid)

        assert result is existing

    def test_auto_creates_config(
        self, service, mock_db, mock_timeio_db, thing_uuid, project_id
    ):
        # No existing config
        mock_db.query.return_value.filter.return_value.first.side_effect = [
            None,  # SensorActivityConfig lookup
            MagicMock(id=project_id),  # Project lookup
        ]

        mock_timeio_db.get_schema_mappings.return_value = [
            {"thing_uuid": thing_uuid, "schema": "project_x"},
        ]

        service._default_track_activity = MagicMock(return_value=True)

        service._get_or_create_activity_config(thing_uuid)

        mock_db.add.assert_called_once()
        mock_db.commit.assert_called()
        mock_db.refresh.assert_called_once()
        added = mock_db.add.call_args[0][0]
        assert isinstance(added, SensorActivityConfig)
        assert added.thing_uuid == uuid.UUID(thing_uuid)
        assert added.track_activity is True
        assert added.inactivity_threshold_hours == 24

    def test_returns_none_when_schema_mapping_fails(
        self, service, mock_db, mock_timeio_db, thing_uuid
    ):
        mock_db.query.return_value.filter.return_value.first.return_value = None
        mock_timeio_db.get_schema_mappings.side_effect = RuntimeError("conn error")

        result = service._get_or_create_activity_config(thing_uuid)

        assert result is None

    def test_returns_none_when_no_schema_found(
        self, service, mock_db, mock_timeio_db, thing_uuid
    ):
        mock_db.query.return_value.filter.return_value.first.return_value = None
        mock_timeio_db.get_schema_mappings.return_value = [
            {"thing_uuid": "other-uuid", "schema": "other_schema"},
        ]

        result = service._get_or_create_activity_config(thing_uuid)

        assert result is None

    def test_returns_none_when_no_project(
        self, service, mock_db, mock_timeio_db, thing_uuid
    ):
        mock_db.query.return_value.filter.return_value.first.side_effect = [
            None,  # SensorActivityConfig
            None,  # Project
        ]
        mock_timeio_db.get_schema_mappings.return_value = [
            {"thing_uuid": thing_uuid, "schema": "project_x"},
        ]

        result = service._get_or_create_activity_config(thing_uuid)

        assert result is None


# ===========================================================================
# _default_track_activity
# ===========================================================================


class TestDefaultTrackActivity:
    def test_returns_true_for_non_sftp(self, service, mock_timeio_db):
        mock_timeio_db.get_all_things_with_ingest_type.return_value = [
            {"uuid": "abc-123", "ingest_type": "mqtt"},
        ]
        assert service._default_track_activity("abc-123") is True

    def test_returns_false_for_sftp(self, service, mock_timeio_db):
        mock_timeio_db.get_all_things_with_ingest_type.return_value = [
            {"uuid": "abc-123", "ingest_type": "sftp"},
        ]
        assert service._default_track_activity("abc-123") is False

    def test_returns_false_for_extsftp(self, service, mock_timeio_db):
        mock_timeio_db.get_all_things_with_ingest_type.return_value = [
            {"uuid": "abc-123", "ingest_type": "extsftp"},
        ]
        assert service._default_track_activity("abc-123") is False

    def test_returns_true_when_thing_not_found(self, service, mock_timeio_db):
        mock_timeio_db.get_all_things_with_ingest_type.return_value = [
            {"uuid": "other-uuid", "ingest_type": "sftp"},
        ]
        assert service._default_track_activity("abc-123") is True

    def test_returns_true_on_exception(self, service, mock_timeio_db):
        mock_timeio_db.get_all_things_with_ingest_type.side_effect = RuntimeError(
            "fail"
        )
        assert service._default_track_activity("abc-123") is True

    def test_sftp_ingest_types_constant(self):
        assert _SFTP_INGEST_TYPES == {"sftp", "extsftp"}


# ===========================================================================
# _update_frost_status
# ===========================================================================


class TestUpdateFrostStatus:
    def test_noop_when_schema_mapping_fails(
        self, service, mock_timeio_db, thing_uuid, project_id
    ):
        config = _make_config(thing_uuid, project_id)
        mock_timeio_db.get_schema_mappings.side_effect = RuntimeError("fail")

        # Should not raise
        service._update_frost_status(config, "inactive")

    def test_noop_when_no_schema(self, service, mock_timeio_db, thing_uuid, project_id):
        config = _make_config(thing_uuid, project_id)
        mock_timeio_db.get_schema_mappings.return_value = [
            {"thing_uuid": "other", "schema": "other"},
        ]
        service._update_frost_status(config, "inactive")
        # No frost client call expected

    @patch("app.services.monitoring_service.get_cached_frost_client")
    @patch("app.services.monitoring_service.settings")
    def test_updates_status_when_different(
        self,
        mock_settings,
        mock_frost_fn,
        service,
        mock_timeio_db,
        thing_uuid,
        project_id,
    ):
        config = _make_config(thing_uuid, project_id)
        mock_timeio_db.get_schema_mappings.return_value = [
            {"thing_uuid": thing_uuid, "schema": "proj_schema"},
        ]

        mock_frost = MagicMock()
        mock_frost_fn.return_value = mock_frost
        mock_frost.get_things.return_value = [
            {"properties": {"status": "active", "other": "val"}},
        ]

        mock_settings.frost_url = "http://frost"
        mock_settings.frost_version = "v1"
        mock_settings.frost_server = "server"

        service.stats = {}
        service._update_frost_status(config, "inactive")

        mock_timeio_db.update_thing_properties.assert_called_once()
        call_args = mock_timeio_db.update_thing_properties.call_args
        assert call_args[0][0] == "proj_schema"
        assert call_args[0][1] == thing_uuid
        new_props = call_args[0][2]["properties"]
        assert new_props["status"] == "inactive"
        assert new_props["other"] == "val"
        assert service.stats["status_updated"] == 1

    @patch("app.services.monitoring_service.get_cached_frost_client")
    @patch("app.services.monitoring_service.settings")
    def test_noop_when_status_already_matches(
        self,
        mock_settings,
        mock_frost_fn,
        service,
        mock_timeio_db,
        thing_uuid,
        project_id,
    ):
        config = _make_config(thing_uuid, project_id)
        mock_timeio_db.get_schema_mappings.return_value = [
            {"thing_uuid": thing_uuid, "schema": "proj_schema"},
        ]

        mock_frost = MagicMock()
        mock_frost_fn.return_value = mock_frost
        mock_frost.get_things.return_value = [
            {"properties": {"status": "inactive"}},
        ]

        mock_settings.frost_url = "http://frost"
        mock_settings.frost_version = "v1"
        mock_settings.frost_server = "server"

        service._update_frost_status(config, "inactive")

        mock_timeio_db.update_thing_properties.assert_not_called()

    @patch("app.services.monitoring_service.get_cached_frost_client")
    @patch("app.services.monitoring_service.settings")
    def test_noop_when_no_things_from_frost(
        self,
        mock_settings,
        mock_frost_fn,
        service,
        mock_timeio_db,
        thing_uuid,
        project_id,
    ):
        config = _make_config(thing_uuid, project_id)
        mock_timeio_db.get_schema_mappings.return_value = [
            {"thing_uuid": thing_uuid, "schema": "proj_schema"},
        ]

        mock_frost = MagicMock()
        mock_frost_fn.return_value = mock_frost
        mock_frost.get_things.return_value = []

        mock_settings.frost_url = "http://frost"
        mock_settings.frost_version = "v1"
        mock_settings.frost_server = "server"

        service._update_frost_status(config, "inactive")

        mock_timeio_db.update_thing_properties.assert_not_called()

    @patch("app.services.monitoring_service.get_cached_frost_client")
    @patch("app.services.monitoring_service.settings")
    def test_handles_none_properties(
        self,
        mock_settings,
        mock_frost_fn,
        service,
        mock_timeio_db,
        thing_uuid,
        project_id,
    ):
        config = _make_config(thing_uuid, project_id)
        mock_timeio_db.get_schema_mappings.return_value = [
            {"thing_uuid": thing_uuid, "schema": "proj_schema"},
        ]

        mock_frost = MagicMock()
        mock_frost_fn.return_value = mock_frost
        mock_frost.get_things.return_value = [
            {"properties": None},
        ]

        mock_settings.frost_url = "http://frost"
        mock_settings.frost_version = "v1"
        mock_settings.frost_server = "server"

        service.stats = {}
        service._update_frost_status(config, "inactive")

        mock_timeio_db.update_thing_properties.assert_called_once()

    @patch("app.services.monitoring_service.get_cached_frost_client")
    @patch("app.services.monitoring_service.settings")
    def test_handles_frost_exception(
        self,
        mock_settings,
        mock_frost_fn,
        service,
        mock_timeio_db,
        thing_uuid,
        project_id,
    ):
        config = _make_config(thing_uuid, project_id)
        mock_timeio_db.get_schema_mappings.return_value = [
            {"thing_uuid": thing_uuid, "schema": "proj_schema"},
        ]

        mock_frost_fn.side_effect = RuntimeError("connection refused")

        mock_settings.frost_url = "http://frost"
        mock_settings.frost_version = "v1"
        mock_settings.frost_server = "server"

        # Should not raise
        service._update_frost_status(config, "inactive")


# ===========================================================================
# _get_thing_name
# ===========================================================================


class TestGetThingName:
    def test_returns_none_when_mappings_fail(self, service, mock_timeio_db):
        mock_timeio_db.get_schema_mappings.side_effect = RuntimeError("fail")
        assert service._get_thing_name("some-uuid") is None

    def test_returns_none_when_no_schema(self, service, mock_timeio_db):
        mock_timeio_db.get_schema_mappings.return_value = [
            {"thing_uuid": "other", "schema": "s"},
        ]
        assert service._get_thing_name("some-uuid") is None

    @patch("app.services.monitoring_service.settings")
    @patch("psycopg2.connect")
    def test_returns_name_from_db(
        self, mock_connect, mock_settings, service, mock_timeio_db
    ):
        thing_uuid = str(uuid.uuid4())
        mock_timeio_db.get_schema_mappings.return_value = [
            {"thing_uuid": thing_uuid, "schema": "my_schema"},
        ]

        mock_conn = MagicMock()
        mock_connect.return_value = mock_conn
        mock_cursor = MagicMock()
        mock_conn.__enter__ = MagicMock(return_value=mock_conn)
        mock_conn.__exit__ = MagicMock(return_value=False)
        mock_cursor.__enter__ = MagicMock(return_value=mock_cursor)
        mock_cursor.__exit__ = MagicMock(return_value=False)
        mock_conn.cursor.return_value = mock_cursor
        mock_cursor.fetchone.return_value = ("Temperature Sensor",)

        mock_settings.timeio_db_host = "localhost"
        mock_settings.timeio_db_port = 5432
        mock_settings.timeio_db_name = "timeio"
        mock_settings.timeio_db_user = "user"
        mock_settings.timeio_db_password = "pass"

        result = service._get_thing_name(thing_uuid)

        assert result == "Temperature Sensor"

    @patch("app.services.monitoring_service.settings")
    @patch("psycopg2.connect")
    def test_returns_none_when_no_row(
        self, mock_connect, mock_settings, service, mock_timeio_db
    ):
        thing_uuid = str(uuid.uuid4())
        mock_timeio_db.get_schema_mappings.return_value = [
            {"thing_uuid": thing_uuid, "schema": "my_schema"},
        ]

        mock_conn = MagicMock()
        mock_connect.return_value = mock_conn
        mock_cursor = MagicMock()
        mock_conn.__enter__ = MagicMock(return_value=mock_conn)
        mock_conn.__exit__ = MagicMock(return_value=False)
        mock_cursor.__enter__ = MagicMock(return_value=mock_cursor)
        mock_cursor.__exit__ = MagicMock(return_value=False)
        mock_conn.cursor.return_value = mock_cursor
        mock_cursor.fetchone.return_value = None

        mock_settings.timeio_db_host = "localhost"
        mock_settings.timeio_db_port = 5432
        mock_settings.timeio_db_name = "timeio"
        mock_settings.timeio_db_user = "user"
        mock_settings.timeio_db_password = "pass"

        result = service._get_thing_name(thing_uuid)

        assert result is None

    @patch("app.services.monitoring_service.settings")
    @patch("psycopg2.connect")
    def test_returns_none_on_db_exception(
        self, mock_connect, mock_settings, service, mock_timeio_db
    ):
        thing_uuid = str(uuid.uuid4())
        mock_timeio_db.get_schema_mappings.return_value = [
            {"thing_uuid": thing_uuid, "schema": "my_schema"},
        ]
        mock_connect.side_effect = RuntimeError("connection refused")

        mock_settings.timeio_db_host = "localhost"
        mock_settings.timeio_db_port = 5432
        mock_settings.timeio_db_name = "timeio"
        mock_settings.timeio_db_user = "user"
        mock_settings.timeio_db_password = "pass"

        result = service._get_thing_name(thing_uuid)

        assert result is None


# ===========================================================================
# Integration-style tests (multiple methods interacting)
# ===========================================================================


class TestMultipleSensorsCheck:
    def test_mixed_active_and_inactive(self, service, mock_db, project_id):
        now = datetime.now(timezone.utc)
        uuid1 = str(uuid.uuid4())
        uuid2 = str(uuid.uuid4())
        uuid3 = str(uuid.uuid4())

        configs = [
            _make_config(
                uuid1,
                project_id,
                last_seen_at=now - timedelta(hours=1),
                inactivity_threshold_hours=24,
            ),
            _make_config(
                uuid2,
                project_id,
                last_seen_at=now - timedelta(hours=48),
                inactivity_threshold_hours=24,
            ),
            _make_config(
                uuid3, project_id, last_seen_at=None, inactivity_threshold_hours=24
            ),
        ]
        mock_db.query.return_value.filter.return_value.all.return_value = configs

        service._get_or_create_alert_definition = MagicMock(
            return_value=_make_alert_def(project_id)
        )
        service._get_thing_name = MagicMock(
            side_effect=["Sensor-1", "Sensor-2", "Sensor-3"]
        )
        service._ensure_alert_active = MagicMock()
        service._resolve_alert = MagicMock()
        service._update_frost_status = MagicMock()

        stats = service.check_inactive_sensors()

        assert stats["tracked"] == 3
        assert stats["active"] == 1
        assert stats["inactive"] == 2
        assert service._ensure_alert_active.call_count == 2
        assert service._resolve_alert.call_count == 1
