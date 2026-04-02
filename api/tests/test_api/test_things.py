from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

from fastapi.testclient import TestClient

from app.api.deps import get_current_user, get_db
from app.main import app
from app.schemas.frost.datastream import Datastream, UnitOfMeasurement
from app.schemas.frost.thing import Location, Thing

client = TestClient(app)

MOCK_USER = {
    "sub": "u1",
    "realm_access": {"roles": []},
}


def _override_auth():
    app.dependency_overrides[get_current_user] = lambda: MOCK_USER


def _cleanup():
    app.dependency_overrides = {}


@patch("app.api.v1.endpoints.things.orchestrator")
def test_create_sensor(mock_orch):
    mock_db = MagicMock()
    app.dependency_overrides[get_db] = lambda: mock_db
    app.dependency_overrides[get_current_user] = lambda: {
        "sub": "u1",
        "realm_access": {"roles": []},
    }

    # Mock Project Query
    mock_project = MagicMock()
    mock_project.id = uuid4()
    mock_project.authorization_provider_group_id = "group1"
    mock_project.schema_name = "test_schema"
    mock_project.name = "Test Project"
    mock_db.query.return_value.filter.return_value.first.return_value = mock_project

    mock_orch.create_sensor.return_value = {"uuid": "new-uuid", "name": "S1"}

    # Mock _resolve_group_info to avoid Keycloak calls
    with patch("app.api.v1.endpoints.things._resolve_group_info") as mock_resolve:
        mock_resolve.return_value = {"name": "TestGroup", "schema_name": "test_schema"}

        # Mock ProjectService.add_sensor to avoid RBAC checks
        with patch("app.services.project_service.ProjectService") as mock_ps:
            mock_ps.add_sensor.return_value = None

            # Mock _ensure_activity_config
            with patch("app.api.v1.endpoints.things._ensure_activity_config"):
                response = client.post(
                    "/api/v1/things/",
                    json={
                        "project_uuid": str(mock_project.id),
                        "sensor_name": "S1",
                        "device_type": "dt",
                        "description": "desc",
                    },
                )
                assert response.status_code == 201
                assert response.json()["uuid"] == "new-uuid"

    app.dependency_overrides = {}


@patch(
    "app.services.ingestion_service.IngestionService.upload_csv",
    new_callable=AsyncMock,
)
def test_ingest_csv(mock_upload):
    mock_upload.return_value = {
        "status": "success",
        "bucket": "test-bucket",
        "file": "test.csv",
    }

    response = client.post(
        "/api/v1/things/test-uuid/ingest/csv",
        files={"file": ("test.csv", b"col1,col2\nval1,val2", "text/csv")},
    )
    assert response.status_code == 200
    assert response.json()["status"] == "success"


# --- List Sensors ---


@patch("app.api.v1.endpoints.things.AsyncThingService")
def test_list_sensors(mock_async_cls):
    """GET /things/{schema}/all returns sensor list."""
    thing1 = Thing(
        sensor_uuid="uuid-1",
        name="S1",
        location=Location(type="Point"),
    )
    thing2 = Thing(
        sensor_uuid="uuid-2",
        name="S2",
        location=Location(type="Point"),
    )
    mock_async_cls.get_all_things = AsyncMock(return_value=[thing1, thing2])

    response = client.get("/api/v1/things/test_schema/all")

    assert response.status_code == 200
    assert len(response.json()) == 2


@patch("app.api.v1.endpoints.things.AsyncThingService")
def test_list_sensors_empty(mock_async_cls):
    """GET /things/{schema}/all returns empty list when None."""
    mock_async_cls.get_all_things = AsyncMock(return_value=None)

    response = client.get("/api/v1/things/test_schema/all")

    assert response.status_code == 200
    assert response.json() == []


# --- Get Thing Details ---


@patch("app.api.v1.endpoints.things.AsyncThingService")
def test_get_thing_details(mock_async_cls):
    """GET /things/{uuid} returns thing details."""
    mock_async_cls.get_schema_from_uuid = AsyncMock(return_value="test_schema")
    mock_instance = MagicMock()
    mock_instance.get_thing = AsyncMock(
        return_value={"name": "S1", "sensor_uuid": "abc"}
    )
    mock_async_cls.return_value = mock_instance

    response = client.get("/api/v1/things/abc")

    assert response.status_code == 200


@patch("app.api.v1.endpoints.things.AsyncThingService")
def test_get_thing_schema_not_found(mock_async_cls):
    """GET /things/{uuid} returns 404 when schema not found."""
    mock_async_cls.get_schema_from_uuid = AsyncMock(return_value=None)

    response = client.get("/api/v1/things/missing-uuid")

    assert response.status_code == 404


@patch("app.api.v1.endpoints.things.AsyncThingService")
def test_get_thing_not_found(mock_async_cls):
    """GET /things/{uuid} returns 404 when thing not found."""
    mock_async_cls.get_schema_from_uuid = AsyncMock(return_value="test_schema")
    mock_instance = MagicMock()
    mock_instance.get_thing = AsyncMock(return_value=None)
    mock_async_cls.return_value = mock_instance

    response = client.get("/api/v1/things/nonexistent")

    assert response.status_code == 404


# --- Get Datastreams ---


@patch("app.api.v1.endpoints.things.AsyncThingService")
def test_get_datastreams(mock_async_cls):
    """GET /things/{uuid}/datastreams returns datastream list."""
    mock_async_cls.get_schema_from_uuid = AsyncMock(return_value="test_schema")
    mock_instance = MagicMock()
    ds = Datastream(
        datastream_id="1",
        thing_id="10",
        sensor_uuid="abc",
        name="Temperature",
        unit_of_measurement=UnitOfMeasurement(
            definition="http://unit", symbol="C", label="Celsius"
        ),
    )
    mock_instance.get_sensor_datastreams = AsyncMock(return_value=[ds])
    mock_async_cls.return_value = mock_instance

    response = client.get("/api/v1/things/abc/datastreams")

    assert response.status_code == 200
    assert response.json()[0]["name"] == "Temperature"


@patch("app.api.v1.endpoints.things.AsyncThingService")
def test_get_datastreams_empty(mock_async_cls):
    """GET /things/{uuid}/datastreams returns empty for no datastreams."""
    mock_async_cls.get_schema_from_uuid = AsyncMock(return_value="test_schema")
    mock_instance = MagicMock()
    mock_instance.get_sensor_datastreams = AsyncMock(return_value=None)
    mock_async_cls.return_value = mock_instance

    response = client.get("/api/v1/things/abc/datastreams")

    assert response.status_code == 200
    assert response.json() == []


@patch("app.api.v1.endpoints.things.AsyncThingService")
def test_get_datastreams_schema_not_found(mock_async_cls):
    """GET /things/{uuid}/datastreams returns 404 for unknown schema."""
    mock_async_cls.get_schema_from_uuid = AsyncMock(return_value=None)

    response = client.get("/api/v1/things/missing/datastreams")

    assert response.status_code == 404


# --- Bulk Template ---


def test_bulk_template():
    """GET /things/bulk/template returns CSV template."""
    _override_auth()
    response = client.get("/api/v1/things/bulk/template")

    assert response.status_code == 200
    assert "text/csv" in response.headers.get("content-type", "")
    assert b"sensor_name" in response.content
    _cleanup()


# --- Update Datastream ---


@patch("app.api.v1.endpoints.things.AsyncThingService")
def test_update_datastream_by_id(mock_async_cls):
    """PUT /things/{uuid}/datastreams/id/{id} updates datastream."""
    mock_async_cls.get_schema_from_uuid = AsyncMock(return_value="test_schema")
    mock_instance = MagicMock()
    mock_instance.update_datastream_by_id = AsyncMock(return_value=True)
    mock_async_cls.return_value = mock_instance

    response = client.put(
        "/api/v1/things/abc/datastreams/id/42",
        json={"name": "Updated DS"},
    )

    assert response.status_code == 200
    assert response.json() is True


@patch("app.api.v1.endpoints.things.AsyncThingService")
def test_update_datastream_not_found(mock_async_cls):
    """PUT /things/{uuid}/datastreams/id/{id} returns 404."""
    mock_async_cls.get_schema_from_uuid = AsyncMock(return_value="test_schema")
    mock_instance = MagicMock()
    mock_instance.update_datastream_by_id = AsyncMock(return_value=False)
    mock_async_cls.return_value = mock_instance

    response = client.put(
        "/api/v1/things/abc/datastreams/id/999",
        json={"name": "X"},
    )

    assert response.status_code == 404
