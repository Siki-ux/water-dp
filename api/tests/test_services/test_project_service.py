import uuid
from unittest.mock import MagicMock, patch

import pytest

from app.core.exceptions import AuthorizationException
from app.models.user_context import Project
from app.services.project_service import ProjectService


@pytest.fixture
def mock_db_session():
    return MagicMock()


@pytest.fixture
def mock_user():
    return {
        "sub": str(uuid.uuid4()),
        "preferred_username": "testuser",
        "realm_access": {"roles": []},
        "groups": ["/UFZ-TSM:group1/admins"],
        "eduperson_entitlement": [],
    }


@pytest.fixture
def mock_admin_user():
    return {
        "sub": str(uuid.uuid4()),
        "preferred_username": "admin",
        "realm_access": {"roles": ["admin"]},
        "groups": [],
        "eduperson_entitlement": [],
    }


@patch("app.services.project_service.KeycloakService")
def test_create_project_success(mock_kc, mock_db_session, mock_user):
    from app.schemas.user_context import ProjectCreate

    project_in = ProjectCreate(
        name="Test Project",
        description="Desc",
        authorization_provider_group_id="group1",
    )

    # Mock Keycloak: group lookup returns matching group
    mock_kc.get_group.return_value = {"id": "group1", "name": "UFZ-TSM:group1"}
    mock_kc.get_group_schema_name.return_value = None
    mock_kc.get_group_by_name.return_value = {
        "id": "group1",
        "name": "UFZ-TSM:group1",
        "attributes": {},
    }
    mock_kc.set_group_attributes.return_value = None

    # Mock TimeIODatabase
    with patch("app.services.project_service.TimeIODatabase") as mock_timeio:
        mock_timeio.return_value.get_config_project_by_name.return_value = None

        mock_db_session.add.return_value = None
        mock_db_session.flush.return_value = None
        mock_db_session.commit.return_value = None
        mock_db_session.refresh.return_value = None

        ProjectService.create_project(mock_db_session, project_in, mock_user)

        assert mock_db_session.add.called
        # First add call is the project
        added_project = mock_db_session.add.call_args_list[0][0][0]
        assert added_project.name == "Test Project"
        assert added_project.owner_id == mock_user["sub"]


@patch("app.services.project_service.PermissionResolver")
def test_get_project_owner_access(mock_resolver, mock_db_session, mock_user):
    project_id = uuid.uuid4()
    project = Project(
        id=project_id,
        owner_id=mock_user["sub"],
        authorization_provider_group_id="other",
    )

    mock_db_session.query.return_value.filter.return_value.first.return_value = project

    # Mock PermissionResolver to grant access
    mock_perms = MagicMock()
    mock_perms.can_view = True
    mock_perms.effective_role = "owner"
    mock_resolver.resolve.return_value = mock_perms

    result = ProjectService.get_project(mock_db_session, project_id, mock_user)
    assert result == project


@patch("app.services.project_service.PermissionResolver")
def test_get_project_group_access(mock_resolver, mock_db_session, mock_user):
    project_id = uuid.uuid4()
    project = Project(
        id=project_id, owner_id="other", authorization_provider_group_id="group1"
    )

    mock_db_session.query.return_value.filter.return_value.first.return_value = project

    mock_perms = MagicMock()
    mock_perms.can_view = True
    mock_perms.effective_role = "viewer"
    mock_resolver.resolve.return_value = mock_perms

    result = ProjectService.get_project(mock_db_session, project_id, mock_user)
    assert result == project


@patch("app.services.project_service.PermissionResolver")
def test_get_project_no_access(mock_resolver, mock_db_session, mock_user):
    project_id = uuid.uuid4()
    project = Project(
        id=project_id, owner_id="other", authorization_provider_group_id="other_group"
    )

    mock_db_session.query.return_value.filter.return_value.first.return_value = project

    mock_perms = MagicMock()
    mock_perms.can_view = False
    mock_resolver.resolve.return_value = mock_perms

    with pytest.raises(AuthorizationException):
        ProjectService.get_project(mock_db_session, project_id, mock_user)


@patch("app.services.project_service.PermissionResolver")
def test_delete_project_owner(mock_resolver, mock_db_session, mock_user):
    project_id = uuid.uuid4()
    project = Project(id=project_id, owner_id=mock_user["sub"])

    mock_db_session.query.return_value.filter.return_value.first.return_value = project

    mock_perms = MagicMock()
    mock_perms.can_delete = True
    mock_perms.effective_role = "owner"
    mock_resolver.resolve.return_value = mock_perms

    ProjectService.delete_project(mock_db_session, project_id, mock_user)
    mock_db_session.delete.assert_called_with(project)


@patch("app.services.project_service.PermissionResolver")
def test_delete_project_not_owner_not_admin(mock_resolver, mock_db_session, mock_user):
    project_id = uuid.uuid4()
    project = Project(id=project_id, owner_id="other")

    mock_db_session.query.return_value.filter.return_value.first.return_value = project

    mock_perms = MagicMock()
    mock_perms.can_delete = False
    mock_resolver.resolve.return_value = mock_perms

    with pytest.raises(AuthorizationException):
        ProjectService.delete_project(mock_db_session, project_id, mock_user)


@patch("app.services.project_service.PermissionResolver")
def test_get_linked_sensors(mock_resolver, mock_db_session, mock_user):
    """Test get_linked_sensors returns sensors linked to project."""
    project_id = uuid.uuid4()
    thing_uuid = "11111111-1111-1111-1111-111111111111"
    project = Project(
        id=project_id,
        name="p1",
        owner_id=mock_user["sub"],
        authorization_provider_group_id="g1",
        schema_name="test_schema",
    )

    mock_db_session.query.return_value.filter.return_value.first.return_value = project

    mock_perms = MagicMock()
    mock_perms.can_view = True
    mock_perms.effective_role = "viewer"
    mock_resolver.resolve.return_value = mock_perms

    # Mock the linked UUIDs query
    mock_db_session.execute.return_value.scalars.return_value.all.return_value = [
        uuid.UUID(thing_uuid)
    ]

    # Mock ThingService.get_things to return a Thing with matching sensor_uuid
    mock_thing = MagicMock()
    mock_thing.sensor_uuid = thing_uuid
    mock_thing.name = "s1"

    with patch("app.services.project_service.ThingService") as mock_thing_svc:
        mock_thing_svc.return_value.get_things.return_value = [mock_thing]

        with patch("app.services.project_service.TimeIODatabase"):
            result = ProjectService.get_linked_sensors(
                mock_db_session, project_id, mock_user
            )
            assert len(result) == 1
