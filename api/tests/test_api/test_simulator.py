"""
Simulator Endpoint Tests

Tests for simulated sensor creation, listing, start/stop, and deletion.
"""

from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.api.deps import get_current_user, get_db
from app.main import app

client = TestClient(app)

MOCK_USER = {
    "sub": "u1",
    "preferred_username": "testuser",
    "realm_access": {"roles": ["admin"]},
}


@pytest.fixture(autouse=True)
def override_deps():
    mock_db = MagicMock()
    mock_project = MagicMock()
    mock_project.id = uuid4()
    mock_project.authorization_provider_group_id = "group1"
    mock_project.schema_name = "test_schema"
    mock_project.name = "Test Project"
    mock_db.query.return_value.filter.return_value.first.return_value = mock_project
    mock_db.execute.return_value.scalars.return_value.all.return_value = []

    app.dependency_overrides[get_db] = lambda: mock_db
    app.dependency_overrides[get_current_user] = lambda: MOCK_USER
    yield {"db": mock_db, "project": mock_project}
    app.dependency_overrides = {}


def test_get_simulator_status(override_deps):
    """GET /projects/{id}/simulator/status returns available."""
    pid = override_deps["project"].id

    with patch("app.api.v1.endpoints.simulator.ProjectService"):
        response = client.get(f"/api/v1/projects/{pid}/simulator/status")

    assert response.status_code == 200
    assert response.json()["status"] == "available"


@patch("app.api.v1.endpoints.simulator.SimulatorService")
def test_create_simulated_thing(mock_sim_svc, override_deps):
    """POST /projects/{id}/simulator/things creates a simulated thing."""
    pid = str(override_deps["project"].id)
    mock_sim_svc.create_simulated_thing.return_value = {
        "uuid": "sim-uuid-1",
        "thing_uuid": "sim-uuid-1",
        "name": "SimSensor",
    }

    with patch("app.api.v1.endpoints.simulator.ProjectService") as mock_ps:
        mock_ps._check_access.return_value = override_deps["project"]
        mock_ps.add_sensor.return_value = None

        response = client.post(
            f"/api/v1/projects/{pid}/simulator/things",
            json={
                "thing": {
                    "sensor_name": "SimSensor",
                    "project_uuid": pid,
                    "description": "A simulated sensor",
                    "device_type": "chirpstack_generic",
                },
                "simulation": {
                    "datastreams": [
                        {
                            "name": "Temperature",
                            "unit": "°C",
                            "min_value": 10,
                            "max_value": 30,
                            "pattern": "sine",
                        }
                    ]
                },
            },
        )

    assert response.status_code == 200
    assert response.json()["uuid"] == "sim-uuid-1"


@patch("app.api.v1.endpoints.simulator.SimulatorService")
def test_create_simulated_thing_project_mismatch(mock_sim_svc, override_deps):
    """POST /projects/{id}/simulator/things rejects mismatched project_uuid."""
    pid = str(override_deps["project"].id)
    other_pid = str(uuid4())

    with patch("app.api.v1.endpoints.simulator.ProjectService") as mock_ps:
        mock_ps._check_access.return_value = override_deps["project"]

        response = client.post(
            f"/api/v1/projects/{pid}/simulator/things",
            json={
                "thing": {
                    "sensor_name": "S1",
                    "project_uuid": other_pid,
                    "device_type": "chirpstack_generic",
                },
                "simulation": {
                    "datastreams": [
                        {"name": "T", "unit": "C", "min_value": 0, "max_value": 1, "pattern": "sine"}
                    ]
                },
            },
        )

    assert response.status_code == 400


@patch("app.api.v1.endpoints.simulator.SimulatorService")
def test_create_simulated_thing_failure(mock_sim_svc, override_deps):
    """POST /projects/{id}/simulator/things returns 500 on failure."""
    pid = str(override_deps["project"].id)
    mock_sim_svc.create_simulated_thing.return_value = None

    with patch("app.api.v1.endpoints.simulator.ProjectService") as mock_ps:
        mock_ps._check_access.return_value = override_deps["project"]

        response = client.post(
            f"/api/v1/projects/{pid}/simulator/things",
            json={
                "thing": {
                    "sensor_name": "S1",
                    "project_uuid": pid,
                    "device_type": "chirpstack_generic",
                },
                "simulation": {
                    "datastreams": [
                        {"name": "T", "unit": "C", "min_value": 0, "max_value": 1, "pattern": "sine"}
                    ]
                },
            },
        )

    assert response.status_code == 500


@patch("app.api.v1.endpoints.simulator.SimulatorService")
def test_list_simulations(mock_sim_svc, override_deps):
    """GET /projects/{id}/simulator/simulations returns list."""
    pid = str(override_deps["project"].id)
    mock_sim_svc.get_all_simulated_things.return_value = [
        {"uuid": "s1", "name": "SimA"},
        {"uuid": "s2", "name": "SimB"},
    ]

    with patch("app.api.v1.endpoints.simulator.ProjectService"):
        response = client.get(f"/api/v1/projects/{pid}/simulator/simulations")

    assert response.status_code == 200
    assert len(response.json()) == 2


@patch("app.api.v1.endpoints.simulator.SimulatorService")
def test_delete_simulated_thing(mock_sim_svc, override_deps):
    """DELETE /projects/{id}/simulator/things/{thing_id} deletes thing."""
    pid = str(override_deps["project"].id)
    mock_sim_svc.delete_simulated_thing.return_value = True

    with patch("app.api.v1.endpoints.simulator.ProjectService") as mock_ps:
        mock_ps._check_access.return_value = override_deps["project"]
        mock_ps.remove_sensor.return_value = None

        response = client.delete(
            f"/api/v1/projects/{pid}/simulator/things/thing-123"
        )

    assert response.status_code == 200
    assert "deleted" in response.json()["message"].lower()


@patch("app.api.v1.endpoints.simulator.SimulatorService")
def test_delete_simulated_thing_failure(mock_sim_svc, override_deps):
    """DELETE /projects/{id}/simulator/things/{id} returns 500 on failure."""
    pid = str(override_deps["project"].id)
    mock_sim_svc.delete_simulated_thing.return_value = False

    with patch("app.api.v1.endpoints.simulator.ProjectService") as mock_ps:
        mock_ps._check_access.return_value = override_deps["project"]

        response = client.delete(
            f"/api/v1/projects/{pid}/simulator/things/thing-123"
        )

    assert response.status_code == 500
