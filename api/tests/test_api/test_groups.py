from unittest.mock import patch

from fastapi.testclient import TestClient

from app.api.deps import get_current_user
from app.main import app

client = TestClient(app)


@patch("app.api.v1.endpoints.groups.KeycloakService")
def test_list_groups_non_admin(mock_kc):
    app.dependency_overrides[get_current_user] = lambda: {
        "sub": "u1",
        "realm_access": {"roles": []},
    }
    mock_kc.get_user_groups.return_value = [{"id": "g1", "name": "G1"}]

    response = client.get("/api/v1/groups/")
    assert response.status_code == 200
    assert len(response.json()) == 1
    assert response.json()[0]["id"] == "g1"
    app.dependency_overrides = {}


@patch("app.api.v1.endpoints.groups.KeycloakService")
def test_create_group(mock_kc):
    app.dependency_overrides[get_current_user] = lambda: {
        "sub": "u1",
        "realm_access": {"roles": []},
    }
    mock_kc.get_group_by_name.return_value = None
    mock_kc.create_group.return_value = "new-group-id"
    mock_kc.set_group_attributes.return_value = None
    mock_kc.get_client_id.return_value = "client-uuid"
    mock_kc.create_subgroup.return_value = "sub-id"
    mock_kc.get_client_role.return_value = {"name": "viewer"}
    mock_kc.assign_group_client_roles.return_value = None
    mock_kc.get_subgroup_by_name.return_value = {"id": "admins-sub-id"}
    mock_kc.add_user_to_group.return_value = None

    response = client.post("/api/v1/groups/", json={"name": "NewGroup"})
    assert response.status_code == 201
    assert response.json()["name"] == "UFZ-TSM:NewGroup"
    mock_kc.add_user_to_group.assert_called_with("u1", "admins-sub-id")
    app.dependency_overrides = {}


@patch("app.api.v1.endpoints.groups._can_manage_group", return_value=True)
@patch("app.api.v1.endpoints.groups.KeycloakService")
def test_add_group_member_admin(mock_kc, mock_can_manage):
    app.dependency_overrides[get_current_user] = lambda: {
        "sub": "admin",
        "realm_access": {"roles": []},
    }

    mock_kc.get_user_by_username.return_value = {"id": "target_uid"}
    mock_kc.get_subgroup_by_name.return_value = {"id": "viewers-sub-id"}
    mock_kc.add_user_to_group.return_value = None

    response = client.post("/api/v1/groups/g1/members", json={"username": "target"})
    assert response.status_code == 201
    mock_kc.add_user_to_group.assert_called_with(
        user_id="target_uid", group_id="viewers-sub-id"
    )
    app.dependency_overrides = {}


@patch("app.api.v1.endpoints.groups._can_manage_group", return_value=False)
def test_add_group_member_forbidden(mock_can_manage):
    app.dependency_overrides[get_current_user] = lambda: {
        "sub": "u1",
        "realm_access": {"roles": []},
    }

    response = client.post("/api/v1/groups/g1/members", json={"username": "target"})
    assert response.status_code == 403
    app.dependency_overrides = {}
