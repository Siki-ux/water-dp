from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest

from app.api import deps
from app.main import app
from app.schemas.user_context import (
    DashboardResponse,
    ProjectResponse,
)

# Mock User Data
MOCK_USER_ID = "user-123"
MOCK_USER = {"sub": MOCK_USER_ID, "realm_access": {"roles": ["viewer"]}}
MOCK_ADMIN = {"sub": "admin-123", "realm_access": {"roles": ["admin"]}}


@pytest.fixture
def normal_user_token():
    app.dependency_overrides[deps.get_current_user] = lambda: MOCK_USER
    yield
    app.dependency_overrides.pop(deps.get_current_user, None)


@pytest.fixture
def mock_project_service():
    with patch("app.api.v1.endpoints.projects.ProjectService") as mock:
        yield mock


@pytest.fixture
def mock_dashboard_service():
    with patch(
        "app.api.v1.endpoints.projects.DashboardService"
    ) as mock:  # For convenience endpoint
        with patch("app.api.v1.endpoints.dashboards.DashboardService") as mock_dash:
            yield (mock, mock_dash)


# --- Tests ---


def test_create_project(client, normal_user_token, mock_project_service):
    # Setup Mock
    project_id = uuid4()
    mock_project_service.create_project.return_value = ProjectResponse(
        id=project_id,
        name="My Project",
        description="Test Project",
        owner_id=MOCK_USER_ID,
        created_at="2024-01-01T00:00:00",
        updated_at="2024-01-01T00:00:00",
    )

    response = client.post(
        "/api/v1/projects/",
        json={
            "name": "My Project",
            "description": "Test Project",
            "authorization_provider_group_id": "group-123",
        },
    )

    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "My Project"
    assert data["id"] == str(project_id)
    mock_project_service.create_project.assert_called_once()


@patch("app.services.rbac_service.PermissionResolver")
def test_list_projects(mock_resolver, client, normal_user_token, mock_project_service):
    project_id = uuid4()
    mock_project = MagicMock()
    mock_project.id = project_id
    mock_project.name = "P1"
    mock_project.description = None
    mock_project.owner_id = MOCK_USER_ID
    mock_project.authorization_provider_group_id = None
    mock_project.authorization_provider_group_name = None
    mock_project.schema_name = None
    mock_project.properties = None
    mock_project.created_at = "2024-01-01"
    mock_project.updated_at = "2024-01-01"

    mock_project_service.list_projects.return_value = [mock_project]

    # Mock PermissionResolver.resolve_batch to return permissions map
    mock_perms = MagicMock()
    mock_perms.effective_role = "owner"
    mock_resolver.resolve_batch.return_value = {project_id: mock_perms}

    response = client.get("/api/v1/projects/")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["name"] == "P1"


@patch("app.services.rbac_service.PermissionResolver")
def test_list_projects_includes_sensor_count(
    mock_resolver, client, mock_db_session, normal_user_token, mock_project_service
):
    """Verify that list_projects endpoint returns sensor_count per project."""
    pid1 = uuid4()
    pid2 = uuid4()

    def make_mock_project(pid, name):
        p = MagicMock()
        p.id = pid
        p.name = name
        p.description = None
        p.owner_id = MOCK_USER_ID
        p.authorization_provider_group_id = None
        p.authorization_provider_group_name = None
        p.schema_name = None
        p.properties = None
        p.created_at = "2024-01-01"
        p.updated_at = "2024-01-01"
        return p

    mock_project_service.list_projects.return_value = [
        make_mock_project(pid1, "P1"),
        make_mock_project(pid2, "P2"),
    ]

    mock_perms = MagicMock()
    mock_perms.effective_role = "editor"
    mock_resolver.resolve_batch.return_value = {pid1: mock_perms, pid2: mock_perms}

    # Mock database.execute for sensor counts
    mock_row1 = MagicMock()
    mock_row1.project_id = pid1
    mock_row1.cnt = 5
    mock_row2 = MagicMock()
    mock_row2.project_id = pid2
    mock_row2.cnt = 12
    mock_db_session.execute.return_value.all.return_value = [mock_row1, mock_row2]

    response = client.get("/api/v1/projects/")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2
    counts = {d["name"]: d["sensor_count"] for d in data}
    assert counts["P1"] == 5
    assert counts["P2"] == 12


@patch("app.services.rbac_service.PermissionResolver")
def test_list_projects_sensor_count_defaults_to_zero(
    mock_resolver, client, mock_db_session, normal_user_token, mock_project_service
):
    """Projects with no linked sensors should have sensor_count=0."""
    pid = uuid4()
    mock_project = MagicMock()
    mock_project.id = pid
    mock_project.name = "Empty"
    mock_project.description = None
    mock_project.owner_id = MOCK_USER_ID
    mock_project.authorization_provider_group_id = None
    mock_project.authorization_provider_group_name = None
    mock_project.schema_name = None
    mock_project.properties = None
    mock_project.created_at = "2024-01-01"
    mock_project.updated_at = "2024-01-01"

    mock_project_service.list_projects.return_value = [mock_project]
    mock_perms = MagicMock()
    mock_perms.effective_role = "viewer"
    mock_resolver.resolve_batch.return_value = {pid: mock_perms}

    # Empty list — no linked sensors
    mock_db_session.execute.return_value.all.return_value = []

    response = client.get("/api/v1/projects/")
    assert response.status_code == 200
    data = response.json()
    assert data[0]["sensor_count"] == 0


def test_get_project(client, normal_user_token, mock_project_service):
    pid = uuid4()
    mock_project_service.get_project.return_value = ProjectResponse(
        id=pid,
        name="P1",
        owner_id=MOCK_USER_ID,
        created_at="2024-01-01",
        updated_at="2024-01-01",
    )

    response = client.get(f"/api/v1/projects/{pid}")
    assert response.status_code == 200
    assert response.json()["id"] == str(pid)


@pytest.fixture
def mock_keycloak_service():
    with patch("app.services.keycloak_service.KeycloakService") as mock:
        yield mock


# Member management via projects API is disabled.


def test_dashboard_creation(client, normal_user_token, mock_dashboard_service):
    mock_pd_service, _ = mock_dashboard_service
    pid = uuid4()
    did = uuid4()

    mock_pd_service.create_dashboard.return_value = DashboardResponse(
        id=did,
        project_id=pid,
        name="D1",
        is_public=False,
        created_at="2024-01-01",
        updated_at="2024-01-01",
    )

    response = client.post(f"/api/v1/projects/{pid}/dashboards", json={"name": "D1"})
    assert response.status_code == 200
    assert response.json()["id"] == str(did)
