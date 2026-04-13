"""
Unit tests for TimeIOOrchestrator and helper functions.

Mocks TimeIODatabase and MQTTClient to test orchestration logic.
"""

import uuid
from unittest.mock import patch

import pytest

from app.services.timeio.orchestrator import TimeIOOrchestrator, _sanitize_schema_name

# ===========================================================================
# _sanitize_schema_name (pure function)
# ===========================================================================


class TestSanitizeSchemaName:
    def test_strips_ufz_tsm_prefix(self):
        assert _sanitize_schema_name("UFZ-TSM:MyProject") == "myproject"

    def test_strips_lowercase_prefix(self):
        assert _sanitize_schema_name("ufz-tsm:other") == "other"

    def test_path_style_group(self):
        assert _sanitize_schema_name("org/dept/project") == "project"

    def test_replaces_invalid_chars(self):
        assert _sanitize_schema_name("My Project!") == "my_project"

    def test_collapses_underscores(self):
        # "--" → each char maps to "_", but then collapsed: "foo__bar" → "foo_bar"
        assert _sanitize_schema_name("foo--bar") == "foo_bar"

    def test_lowercases(self):
        assert _sanitize_schema_name("MyProject2") == "myproject2"

    def test_strips_leading_trailing_underscores(self):
        result = _sanitize_schema_name("_project_")
        assert not result.startswith("_")
        assert not result.endswith("_")

    def test_spaces_become_underscores(self):
        assert _sanitize_schema_name("ufz-tsm:my project") == "my_project"

    def test_hyphen_in_name(self):
        result = _sanitize_schema_name("my-project")
        assert result == "my_project"

    def test_numeric_suffix(self):
        assert _sanitize_schema_name("UFZ-TSM:Project123") == "project123"


# ===========================================================================
# TimeIOOrchestrator - setup helpers
# ===========================================================================


@pytest.fixture
def orchestrator():
    """Return an orchestrator with mocked DB and MQTT clients."""
    with (
        patch("app.services.timeio.orchestrator.TimeIODatabase") as MockDB,
        patch("app.services.timeio.orchestrator.MQTTClient") as MockMQTT,
        patch("app.services.timeio.orchestrator.settings") as mock_settings,
    ):
        mock_settings.mqtt_username = "testuser"
        mock_settings.mqtt_password = "testpass"

        orch = TimeIOOrchestrator()
        orch.db = MockDB.return_value
        orch.mqtt = MockMQTT.return_value
        yield orch


# ===========================================================================
# _generate_password
# ===========================================================================


class TestGeneratePassword:
    def test_returns_string(self, orchestrator):
        pwd = orchestrator._generate_password()
        assert isinstance(pwd, str)

    def test_default_length_32(self, orchestrator):
        assert len(orchestrator._generate_password()) == 32

    def test_custom_length(self, orchestrator):
        assert len(orchestrator._generate_password(16)) == 16

    def test_alphanumeric_only(self, orchestrator):
        pwd = orchestrator._generate_password(100)
        assert pwd.isalnum()


# ===========================================================================
# sync_sensor
# ===========================================================================


class TestSyncSensor:
    def test_returns_true_on_success(self, orchestrator):
        orchestrator.db.get_thing_full_config.return_value = {
            "uuid": "u1",
            "name": "S1",
        }
        orchestrator.mqtt.publish_message.return_value = True

        result = orchestrator.sync_sensor("u1")
        assert result is True
        orchestrator.mqtt.publish_message.assert_called_once()

    def test_returns_false_when_config_not_found(self, orchestrator):
        orchestrator.db.get_thing_full_config.return_value = None

        result = orchestrator.sync_sensor("missing-uuid")
        assert result is False
        orchestrator.mqtt.publish_message.assert_not_called()

    def test_returns_false_when_mqtt_fails(self, orchestrator):
        orchestrator.db.get_thing_full_config.return_value = {
            "uuid": "u2",
            "name": "S2",
        }
        orchestrator.mqtt.publish_message.return_value = False

        result = orchestrator.sync_sensor("u2")
        assert result is False


# ===========================================================================
# delete_sensor
# ===========================================================================


class TestDeleteSensor:
    def test_delegates_to_db(self, orchestrator):
        orchestrator.db.delete_thing_cascade.return_value = True

        result = orchestrator.delete_sensor("thing-uuid", known_schema="user_proj")
        assert result is True
        orchestrator.db.delete_thing_cascade.assert_called_once_with(
            "thing-uuid", known_schema="user_proj"
        )

    def test_returns_false_when_db_fails(self, orchestrator):
        orchestrator.db.delete_thing_cascade.return_value = False

        result = orchestrator.delete_sensor("bad-uuid")
        assert result is False


# ===========================================================================
# create_sensor - basic happy path
# ===========================================================================


class TestCreateSensor:
    @patch("app.services.timeio.orchestrator.encrypt_password", return_value="enc")
    @patch("app.services.timeio.orchestrator.hash_password_pbkdf2", return_value="hash")
    @patch("app.services.timeio.orchestrator.time.sleep")
    def test_create_with_provided_schema(
        self, mock_sleep, mock_hash, mock_enc, orchestrator
    ):
        orchestrator.db.get_project_uuid_by_schema.return_value = {
            "name": "TestProject",
            "uuid": str(uuid.uuid4()),
        }
        orchestrator.db.check_thing_exists.return_value = False
        orchestrator.db.get_database_config.return_value = {
            "username": "user_proj",
            "password": "enc_pass",
            "ro_username": "ro_user_proj",
            "ro_password": "enc_ro_pass",
            "url": "postgresql://...",
            "ro_url": "postgresql://...",
        }
        orchestrator.mqtt.publish_message.return_value = True
        orchestrator.db.get_thing_id_in_project_db.return_value = 42
        orchestrator.db.ensure_datastreams_in_project_db.return_value = None
        orchestrator.db.register_sensor_metadata.return_value = None
        orchestrator.db.update_thing_properties.return_value = True

        result = orchestrator.create_sensor(
            project_group="TestProject",
            sensor_name="TestSensor",
            project_schema="user_testproject",
        )

        assert result["name"] == "TestSensor"
        assert "uuid" in result
        orchestrator.mqtt.publish_message.assert_called_once()

    @patch("app.services.timeio.orchestrator.encrypt_password", return_value="enc")
    @patch("app.services.timeio.orchestrator.hash_password_pbkdf2", return_value="hash")
    @patch("app.services.timeio.orchestrator.time.sleep")
    def test_create_derives_schema_from_group(
        self, mock_sleep, mock_hash, mock_enc, orchestrator
    ):
        orchestrator.db.get_project_uuid_by_schema.return_value = None
        orchestrator.db.check_thing_exists.return_value = False
        orchestrator.db.get_database_config.return_value = (
            None  # no existing config → generate
        )
        orchestrator.mqtt.publish_message.return_value = True
        orchestrator.db.get_thing_id_in_project_db.return_value = 99
        orchestrator.db.ensure_datastreams_in_project_db.return_value = None
        orchestrator.db.register_sensor_metadata.return_value = None
        orchestrator.db.update_thing_properties.return_value = True

        result = orchestrator.create_sensor(
            project_group="UFZ-TSM:NewProject",
            sensor_name="Sensor1",
        )

        assert result["schema"] == "user_newproject"
        assert result["name"] == "Sensor1"

    @patch("app.services.timeio.orchestrator.encrypt_password", return_value="enc")
    @patch("app.services.timeio.orchestrator.hash_password_pbkdf2", return_value="hash")
    def test_create_raises_when_mqtt_fails(self, mock_hash, mock_enc, orchestrator):
        orchestrator.db.get_project_uuid_by_schema.return_value = None
        orchestrator.db.check_thing_exists.return_value = False
        orchestrator.db.get_database_config.return_value = None
        orchestrator.mqtt.publish_message.return_value = False

        with pytest.raises(
            RuntimeError, match="Failed to trigger TSM workflow via MQTT"
        ):
            orchestrator.create_sensor(
                project_group="MyProject",
                sensor_name="TestSensor",
            )

    @patch("app.services.timeio.orchestrator.encrypt_password", return_value="enc")
    @patch("app.services.timeio.orchestrator.hash_password_pbkdf2", return_value="hash")
    @patch("app.services.timeio.orchestrator.time.sleep")
    def test_create_times_out(self, mock_sleep, mock_hash, mock_enc, orchestrator):
        orchestrator.db.get_project_uuid_by_schema.return_value = None
        orchestrator.db.check_thing_exists.return_value = False
        orchestrator.db.get_database_config.return_value = None
        orchestrator.mqtt.publish_message.return_value = True
        # Never creates the thing
        orchestrator.db.get_thing_id_in_project_db.return_value = None

        with pytest.raises(TimeoutError):
            orchestrator.create_sensor(
                project_group="MyProject",
                sensor_name="SlowSensor",
            )

    @patch("app.services.timeio.orchestrator.encrypt_password", return_value="enc")
    @patch("app.services.timeio.orchestrator.hash_password_pbkdf2", return_value="hash")
    @patch("app.services.timeio.orchestrator.time.sleep")
    def test_create_with_external_api(
        self, mock_sleep, mock_hash, mock_enc, orchestrator
    ):
        orchestrator.db.get_project_uuid_by_schema.return_value = None
        orchestrator.db.check_thing_exists.return_value = False
        orchestrator.db.get_database_config.return_value = None
        orchestrator.mqtt.publish_message.return_value = True
        orchestrator.db.get_thing_id_in_project_db.return_value = 7
        orchestrator.db.ensure_datastreams_in_project_db.return_value = None
        orchestrator.db.register_sensor_metadata.return_value = None
        orchestrator.db.update_thing_properties.return_value = True

        result = orchestrator.create_sensor(
            project_group="ProjA",
            sensor_name="ApiSensor",
            ingest_type="mqtt",
            external_api={
                "type": "rest",
                "enabled": True,
                "sync_interval": 60,
                "settings": {"api_key": "secret", "url": "https://api.example.com"},
            },
        )
        # ingest_type should be auto-set to "extapi"
        assert result["name"] == "ApiSensor"

    @patch("app.services.timeio.orchestrator.encrypt_password", return_value="enc")
    @patch("app.services.timeio.orchestrator.hash_password_pbkdf2", return_value="hash")
    @patch("app.services.timeio.orchestrator.time.sleep")
    def test_create_with_external_sftp(
        self, mock_sleep, mock_hash, mock_enc, orchestrator
    ):
        orchestrator.db.get_project_uuid_by_schema.return_value = None
        orchestrator.db.check_thing_exists.return_value = False
        orchestrator.db.get_database_config.return_value = None
        orchestrator.mqtt.publish_message.return_value = True
        orchestrator.db.get_thing_id_in_project_db.return_value = 8
        orchestrator.db.ensure_datastreams_in_project_db.return_value = None
        orchestrator.db.register_sensor_metadata.return_value = None
        orchestrator.db.update_thing_properties.return_value = True

        result = orchestrator.create_sensor(
            project_group="ProjB",
            sensor_name="SftpSensor",
            external_sftp={
                "uri": "sftp://example.com",
                "path": "/data",
                "username": "sftpuser",
                "password": "pass123",
                "private_key": "",
                "public_key": "",
                "sync_interval": 300,
                "sync_enabled": True,
            },
        )
        assert result["name"] == "SftpSensor"


# ===========================================================================
# _register_metadata_and_location
# ===========================================================================


class TestRegisterMetadataAndLocation:
    def test_with_list_properties(self, orchestrator):
        orchestrator.db.ensure_datastreams_in_project_db.return_value = None
        orchestrator.db.register_sensor_metadata.return_value = None
        orchestrator.db.update_thing_properties.return_value = True

        orchestrator._register_metadata_and_location(
            "user_proj",
            "thing-1",
            [{"name": "temp", "unit": "C"}],
            geometry=None,
        )
        orchestrator.db.ensure_datastreams_in_project_db.assert_called_once()

    def test_with_dict_properties(self, orchestrator):
        orchestrator.db.ensure_datastreams_in_project_db.return_value = None
        orchestrator.db.register_sensor_metadata.return_value = None
        orchestrator.db.update_thing_properties.return_value = True

        orchestrator._register_metadata_and_location(
            "user_proj",
            "thing-2",
            {"temperature": "C", "humidity": "%"},
        )
        orchestrator.db.update_thing_properties.assert_called_once()

    def test_with_geojson_point_geometry(self, orchestrator):
        orchestrator.db.ensure_datastreams_in_project_db.return_value = None
        orchestrator.db.register_sensor_metadata.return_value = None
        orchestrator.db.update_thing_properties.return_value = True

        orchestrator._register_metadata_and_location(
            "user_proj",
            "thing-3",
            {},
            geometry={"type": "Point", "coordinates": [13.4, 51.5]},
        )
        call_args = orchestrator.db.update_thing_properties.call_args[0]
        props = call_args[2]["properties"]
        assert props["longitude"] == 13.4
        assert props["latitude"] == 51.5

    def test_with_legacy_flat_geometry(self, orchestrator):
        orchestrator.db.ensure_datastreams_in_project_db.return_value = None
        orchestrator.db.register_sensor_metadata.return_value = None
        orchestrator.db.update_thing_properties.return_value = True

        orchestrator._register_metadata_and_location(
            "user_proj",
            "thing-4",
            {},
            geometry={"latitude": 48.0, "longitude": 11.0},
        )
        call_args = orchestrator.db.update_thing_properties.call_args[0]
        props = call_args[2]["properties"]
        assert props["latitude"] == 48.0

    def test_with_none_properties(self, orchestrator):
        orchestrator.db.ensure_datastreams_in_project_db.return_value = None
        orchestrator.db.register_sensor_metadata.return_value = None
        orchestrator.db.update_thing_properties.return_value = True

        # Should not raise
        orchestrator._register_metadata_and_location("user_proj", "thing-5", None)
        orchestrator.db.ensure_datastreams_in_project_db.assert_called_once()

    def test_metadata_registration_failure_is_logged(self, orchestrator):
        orchestrator.db.ensure_datastreams_in_project_db.return_value = None
        orchestrator.db.register_sensor_metadata.side_effect = Exception("DB fail")
        orchestrator.db.update_thing_properties.return_value = True

        # Should not raise (exception is caught and logged)
        orchestrator._register_metadata_and_location("user_proj", "thing-6", {})
