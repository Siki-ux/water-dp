"""
Comprehensive unit tests for app.services.timeio.timeio_db.TimeIODatabase.

Strategy: Mock _get_connection and _get_admin_connection to return mock connections
with mock cursors. Each test sets up cursor.fetchone/fetchall/rowcount as needed.
"""

from unittest.mock import MagicMock, patch

import pytest


# Patch settings before importing the module under test
@pytest.fixture(autouse=True)
def mock_settings():
    """Patch settings so the module can be imported without real config."""
    with patch("app.services.timeio.timeio_db.settings") as mock_s:
        mock_s.timeio_db_host = "localhost"
        mock_s.timeio_db_port = 5432
        mock_s.timeio_db_name = "testdb"
        mock_s.timeio_db_user = "testuser"
        mock_s.timeio_db_password = "testpass"
        yield mock_s


def _make_mock_cursor():
    """Create a mock cursor that works as a context manager."""
    cursor = MagicMock()
    cursor.__enter__ = MagicMock(return_value=cursor)
    cursor.__exit__ = MagicMock(return_value=False)
    return cursor


def _make_mock_connection(cursor=None):
    """Create a mock connection whose .cursor() returns the given mock cursor."""
    conn = MagicMock()
    if cursor is None:
        cursor = _make_mock_cursor()
    conn.cursor.return_value = cursor
    return conn, cursor


@pytest.fixture
def db():
    """Return a TimeIODatabase instance with custom params to avoid pool usage."""
    from app.services.timeio.timeio_db import TimeIODatabase

    return TimeIODatabase(
        db_host="localhost",
        db_port=5432,
        database="testdb",
        user="testuser",
        password="testpass",
    )


@pytest.fixture
def mock_conn():
    """Provide a (connection, cursor) pair."""
    return _make_mock_connection()


# ============================================================
# Helper to patch both _get_connection and _get_admin_connection
# ============================================================


def _patch_connections(db_instance, conn):
    """Patch both connection getters to return the same mock connection."""
    db_instance._get_connection = MagicMock(return_value=conn)
    db_instance._release_connection = MagicMock()
    db_instance._get_admin_connection = MagicMock(return_value=conn)


# ============================================================
# Schema methods
# ============================================================


class TestGetSchemaMappings:
    def test_returns_list_of_dicts(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        cursor.fetchall.return_value = [
            ("user_proj1", "uuid-1"),
            ("user_proj2", "uuid-2"),
        ]

        result = db.get_schema_mappings()

        assert result == [
            {"schema": "user_proj1", "thing_uuid": "uuid-1"},
            {"schema": "user_proj2", "thing_uuid": "uuid-2"},
        ]
        cursor.execute.assert_called_once()

    def test_returns_empty_list(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        cursor.fetchall.return_value = []

        result = db.get_schema_mappings()
        assert result == []


class TestGetUserSchemas:
    def test_returns_schema_names(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        cursor.fetchall.return_value = [("user_alpha",), ("user_beta",)]

        result = db.get_user_schemas()
        assert result == ["user_alpha", "user_beta"]

    def test_returns_empty(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        cursor.fetchall.return_value = []

        result = db.get_user_schemas()
        assert result == []


class TestGetSchemaForThing:
    def test_found(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        cursor.fetchone.return_value = ("user_myproject",)

        result = db.get_schema_for_thing("uuid-123")
        assert result == "user_myproject"

    def test_not_found(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        cursor.fetchone.return_value = None

        result = db.get_schema_for_thing("uuid-missing")
        assert result is None


class TestCheckSchemaExists:
    def test_exists(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        cursor.fetchone.return_value = (1,)

        assert db.check_schema_exists("user_test") is True

    def test_not_exists(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        cursor.fetchone.return_value = None

        assert db.check_schema_exists("nonexistent") is False


class TestFixSchemaMapping:
    def test_updated(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        cursor.rowcount = 1

        result = db.fix_schema_mapping("uuid-1", "user_correct")
        assert result is True
        conn.commit.assert_called_once()

    def test_not_found(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        cursor.rowcount = 0

        result = db.fix_schema_mapping("uuid-missing", "user_correct")
        assert result is False


class TestFixAllSchemaMappings:
    def test_fixes_project_schemas(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)

        # First fetchall: mappings
        # Second fetchall: actual schemas
        cursor.fetchall.side_effect = [
            [("project_myproj_1", "uuid-1"), ("user_existing", "uuid-2")],
            [("user_myproj",), ("user_existing",)],
        ]

        fixed_count, fixed_uuids = db.fix_all_schema_mappings()
        assert fixed_count == 1
        assert "uuid-1" in fixed_uuids
        conn.commit.assert_called_once()

    def test_no_fixes_needed(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        cursor.fetchall.side_effect = [
            [("user_ok", "uuid-1")],
            [("user_ok",)],
        ]

        fixed_count, fixed_uuids = db.fix_all_schema_mappings()
        assert fixed_count == 0
        assert fixed_uuids == []


# ============================================================
# FROST views
# ============================================================


class TestCheckFrostViewsExist:
    def test_all_views_exist(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        # Returns (1,) for OBSERVATIONS, DATASTREAMS, THINGS
        cursor.fetchone.side_effect = [(1,), (1,), (1,)]

        assert db.check_frost_views_exist("user_proj") is True

    def test_missing_view(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        # First view exists, second does not
        cursor.fetchone.side_effect = [(1,), None]

        assert db.check_frost_views_exist("user_proj") is False


class TestCreateFrostViews:
    def test_success(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)

        result = db.create_frost_views("user_proj")
        assert result is True
        conn.commit.assert_called_once()
        # Multiple execute calls for views + grants
        assert cursor.execute.call_count >= 5

    def test_failure_rolls_back(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        cursor.execute.side_effect = Exception("SQL error")

        result = db.create_frost_views("user_proj")
        assert result is False
        conn.rollback.assert_called_once()


class TestEnsureFrostViews:
    def test_views_already_exist(self, db):
        """If views exist, should return True without creating."""
        db.check_frost_views_exist = MagicMock(return_value=True)
        db.create_frost_views = MagicMock()

        result = db.ensure_frost_views("user_proj")
        assert result is True
        db.create_frost_views.assert_not_called()

    def test_views_created(self, db):
        """If views don't exist, should create them."""
        db.check_frost_views_exist = MagicMock(return_value=False)
        db.create_frost_views = MagicMock(return_value=True)

        result = db.ensure_frost_views("user_proj")
        assert result is True
        db.create_frost_views.assert_called_once_with("user_proj")

    def test_views_creation_fails(self, db):
        db.check_frost_views_exist = MagicMock(return_value=False)
        db.create_frost_views = MagicMock(return_value=False)

        result = db.ensure_frost_views("user_proj")
        assert result is False


# ============================================================
# Thing methods
# ============================================================


class TestCheckThingExists:
    def test_exists(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        cursor.fetchone.return_value = (1,)

        assert db.check_thing_exists("uuid-1") is True

    def test_not_exists(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        cursor.fetchone.return_value = None

        assert db.check_thing_exists("uuid-missing") is False


class TestGetMqttThings:
    def test_returns_uuids(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        cursor.fetchall.return_value = [("uuid-1",), ("uuid-2",)]

        result = db.get_mqtt_things()
        assert result == ["uuid-1", "uuid-2"]

    def test_empty(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        cursor.fetchall.return_value = []

        result = db.get_mqtt_things()
        assert result == []


class TestGetThingConfigByUuid:
    def test_returns_config_when_mqtt_user_present(self, db):
        """get_thing_config_by_uuid delegates to get_sensor_config_details."""
        db.get_sensor_config_details = MagicMock(
            return_value={"mqtt_user": "user1", "mqtt_pass": "pass1"}
        )
        result = db.get_thing_config_by_uuid("uuid-1")
        assert result == {"mqtt_user": "user1", "mqtt_pass": "pass1"}

    def test_returns_none_when_no_mqtt(self, db):
        db.get_sensor_config_details = MagicMock(return_value={"name": "thing1"})
        result = db.get_thing_config_by_uuid("uuid-1")
        assert result is None

    def test_returns_none_when_not_found(self, db):
        db.get_sensor_config_details = MagicMock(return_value=None)
        result = db.get_thing_config_by_uuid("uuid-missing")
        assert result is None


class TestGetSensorConfigDetails:
    @patch("app.services.timeio.timeio_db.decrypt_password", return_value="decrypted")
    def test_returns_config(self, mock_decrypt, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)

        # RealDictCursor returns dict-like rows
        mock_row = {
            "uuid": "uuid-1",
            "name": "Sensor1",
            "description": "desc",
            "ingest_type_id": 1,
            "ingest_type": "mqtt",
            "project_name": "proj1",
            "project_uuid": "proj-uuid",
            "schema_name": "user_proj1",
            "mqtt_username": "mqttuser",
            "mqtt_password": "encrypted_pass",
            "mqtt_password_hash": "hash",
            "mqtt_topic": "mqtt_ingest/test/data",
            "device_type_id": 1,
            "device_type": "generic",
            "parser": None,
            "parser_id": None,
            "s3_bucket": None,
            "s3_user": None,
            "s3_pass": None,
            "filename_pattern": None,
        }
        # Use a real dict — RealDictCursor returns dict-like rows; dict(real_dict) works fine
        cursor.fetchone.return_value = mock_row

        result = db.get_sensor_config_details("uuid-1")
        assert result is not None
        mock_decrypt.assert_called()

    def test_returns_none_when_not_found(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        cursor.fetchone.return_value = None

        result = db.get_sensor_config_details("uuid-missing")
        assert result is None

    def test_returns_none_on_exception(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        cursor.execute.side_effect = Exception("DB error")

        result = db.get_sensor_config_details("uuid-1")
        assert result is None


class TestGetAllSensorsPaginated:
    def test_returns_paginated_results(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)

        # First query: count, second query: items
        count_row = MagicMock()
        count_row.__getitem__ = lambda self, k: 2 if k == "count" else None
        item1 = MagicMock()
        item1.__iter__ = MagicMock(return_value=iter([]))
        item1.keys = MagicMock(return_value=["uuid", "name"])

        cursor.fetchone.return_value = count_row
        cursor.fetchall.return_value = [
            {"uuid": "u1", "name": "s1"},
            {"uuid": "u2", "name": "s2"},
        ]

        result = db.get_all_sensors_paginated(limit=20, offset=0)
        assert result["total"] == 2
        assert len(result["items"]) == 2

    def test_with_filters(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)

        count_row = MagicMock()
        count_row.__getitem__ = lambda self, k: 1 if k == "count" else None
        cursor.fetchone.return_value = count_row
        cursor.fetchall.return_value = [{"uuid": "u1", "name": "s1"}]

        result = db.get_all_sensors_paginated(
            schemas=["user_proj1"], search="sensor", ingest_type="mqtt"
        )
        assert result["total"] == 1

    def test_returns_empty_on_error(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        cursor.execute.side_effect = Exception("DB error")

        result = db.get_all_sensors_paginated()
        assert result == {"items": [], "total": 0}


class TestUpdateSensorConfig:
    def test_update_name_and_description(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        cursor.fetchone.return_value = (1, 10, 20)  # thing_id, mqtt_id, s3_store_id

        result = db.update_sensor_config(
            "uuid-1", {"name": "NewName", "description": "NewDesc"}
        )
        assert result is True
        conn.commit.assert_called_once()

    def test_thing_not_found(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        cursor.fetchone.return_value = None

        result = db.update_sensor_config("uuid-missing", {"name": "X"})
        assert result is False

    @patch("app.services.timeio.timeio_db.encrypt_password", return_value="enc")
    def test_update_mqtt_fields(self, mock_enc, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        cursor.fetchone.return_value = (1, 10, 20)

        result = db.update_sensor_config(
            "uuid-1",
            {
                "mqtt_topic": "new/topic",
                "mqtt_username": "newuser",
                "mqtt_password": "newpass",
            },
        )
        assert result is True
        mock_enc.assert_called_once_with("newpass")

    def test_update_s3_parser(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        cursor.fetchone.return_value = (1, None, 20)  # no mqtt_id

        result = db.update_sensor_config("uuid-1", {"file_parser_id": 5})
        assert result is True

    def test_returns_false_on_error(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        cursor.fetchone.return_value = (1, 10, 20)
        # Make the second execute call fail (after fetching thing IDs)
        call_count = [0]

        def failing_execute(*args, **kwargs):
            call_count[0] += 1
            if call_count[0] > 1:
                raise Exception("DB error")

        cursor.execute.side_effect = failing_execute

        result = db.update_sensor_config("uuid-1", {"name": "fail"})
        assert result is False


# ============================================================
# Project methods
# ============================================================


class TestGetProjectUuidBySchema:
    def test_found(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        cursor.fetchone.return_value = ("proj-uuid-1", "MyProject")

        result = db.get_project_uuid_by_schema("user_myproject")
        assert result == {"uuid": "proj-uuid-1", "name": "MyProject"}

    def test_not_found(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        cursor.fetchone.return_value = None

        result = db.get_project_uuid_by_schema("user_nonexistent")
        assert result is None


class TestGetConfigProjectByName:
    def test_found(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        mock_row = {"id": 1, "db_schema": "user_proj1", "uuid": "proj-uuid"}
        cursor.fetchone.return_value = mock_row

        result = db.get_config_project_by_name("MyProject")
        assert result == {"id": 1, "db_schema": "user_proj1", "uuid": "proj-uuid"}

    def test_not_found(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        cursor.fetchone.return_value = None

        result = db.get_config_project_by_name("NonExistent")
        assert result is None

    def test_returns_none_on_error(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        cursor.execute.side_effect = Exception("DB error")

        result = db.get_config_project_by_name("Fail")
        assert result is None


class TestGetOrCreateConfigProject:
    def test_existing_by_uuid(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        cursor.fetchone.return_value = (42,)

        result = db.get_or_create_config_project(
            "uuid-1", "Proj", "user_proj", "dbuser", "dbpass", "rouser", "ropass"
        )
        assert result == 42

    def test_existing_by_name(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        # First fetchone (by UUID): None, second (by name): (99, "old-uuid")
        cursor.fetchone.side_effect = [None, (99, "old-uuid")]

        result = db.get_or_create_config_project(
            "uuid-new", "Proj", "user_proj", "dbuser", "dbpass", "rouser", "ropass"
        )
        assert result == 99

    @patch("app.services.timeio.timeio_db.encrypt_password", return_value="enc")
    def test_creates_new_project(self, mock_enc, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        # UUID lookup: None, Name lookup: None, DB insert: (10,), Project insert: (20,)
        cursor.fetchone.side_effect = [None, None, (10,), (20,)]

        result = db.get_or_create_config_project(
            "uuid-new",
            "NewProj",
            "user_newproj",
            "dbuser",
            "dbpass",
            "rouser",
            "ropass",
        )
        assert result == 20
        conn.commit.assert_called_once()

    def test_raises_on_error(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        cursor.execute.side_effect = Exception("DB error")

        with pytest.raises(Exception, match="DB error"):
            db.get_or_create_config_project("uuid", "P", "s", "u", "p", "r", "rp")
        conn.rollback.assert_called_once()


# ============================================================
# Parser methods
# ============================================================


class TestCreateParser:
    @patch(
        "app.services.timeio.timeio_db.TimeIODatabase._get_parser_type_id",
        return_value=1,
    )
    def test_creates_new_parser(self, mock_type_id, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        # First fetchone: check existing (None), second: INSERT RETURNING id
        cursor.fetchone.side_effect = [None, (42,)]

        result = db.create_parser("MyParser", "group-uuid", {"delimiter": ";"})
        assert result == 42
        conn.commit.assert_called_once()

    @patch(
        "app.services.timeio.timeio_db.TimeIODatabase._get_parser_type_id",
        return_value=1,
    )
    def test_updates_existing_parser(self, mock_type_id, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        # First fetchone: existing parser found
        cursor.fetchone.side_effect = [(99,)]

        result = db.create_parser("MyParser", "group-uuid", {"delimiter": ","})
        assert result == 99
        conn.commit.assert_called_once()

    def test_raises_on_error(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        cursor.execute.side_effect = Exception("DB error")

        # _get_parser_type_id will also fail, but create_parser catches it
        with pytest.raises(Exception):
            db.create_parser("Fail", "group", {})


class TestLinkThingToParser:
    def test_success(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        cursor.fetchone.return_value = (5,)  # s3_store_id

        result = db.link_thing_to_parser("uuid-1", 42)
        assert result is True
        conn.commit.assert_called_once()

    def test_thing_not_found(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        cursor.fetchone.return_value = None

        result = db.link_thing_to_parser("uuid-missing", 42)
        assert result is False

    def test_no_s3_store(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        cursor.fetchone.return_value = (None,)

        result = db.link_thing_to_parser("uuid-1", 42)
        assert result is False


class TestGetParser:
    def test_found(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        mock_row = {
            "id": 1,
            "uuid": "parser-uuid",
            "name": "TestParser",
            "settings": '{"delimiter": ","}',
            "type": "csvparser",
        }
        cursor.fetchone.return_value = mock_row

        result = db.get_parser("parser-uuid")
        assert result is not None
        assert result["uuid"] == "parser-uuid"

    def test_not_found(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        cursor.fetchone.return_value = None

        result = db.get_parser("missing-uuid")
        assert result is None

    def test_returns_none_on_error(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        cursor.execute.side_effect = Exception("DB error")

        result = db.get_parser("uuid")
        assert result is None


class TestGetParsersByGroup:
    def test_returns_items_and_total(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)

        count_row = MagicMock()
        count_row.__getitem__ = lambda self, k: 2 if k == "count" else None
        count_row.get = lambda k, d=None: 2 if k == "count" else d

        item1 = {
            "id": 1,
            "uuid": "u1",
            "name": "Parser1",
            "params": "{}",
            "type_name": "csv",
        }
        item2 = {
            "id": 2,
            "uuid": "u2",
            "name": "Parser2",
            "params": "{}",
            "type_name": "csv",
        }
        # Make items support .get() for uuid check
        mock_item1 = MagicMock()
        mock_item1.get.side_effect = lambda k, d=None: item1.get(k, d)
        mock_item1.__getitem__ = lambda self, k: item1[k]
        mock_item1.keys = lambda: item1.keys()
        mock_item1.__iter__ = lambda self: iter(item1)
        mock_item2 = MagicMock()
        mock_item2.get.side_effect = lambda k, d=None: item2.get(k, d)
        mock_item2.__getitem__ = lambda self, k: item2[k]
        mock_item2.keys = lambda: item2.keys()
        mock_item2.__iter__ = lambda self: iter(item2)

        cursor.fetchone.return_value = count_row
        cursor.fetchall.return_value = [mock_item1, mock_item2]

        result = db.get_parsers_by_group("group-uuid")
        assert result["total"] == 2
        assert len(result["items"]) == 2

    def test_returns_empty_on_error(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        cursor.execute.side_effect = Exception("DB error")

        result = db.get_parsers_by_group("group-uuid")
        assert result == {"items": [], "total": 0}


class TestDeleteParser:
    def test_success_no_links(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        cursor.fetchall.return_value = []  # No linked sensors
        cursor.fetchone.return_value = {"id": 1}  # Deleted row

        result = db.delete_parser(1)
        assert result["success"] is True
        conn.commit.assert_called_once()

    def test_linked_sensors_prevents_delete(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        cursor.fetchall.return_value = [
            {"name": "Sensor1", "uuid": "12345678-abcd-ef12-3456-789012345678"}
        ]

        result = db.delete_parser(1)
        assert result["success"] is False
        assert "linked_sensors" in result
        conn.commit.assert_not_called()

    def test_parser_not_found(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        cursor.fetchall.return_value = []  # No links
        cursor.fetchone.return_value = None  # Not deleted

        result = db.delete_parser(999)
        assert result["success"] is False
        assert result["reason"] == "Parser not found"

    def test_returns_error_on_exception(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        cursor.execute.side_effect = Exception("DB error")

        result = db.delete_parser(1)
        assert result["success"] is False
        conn.rollback.assert_called_once()


# ============================================================
# User methods
# ============================================================


class TestCheckUserExists:
    def test_exists(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        cursor.fetchone.return_value = (1,)

        assert db.check_user_exists("testuser") is True

    def test_not_exists(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        cursor.fetchone.return_value = None

        assert db.check_user_exists("nobody") is False


class TestCreateUser:
    def test_success(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)

        result = db.create_user("newuser", "pass123")
        assert result is True
        conn.commit.assert_called_once()

    def test_failure(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        cursor.execute.side_effect = Exception("Role already exists")

        result = db.create_user("dupuser", "pass123")
        assert result is False
        conn.rollback.assert_called_once()


class TestGrantSchemaAccess:
    def test_read_only(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)

        result = db.grant_schema_access("user_proj", "reader", write=False)
        assert result is True
        conn.commit.assert_called_once()
        # Should call execute multiple times: USAGE + SELECT + DEFAULT PRIVILEGES
        assert cursor.execute.call_count == 3

    def test_write_access(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)

        result = db.grant_schema_access("user_proj", "writer", write=True)
        assert result is True
        assert cursor.execute.call_count == 3

    def test_failure(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        cursor.execute.side_effect = Exception("Permission denied")

        result = db.grant_schema_access("user_proj", "nobody")
        assert result is False
        conn.rollback.assert_called_once()


# ============================================================
# Utility methods
# ============================================================


class TestHealthCheck:
    def test_healthy(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)

        assert db.health_check() is True

    def test_unhealthy(self, db):
        db._get_connection = MagicMock(side_effect=Exception("Connection refused"))

        assert db.health_check() is False


class TestGetAllIngestTypes:
    def test_returns_types(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        cursor.fetchall.return_value = [
            {"id": 1, "name": "mqtt"},
            {"id": 2, "name": "s3"},
        ]

        result = db.get_all_ingest_types()
        assert len(result) == 2
        assert result[0]["name"] == "mqtt"

    def test_returns_empty_on_error(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        cursor.execute.side_effect = Exception("DB error")

        result = db.get_all_ingest_types()
        assert result == []


# ============================================================
# Device type methods
# ============================================================


class TestGetMqttDeviceType:
    def test_by_id(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        cursor.fetchone.return_value = {"id": 1, "name": "generic", "properties": {}}

        result = db.get_mqtt_device_type("1")
        assert result == {"id": 1, "name": "generic", "properties": {}}

    def test_by_name(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        cursor.fetchone.return_value = {"id": 2, "name": "chirpstack", "properties": {}}

        result = db.get_mqtt_device_type("chirpstack")
        assert result["name"] == "chirpstack"

    def test_not_found(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        cursor.fetchone.return_value = None

        result = db.get_mqtt_device_type("nonexistent")
        assert result is None

    def test_returns_none_on_error(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        cursor.execute.side_effect = Exception("DB error")

        result = db.get_mqtt_device_type("1")
        assert result is None


class TestGetAllMqttDeviceTypes:
    def test_returns_paginated(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)

        count_row = MagicMock()
        count_row.__getitem__ = lambda self, k: 3 if k == "count" else None
        count_row.get = lambda k, d=None: 3 if k == "count" else d

        cursor.fetchone.return_value = count_row
        cursor.fetchall.return_value = [
            {"id": 1, "name": "generic", "properties": {}},
            {"id": 2, "name": "chirpstack", "properties": {}},
        ]

        result = db.get_all_mqtt_device_types(limit=10, offset=0)
        assert result["total"] == 3
        assert len(result["items"]) == 2

    def test_returns_empty_on_error(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        cursor.execute.side_effect = Exception("DB error")

        result = db.get_all_mqtt_device_types()
        assert result == {"items": [], "total": 0}


class TestUpsertMqttDeviceType:
    def test_success(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)

        result = db.upsert_mqtt_device_type("new_type", {"key": "value"})
        assert result is True
        conn.commit.assert_called_once()

    def test_raises_on_error(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        cursor.execute.side_effect = Exception("DB error")

        with pytest.raises(Exception, match="DB error"):
            db.upsert_mqtt_device_type("fail_type", {})
        conn.rollback.assert_called_once()


# ============================================================
# Additional methods for coverage
# ============================================================


class TestApplyAllFixes:
    def test_applies_fixes(self, db):
        db.fix_all_schema_mappings = MagicMock(return_value=(1, ["uuid-1"]))
        db.get_user_schemas = MagicMock(return_value=["user_proj1", "user_proj2"])
        db.check_frost_views_exist = MagicMock(side_effect=[False, True])
        db.create_frost_views = MagicMock(return_value=True)

        result = db.apply_all_fixes()
        assert result["schema_mappings_fixed"] == 1
        assert result["fixed_uuids"] == ["uuid-1"]
        assert result["schemas_checked"] == 2
        assert result["views_created"] == ["user_proj1"]


class TestGetAllThingsWithIngestType:
    def test_returns_list(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        cursor.fetchall.return_value = [("uuid-1", "mqtt"), ("uuid-2", "s3")]

        result = db.get_all_things_with_ingest_type()
        assert result == [
            {"uuid": "uuid-1", "ingest_type": "mqtt"},
            {"uuid": "uuid-2", "ingest_type": "s3"},
        ]


class TestGetParserTypeId:
    def test_found(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        cursor.fetchone.return_value = (5,)

        result = db._get_parser_type_id("CsvParser")
        assert result == 5

    def test_not_found_raises(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        cursor.fetchone.return_value = None

        with pytest.raises(ValueError, match="Parser type 'UnknownParser' not found"):
            db._get_parser_type_id("UnknownParser")


class TestResolveProjectNameByGroupId:
    def test_found(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        cursor.fetchone.return_value = ("MyProject",)

        result = db.resolve_project_name_by_group_id("group-uuid")
        assert result == "MyProject"

    def test_not_found(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        cursor.fetchone.return_value = None

        result = db.resolve_project_name_by_group_id("unknown")
        assert result is None

    def test_returns_none_on_error(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        cursor.execute.side_effect = Exception("DB error")

        result = db.resolve_project_name_by_group_id("group")
        assert result is None


class TestGetTsmDbSchemaByName:
    def test_found(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        cursor.fetchone.return_value = ("user_myproj",)

        result = db.get_tsm_db_schema_by_name("myproj")
        assert result == "user_myproj"

    def test_not_found(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        cursor.fetchone.return_value = None

        result = db.get_tsm_db_schema_by_name("nonexistent")
        assert result is None

    def test_returns_none_on_error(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        cursor.execute.side_effect = Exception("table does not exist")

        result = db.get_tsm_db_schema_by_name("broken")
        assert result is None


class TestFindProjectSchema:
    def test_found(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        cursor.fetchone.return_value = ("project_myproj_1",)

        result = db.find_project_schema("myproj")
        assert result == "project_myproj_1"

    def test_not_found(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        cursor.fetchone.return_value = None

        result = db.find_project_schema("nonexistent")
        assert result is None


class TestGetNextProjectSchemaNumber:
    def test_no_existing_schemas(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        cursor.fetchall.return_value = []

        result = db.get_next_project_schema_number("myproj")
        assert result == 1

    def test_with_existing_schemas(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        cursor.fetchall.return_value = [
            ("project_myproj_1",),
            ("project_myproj_2",),
        ]

        result = db.get_next_project_schema_number("myproj")
        assert result == 3


class TestCloneSchemaStructure:
    def test_success_with_tables(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        cursor.fetchall.return_value = [("thing",), ("datastream",), ("observation",)]

        result = db.clone_schema_structure("user_source", "project_target_1")
        assert result is True
        conn.commit.assert_called_once()

    def test_success_no_tables(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        # First fetchall: no tables, second: user schemas list
        cursor.fetchall.side_effect = [[], [("user_other",)]]

        result = db.clone_schema_structure("user_empty", "project_target_1")
        assert result is True
        conn.commit.assert_called_once()

    def test_failure_rolls_back(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        cursor.execute.side_effect = Exception("Permission denied")

        result = db.clone_schema_structure("user_source", "project_target_1")
        assert result is False
        conn.rollback.assert_called_once()


class TestCreateLegacyThing:
    def test_existing_thing(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        cursor.fetchone.return_value = (42,)

        result = db.create_legacy_thing("uuid-1", "Thing1")
        assert result == 42

    def test_creates_new(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        cursor.fetchone.side_effect = [None, (99,)]

        result = db.create_legacy_thing("uuid-new", "NewThing", "A description")
        assert result == 99
        conn.commit.assert_called_once()

    def test_returns_none_on_error(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        cursor.execute.side_effect = Exception("DB error")

        result = db.create_legacy_thing("uuid-fail", "FailThing")
        assert result is None
        conn.rollback.assert_called_once()


class TestGetThingSchema:
    def test_found(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        cursor.fetchone.return_value = ("user_proj",)

        result = db.get_thing_schema("uuid-1")
        assert result == "user_proj"

    def test_not_found(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        cursor.fetchone.return_value = None

        result = db.get_thing_schema("uuid-missing")
        assert result is None


class TestEnsureFrostUser:
    def test_user_exists_grants_access(self, db):
        db.check_user_exists = MagicMock(return_value=True)
        db.grant_schema_access = MagicMock(return_value=True)

        result = db.ensure_frost_user("user_proj", "ro_user", "pass")
        assert result is True
        db.grant_schema_access.assert_called_once_with(
            "user_proj", "ro_user", write=False
        )

    def test_creates_user_and_grants(self, db):
        db.check_user_exists = MagicMock(return_value=False)
        db.create_user = MagicMock(return_value=True)
        db.grant_schema_access = MagicMock(return_value=True)

        result = db.ensure_frost_user("user_proj", "ro_user", "pass")
        assert result is True
        db.create_user.assert_called_once_with("ro_user", "pass")

    def test_create_user_fails(self, db):
        db.check_user_exists = MagicMock(return_value=False)
        db.create_user = MagicMock(return_value=False)

        result = db.ensure_frost_user("user_proj", "ro_user", "pass")
        assert result is False


class TestGetConfigId:
    def test_found(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        cursor.fetchone.return_value = (7,)

        result = db.get_config_id("ingest_type", "mqtt")
        assert result == 7

    def test_not_found(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        cursor.fetchone.return_value = None

        result = db.get_config_id("ingest_type", "nonexistent")
        assert result is None


class TestGetDatabaseConfig:
    def test_found(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        cursor.fetchone.return_value = (
            "dbuser",
            "enc_pass",
            "rouser",
            "enc_ro",
            "url1",
            "url2",
        )

        result = db.get_database_config("user_proj")
        assert result == {
            "username": "dbuser",
            "password": "enc_pass",
            "ro_username": "rouser",
            "ro_password": "enc_ro",
            "url": "url1",
            "ro_url": "url2",
        }

    def test_not_found(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        cursor.fetchone.return_value = None

        result = db.get_database_config("nonexistent")
        assert result is None


class TestConnectionContextManager:
    def test_connection_context_manager(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)

        with db.connection() as c:
            assert c is conn

        db._release_connection.assert_called_once_with(conn)


class TestGetLastObservationTimes:
    def test_returns_timestamps(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)

        from datetime import datetime

        ts = datetime(2024, 1, 15, 12, 0, 0)
        cursor.fetchall.return_value = [("uuid-1", ts)]

        result = db.get_last_observation_times("user_proj", ["uuid-1"])
        assert "uuid-1" in result
        assert result["uuid-1"] == ts.isoformat()

    def test_empty_uuids(self, db):
        result = db.get_last_observation_times("user_proj", [])
        assert result == {}

    def test_returns_empty_on_error(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        cursor.execute.side_effect = Exception("DB error")

        result = db.get_last_observation_times("user_proj", ["uuid-1"])
        assert result == {}


class TestUpdateParser:
    def test_update_name_and_settings(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        cursor.fetchone.return_value = {"id": 1}  # RETURNING id

        # get_parser is called after successful update
        db.get_parser = MagicMock(return_value={"id": 1, "uuid": "u", "name": "New"})

        result = db.update_parser(
            "parser-uuid", name="New", settings={"delimiter": ";"}
        )
        assert result is not None
        conn.commit.assert_called_once()

    def test_no_updates_returns_current(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        db.get_parser = MagicMock(return_value={"id": 1, "uuid": "u", "name": "Old"})

        result = db.update_parser("parser-uuid")
        assert result is not None
        db.get_parser.assert_called_once_with("parser-uuid")

    def test_not_found(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        cursor.fetchone.return_value = None

        result = db.update_parser("missing-uuid", name="X")
        assert result is None

    def test_returns_none_on_error(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        cursor.execute.side_effect = Exception("DB error")

        result = db.update_parser("uuid", name="Fail")
        assert result is None
        conn.rollback.assert_called_once()


class TestGetDatastreamMetadata:
    def test_returns_list(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        cursor.fetchall.return_value = [
            {"id": 1, "datastream_name": "temp", "unit_name": "C"},
        ]

        result = db.get_datastream_metadata("uuid-1")
        assert len(result) == 1
        assert result[0]["datastream_name"] == "temp"

    def test_returns_empty_on_error(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        cursor.execute.side_effect = Exception("DB error")

        result = db.get_datastream_metadata("uuid-1")
        assert result == []


class TestUpdateDatastreamMetadata:
    def test_update_name_and_unit(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        cursor.rowcount = 1

        result = db.update_datastream_metadata(
            "user_proj",
            1,
            name="Temperature",
            unit_of_measurement={
                "name": "Celsius",
                "symbol": "C",
                "definition": "temp",
            },
        )
        assert result is True
        conn.commit.assert_called_once()

    def test_no_schema_returns_false(self, db):
        result = db.update_datastream_metadata(None, 1, name="X")
        assert result is False

    def test_no_datastream_id_returns_false(self, db):
        result = db.update_datastream_metadata("user_proj", 0, name="X")
        assert result is False

    def test_no_updates_returns_true(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        result = db.update_datastream_metadata("user_proj", 1)
        assert result is True

    def test_not_found(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        cursor.rowcount = 0

        result = db.update_datastream_metadata("user_proj", 999, name="X")
        assert result is False

    def test_returns_false_on_error(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        cursor.execute.side_effect = Exception("DB error")

        result = db.update_datastream_metadata("user_proj", 1, name="Fail")
        assert result is False
        conn.rollback.assert_called_once()


class TestGetThingConfigsByUuids:
    @patch("app.services.timeio.timeio_db.decrypt_password", return_value="decrypted")
    def test_returns_configs(self, mock_decrypt, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        cursor.fetchall.return_value = [
            ("uuid-1", "mqttuser1", "encrypted1"),
            ("uuid-2", "mqttuser2", None),
        ]

        result = db.get_thing_configs_by_uuids(["uuid-1", "uuid-2"])
        assert "uuid-1" in result
        assert result["uuid-1"]["mqtt_user"] == "mqttuser1"
        assert result["uuid-1"]["mqtt_pass"] == "decrypted"
        assert result["uuid-2"]["mqtt_pass"] is None

    def test_empty_input(self, db):
        result = db.get_thing_configs_by_uuids([])
        assert result == {}

    def test_returns_empty_on_error(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        cursor.execute.side_effect = Exception("DB error")

        result = db.get_thing_configs_by_uuids(["uuid-1"])
        assert result == {}


class TestGetActiveSimulations:
    def test_returns_simulations(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        cursor.fetchall.return_value = [
            ("uuid-1", "Sim1", "user1", "pass1", {"interval": 5}),
        ]

        result = db.get_active_simulations()
        assert len(result) == 1
        assert result[0]["uuid"] == "uuid-1"
        assert result[0]["config"] == {"interval": 5}

    def test_returns_empty_on_error(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        cursor.execute.side_effect = Exception("DB error")

        result = db.get_active_simulations()
        assert result == []


class TestGetThingProperties:
    def test_returns_properties(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        mock_row = MagicMock()
        mock_row.get.return_value = {
            "location": {"type": "Point", "coordinates": [1, 2]}
        }
        cursor.fetchone.return_value = mock_row

        result = db.get_thing_properties("user_proj", "uuid-1")
        assert isinstance(result, dict)

    def test_not_found(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        cursor.fetchone.return_value = None

        result = db.get_thing_properties("user_proj", "uuid-missing")
        assert result == {}

    def test_returns_empty_on_error(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        cursor.execute.side_effect = Exception("DB error")

        result = db.get_thing_properties("user_proj", "uuid-1")
        assert result == {}


class TestUpdateThingProperties:
    def test_update_name(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        cursor.rowcount = 1

        result = db.update_thing_properties("user_proj", "uuid-1", {"name": "New"})
        assert result is True
        conn.commit.assert_called_once()

    def test_no_schema_resolves(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        db.get_thing_schema = MagicMock(return_value="user_proj")
        cursor.rowcount = 1

        result = db.update_thing_properties(None, "uuid-1", {"name": "New"})
        assert result is True

    def test_no_schema_found(self, db):
        db.get_thing_schema = MagicMock(return_value=None)

        result = db.update_thing_properties(None, "uuid-1", {"name": "X"})
        assert result is False

    def test_empty_updates(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        result = db.update_thing_properties("user_proj", "uuid-1", {})
        assert result is True

    def test_raises_on_error(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        cursor.execute.side_effect = Exception("DB error")

        with pytest.raises(Exception, match="DB error"):
            db.update_thing_properties("user_proj", "uuid-1", {"name": "Fail"})
        conn.rollback.assert_called_once()


class TestUpsertThingToProjectDb:
    def test_success(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        cursor.fetchone.return_value = (42,)

        result = db.upsert_thing_to_project_db("user_proj", "uuid-1", "Thing1")
        assert result == 42
        conn.commit.assert_called_once()

    def test_returns_none_on_error(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        cursor.execute.side_effect = Exception("DB error")

        result = db.upsert_thing_to_project_db("user_proj", "uuid-1", "Thing1")
        assert result is None
        conn.rollback.assert_called_once()


class TestGetThingIdInProjectDb:
    def test_found(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        cursor.fetchone.return_value = (10,)

        result = db.get_thing_id_in_project_db("user_proj", "uuid-1")
        assert result == 10

    def test_not_found(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        cursor.fetchone.return_value = None

        result = db.get_thing_id_in_project_db("user_proj", "uuid-missing")
        assert result is None

    def test_returns_none_on_error(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        cursor.execute.side_effect = Exception("DB error")

        result = db.get_thing_id_in_project_db("user_proj", "uuid-1")
        assert result is None


class TestDeleteThingCascade:
    def test_full_cascade_delete(self, db):
        conn, cursor = _make_mock_connection()
        admin_conn, admin_cursor = _make_mock_connection()

        db._get_connection = MagicMock(return_value=conn)
        db._release_connection = MagicMock()
        db._get_admin_connection = MagicMock(return_value=admin_conn)
        db.get_thing_schema = MagicMock(return_value="user_proj")
        db.check_schema_exists = MagicMock(return_value=True)

        # Admin cursor: config_db lookup returns mqtt_id and s3_id
        admin_cursor.fetchone.side_effect = [
            (10, 20),  # mqtt_id, s3_store_id from config_db.thing
            (30,),  # file_parser_id from config_db.s3_store
        ]
        cursor.rowcount = 1

        result = db.delete_thing_cascade("uuid-1")
        assert result is True
        admin_conn.commit.assert_called_once()

    def test_no_configdb_entry(self, db):
        conn, cursor = _make_mock_connection()
        admin_conn, admin_cursor = _make_mock_connection()

        db._get_connection = MagicMock(return_value=conn)
        db._release_connection = MagicMock()
        db._get_admin_connection = MagicMock(return_value=admin_conn)
        db.get_thing_schema = MagicMock(return_value=None)
        db.check_schema_exists = MagicMock(return_value=False)

        admin_cursor.fetchone.return_value = None

        db.delete_thing_cascade("uuid-missing")
        # When no configdb row found, commit is still called but returns implicitly
        # The method doesn't explicitly return True in this path since fetchone is None
        # and the 'if row:' block is skipped


class TestEnsureDatastreamsInProjectDb:
    def test_success(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        cursor.fetchone.return_value = (42,)  # thing_id

        props = [
            {"name": "temperature", "unit": "C"},
            {"name": "humidity", "unit": "%"},
        ]
        result = db.ensure_datastreams_in_project_db("user_proj", "uuid-1", props)
        assert result is True
        conn.commit.assert_called_once()

    def test_thing_not_found(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        cursor.fetchone.return_value = None

        result = db.ensure_datastreams_in_project_db(
            "user_proj", "uuid-missing", [{"name": "x"}]
        )
        assert result is False

    def test_returns_false_on_error(self, db):
        conn, cursor = _make_mock_connection()
        _patch_connections(db, conn)
        cursor.execute.side_effect = Exception("DB error")

        result = db.ensure_datastreams_in_project_db(
            "user_proj", "uuid-1", [{"name": "x"}]
        )
        assert result is False
        conn.rollback.assert_called_once()


class TestUpsertDatastreamMetadata:
    def test_returns_true(self, db):
        """Currently a stub that always returns True."""
        result = db.upsert_datastream_metadata("uuid-1", 1, unit="C")
        assert result is True


class TestReleaseConnection:
    def test_custom_params_closes(self, db):
        """With custom params, _release_connection calls conn.close()."""
        mock_conn = MagicMock()
        db._release_connection(mock_conn)
        mock_conn.close.assert_called_once()

    @patch("app.services.timeio.timeio_db._get_pool")
    def test_pool_connection_returned(self, mock_pool_fn):
        """Without custom params, connection is returned to pool."""
        from app.services.timeio.timeio_db import TimeIODatabase

        db_no_custom = TimeIODatabase.__new__(TimeIODatabase)
        db_no_custom._custom_params = False

        mock_pool = MagicMock()
        mock_pool_fn.return_value = mock_pool
        mock_conn = MagicMock()

        db_no_custom._release_connection(mock_conn)
        mock_pool.putconn.assert_called_once_with(mock_conn)

    @patch("app.services.timeio.timeio_db._get_pool")
    def test_pool_putconn_failure_closes(self, mock_pool_fn):
        """If putconn fails, connection is closed."""
        from app.services.timeio.timeio_db import TimeIODatabase

        db_no_custom = TimeIODatabase.__new__(TimeIODatabase)
        db_no_custom._custom_params = False

        mock_pool = MagicMock()
        mock_pool.putconn.side_effect = Exception("pool error")
        mock_pool_fn.return_value = mock_pool
        mock_conn = MagicMock()

        db_no_custom._release_connection(mock_conn)
        mock_conn.close.assert_called_once()
