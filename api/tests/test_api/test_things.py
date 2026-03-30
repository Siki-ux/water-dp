from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

from fastapi.testclient import TestClient

from app.api.deps import get_current_user, get_db
from app.main import app

client = TestClient(app)


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
