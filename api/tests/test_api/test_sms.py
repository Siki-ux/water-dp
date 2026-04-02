"""
SMS Endpoint Tests

Tests for the Sensor Management System API endpoints.
"""

from unittest.mock import AsyncMock, patch

import pytest

from app.api import deps
from app.main import app

MOCK_USER = {
    "sub": "test-user-id",
    "realm_access": {"roles": ["admin"]},
    "groups": ["/TestGroup/editors"],
}


@pytest.fixture(autouse=True)
def override_auth():
    app.dependency_overrides[deps.get_current_user] = lambda: MOCK_USER
    yield
    app.dependency_overrides.pop(deps.get_current_user, None)


@patch("app.api.v1.endpoints.sms.SMSService")
def test_list_sensors_returns_paginated(mock_sms_service, client):
    """GET /sms/sensors returns paginated sensor list."""
    mock_sms_service.get_all_sensors_extended = AsyncMock(
        return_value={"items": [{"uuid": "abc-123", "name": "Sensor1"}], "total": 1}
    )

    response = client.get("/api/v1/sms/sensors?page=1&page_size=10")

    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert len(data["items"]) == 1
    assert data["page"] == 1


@patch("app.api.v1.endpoints.sms.SMSService")
def test_list_sensors_empty(mock_sms_service, client):
    """GET /sms/sensors returns empty list when no sensors."""
    mock_sms_service.get_all_sensors_extended = AsyncMock(
        return_value={"items": [], "total": 0}
    )

    response = client.get("/api/v1/sms/sensors")

    assert response.status_code == 200
    assert response.json()["total"] == 0


@patch("app.api.v1.endpoints.sms.SMSService")
def test_list_sensors_page_size_validation(mock_sms_service, client):
    """GET /sms/sensors rejects page_size > 100."""
    response = client.get("/api/v1/sms/sensors?page_size=200")

    assert response.status_code == 422


@patch("app.api.v1.endpoints.sms.SMSService")
def test_get_sensor_details(mock_sms_service, client):
    """GET /sms/sensors/{uuid} returns sensor details."""
    mock_sms_service.get_sensor_details = AsyncMock(
        return_value={"uuid": "abc-123", "name": "TestSensor", "schema_name": "proj_a"}
    )

    response = client.get("/api/v1/sms/sensors/abc-123")

    assert response.status_code == 200
    assert response.json()["uuid"] == "abc-123"


@patch("app.api.v1.endpoints.sms.SMSService")
def test_get_sensor_details_not_found(mock_sms_service, client):
    """GET /sms/sensors/{uuid} returns 404 when not found."""
    mock_sms_service.get_sensor_details = AsyncMock(return_value=None)

    response = client.get("/api/v1/sms/sensors/nonexistent")

    assert response.status_code == 404


# --- Update Sensor ---


@patch("app.api.v1.endpoints.sms.SMSService")
def test_update_sensor_success(mock_sms_service, client):
    """PUT /sms/sensors/{uuid} updates and returns sensor."""
    mock_sms_service.update_sensor = AsyncMock(
        return_value={"uuid": "abc-123", "name": "Updated"}
    )

    response = client.put("/api/v1/sms/sensors/abc-123", json={"name": "Updated"})

    assert response.status_code == 200
    assert response.json()["name"] == "Updated"


@patch("app.api.v1.endpoints.sms.SMSService")
def test_update_sensor_not_found(mock_sms_service, client):
    """PUT /sms/sensors/{uuid} returns 404 when not found."""
    mock_sms_service.update_sensor = AsyncMock(return_value=None)

    response = client.put("/api/v1/sms/sensors/nonexistent", json={"name": "X"})

    assert response.status_code == 404


# --- Delete Sensor ---


@patch("app.api.v1.endpoints.sms.SMSService")
def test_delete_sensor_success(mock_sms_service, client):
    """DELETE /sms/sensors/{uuid} deletes a sensor."""
    mock_sms_service.delete_sensor = AsyncMock(return_value=True)

    response = client.delete("/api/v1/sms/sensors/abc-123")

    assert response.status_code == 204


@patch("app.api.v1.endpoints.sms.SMSService")
def test_delete_sensor_not_found(mock_sms_service, client):
    """DELETE /sms/sensors/{uuid} returns 404 when not found."""
    mock_sms_service.delete_sensor = AsyncMock(return_value=False)

    response = client.delete("/api/v1/sms/sensors/nonexistent")

    assert response.status_code == 404


@patch("app.api.v1.endpoints.sms.SMSService")
def test_delete_sensor_with_source_deletion(mock_sms_service, client):
    """DELETE /sms/sensors/{uuid}?delete_from_source=true passes flag."""
    mock_sms_service.delete_sensor = AsyncMock(return_value=True)

    response = client.delete("/api/v1/sms/sensors/abc-123?delete_from_source=true")

    assert response.status_code == 204
    mock_sms_service.delete_sensor.assert_awaited_once_with(
        "abc-123", delete_from_source=True
    )


# --- Device Types ---


@patch("app.api.v1.endpoints.sms.SMSService")
def test_list_device_types(mock_sms_service, client):
    """GET /sms/attributes/device-types returns paginated list."""
    mock_sms_service.get_all_device_types.return_value = {
        "items": [{"id": "dt1", "name": "Generic"}],
        "total": 1,
    }

    response = client.get("/api/v1/sms/attributes/device-types")

    assert response.status_code == 200
    assert response.json()["total"] == 1


@patch("app.api.v1.endpoints.sms.SMSService")
def test_get_device_type_details(mock_sms_service, client):
    """GET /sms/attributes/device-types/{id} returns device type."""
    mock_sms_service.get_device_type_details = AsyncMock(
        return_value={"id": "dt1", "name": "Generic", "parser": None}
    )

    response = client.get("/api/v1/sms/attributes/device-types/dt1")

    assert response.status_code == 200
    assert response.json()["id"] == "dt1"


@patch("app.api.v1.endpoints.sms.SMSService")
def test_get_device_type_not_found(mock_sms_service, client):
    """GET /sms/attributes/device-types/{id} returns 404."""
    mock_sms_service.get_device_type_details = AsyncMock(return_value=None)

    response = client.get("/api/v1/sms/attributes/device-types/missing")

    assert response.status_code == 404


@patch("app.api.v1.endpoints.sms.SMSService")
def test_delete_device_type_success(mock_sms_service, client):
    """DELETE /sms/attributes/device-types/{id} deletes type."""
    mock_sms_service.delete_device_type.return_value = True

    response = client.delete("/api/v1/sms/attributes/device-types/dt1")

    assert response.status_code == 204


@patch("app.api.v1.endpoints.sms.SMSService")
def test_delete_device_type_not_found(mock_sms_service, client):
    """DELETE /sms/attributes/device-types/{id} returns 404."""
    mock_sms_service.delete_device_type.return_value = False

    response = client.delete("/api/v1/sms/attributes/device-types/missing")

    assert response.status_code == 404


# --- Parsers ---


@patch("app.api.v1.endpoints.sms.SMSService")
def test_list_parsers(mock_sms_service, client):
    """GET /sms/attributes/parsers returns parsers list."""
    mock_sms_service.get_all_parsers.return_value = {
        "items": [{"id": 1, "name": "CSV Basic"}],
        "total": 1,
    }

    response = client.get("/api/v1/sms/attributes/parsers")

    assert response.status_code == 200
    assert response.json()["total"] == 1


@patch("app.api.v1.endpoints.sms.SMSService")
def test_get_parser(mock_sms_service, client):
    """GET /sms/parsers/{uuid} returns parser details."""
    mock_sms_service.get_parser_details.return_value = {
        "id": 1,
        "name": "CSV Basic",
    }

    response = client.get("/api/v1/sms/parsers/some-uuid")

    assert response.status_code == 200


@patch("app.api.v1.endpoints.sms.SMSService")
def test_get_parser_not_found(mock_sms_service, client):
    """GET /sms/parsers/{uuid} returns 404."""
    mock_sms_service.get_parser_details.return_value = None

    response = client.get("/api/v1/sms/parsers/missing-uuid")

    assert response.status_code == 404


@patch("app.api.v1.endpoints.sms.SMSService")
def test_update_parser(mock_sms_service, client):
    """PUT /sms/parsers/{uuid} updates parser."""
    mock_sms_service.update_parser.return_value = {"id": 1, "name": "Updated"}

    response = client.put("/api/v1/sms/parsers/some-uuid", json={"name": "Updated"})

    assert response.status_code == 200


@patch("app.api.v1.endpoints.sms.SMSService")
def test_update_parser_not_found(mock_sms_service, client):
    """PUT /sms/parsers/{uuid} returns 404."""
    mock_sms_service.update_parser.return_value = None

    response = client.put("/api/v1/sms/parsers/missing-uuid", json={"name": "X"})

    assert response.status_code == 404


@patch("app.api.v1.endpoints.sms.SMSService")
def test_delete_parser_success(mock_sms_service, client):
    """DELETE /sms/parsers/{id} deletes parser."""
    mock_sms_service.delete_parser.return_value = {"success": True}

    response = client.delete("/api/v1/sms/parsers/1")

    assert response.status_code == 204


@patch("app.api.v1.endpoints.sms.SMSService")
def test_delete_parser_conflict(mock_sms_service, client):
    """DELETE /sms/parsers/{id} returns 409 when linked."""
    mock_sms_service.delete_parser.return_value = {
        "success": False,
        "reason": "Parser in use",
        "linked_sensors": ["abc"],
    }

    response = client.delete("/api/v1/sms/parsers/1")

    assert response.status_code == 409
    assert "linked_sensors" in response.json()["detail"]


# --- CSV Parser ---


@patch("app.api.v1.endpoints.sms.SMSService")
def test_create_csv_parser(mock_sms_service, client):
    """POST /sms/parsers/csv creates a CSV parser."""
    mock_sms_service.create_csv_parser.return_value = {"id": 42, "name": "New CSV"}

    response = client.post(
        "/api/v1/sms/parsers/csv",
        json={
            "name": "New CSV",
            "delimiter": ",",
            "timestamp_column": 0,
            "timestamp_format": "%Y-%m-%d",
        },
    )

    assert response.status_code == 201


@patch("app.api.v1.endpoints.sms.SMSService")
def test_create_csv_parser_failure(mock_sms_service, client):
    """POST /sms/parsers/csv returns 500 on failure."""
    mock_sms_service.create_csv_parser.return_value = None

    response = client.post(
        "/api/v1/sms/parsers/csv",
        json={
            "name": "Fail CSV",
            "delimiter": ",",
            "timestamp_column": 0,
            "timestamp_format": "%Y-%m-%d",
        },
    )

    assert response.status_code == 500


# --- Ingest Types ---


@patch("app.api.v1.endpoints.sms.SMSService")
def test_list_ingest_types(mock_sms_service, client):
    """GET /sms/attributes/ingest-types returns list."""
    mock_sms_service.get_all_ingest_types.return_value = [
        {"id": "mqtt", "name": "MQTT"},
        {"id": "sftp", "name": "SFTP"},
    ]

    response = client.get("/api/v1/sms/attributes/ingest-types")

    assert response.status_code == 200
    assert len(response.json()) == 2
