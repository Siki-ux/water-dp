from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest

from app.core.exceptions import (
    AuthorizationException,
)
from app.models.user_context import Dashboard, Project, ProjectMember
from app.schemas.user_context import (
    DashboardCreate,
    ProjectCreate,
)
from app.services.dashboard_service import DashboardService
from app.services.project_service import ProjectService

# Constants
USER_OWNER = {
    "sub": "owner-123",
    "realm_access": {"roles": ["user"]},
    "groups": ["/UFZ-TSM:group-123/admins"],
}
USER_ADMIN = {
    "sub": "admin-999",
    "realm_access": {"roles": ["admin"]},
    "groups": ["admin-group"],
}
USER_MEMBER = {
    "sub": "member-456",
    "realm_access": {"roles": ["user"]},
    "groups": ["/UFZ-TSM:group-123/editors"],
}
USER_OTHER = {
    "sub": "other-789",
    "realm_access": {"roles": ["user"]},
    "groups": ["other-group"],
}


@pytest.fixture
def mock_db():
    return MagicMock()


@pytest.fixture
def sample_project():
    return Project(
        id=uuid4(), name="Test Project", description="Desc", owner_id=USER_OWNER["sub"]
    )


@pytest.fixture
def sample_dashboard(sample_project):
    return Dashboard(
        id=uuid4(), project_id=sample_project.id, name="Test Dash", is_public=False
    )


class TestProjectService:
    @patch("app.services.project_service.KeycloakService")
    @patch("app.services.project_service.TimeIODatabase")
    def test_create_project(self, mock_timeio, mock_kc, mock_db):
        p_in = ProjectCreate(
            name="New Project",
            description="New Desc",
            authorization_provider_group_id="group-123",
        )

        # Mock Keycloak
        mock_kc.get_group.return_value = {
            "id": "group-123",
            "name": "UFZ-TSM:group-123",
        }
        mock_kc.get_group_schema_name.return_value = None
        mock_kc.get_group_by_name.return_value = {
            "id": "group-123",
            "name": "UFZ-TSM:group-123",
            "attributes": {},
        }
        mock_kc.set_group_attributes.return_value = None

        # Mock TimeIO
        mock_timeio.return_value.get_config_project_by_name.return_value = None

        result = ProjectService.create_project(mock_db, p_in, USER_OWNER)

        assert result.name == "New Project"
        assert result.owner_id == USER_OWNER["sub"]
        # add is called twice: once for project, once for ProjectMember (owner)
        assert mock_db.add.call_count == 2
        mock_db.commit.assert_called_once()

    @patch("app.services.project_service.PermissionResolver")
    def test_get_project_owner_success(self, mock_resolver, mock_db, sample_project):
        mock_db.query.return_value.filter.return_value.first.return_value = (
            sample_project
        )

        mock_perms = MagicMock()
        mock_perms.can_view = True
        mock_perms.effective_role = "owner"
        mock_resolver.resolve.return_value = mock_perms

        result = ProjectService.get_project(mock_db, sample_project.id, USER_OWNER)
        assert result.id == sample_project.id

    @patch("app.services.project_service.PermissionResolver")
    def test_get_project_admin_success(self, mock_resolver, mock_db, sample_project):
        mock_db.query.return_value.filter.return_value.first.return_value = (
            sample_project
        )

        mock_perms = MagicMock()
        mock_perms.can_view = True
        mock_perms.effective_role = "owner"
        mock_resolver.resolve.return_value = mock_perms

        result = ProjectService.get_project(mock_db, sample_project.id, USER_ADMIN)
        assert result.id == sample_project.id

    @patch("app.services.project_service.PermissionResolver")
    def test_get_project_member_success(self, mock_resolver, mock_db, sample_project):
        mock_db.query.return_value.filter.return_value.first.return_value = (
            sample_project
        )

        mock_perms = MagicMock()
        mock_perms.can_view = True
        mock_perms.effective_role = "viewer"
        mock_resolver.resolve.return_value = mock_perms

        result = ProjectService.get_project(mock_db, sample_project.id, USER_MEMBER)
        assert result == sample_project

    @patch("app.services.project_service.PermissionResolver")
    def test_get_project_access_denied(self, mock_resolver, mock_db, sample_project):
        mock_db.query.return_value.filter.return_value.first.return_value = (
            sample_project
        )

        mock_perms = MagicMock()
        mock_perms.can_view = False
        mock_resolver.resolve.return_value = mock_perms

        with pytest.raises(AuthorizationException) as exc:
            ProjectService.get_project(mock_db, sample_project.id, USER_OTHER)
        assert "Not authorized" in exc.value.message


class TestDashboardService:
    def test_get_public_dashboard(self, mock_db, sample_dashboard):
        sample_dashboard.is_public = True
        mock_db.query.return_value.filter.return_value.first.return_value = (
            sample_dashboard
        )

        result = DashboardService.get_dashboard(mock_db, sample_dashboard.id, None)
        assert result.id == sample_dashboard.id

    def test_create_dashboard_success(self, mock_db, sample_project):
        editor_member = ProjectMember(
            project_id=sample_project.id, user_id=USER_MEMBER["sub"], role="editor"
        )

        def query_side_effect(model):
            m = MagicMock()
            if model == Project:
                m.filter.return_value.first.return_value = sample_project
            elif model == ProjectMember:
                m.filter.return_value.first.return_value = editor_member
            return m

        mock_db.query.side_effect = query_side_effect

        d_in = DashboardCreate(
            project_id=sample_project.id,
            name="New Dash",
            widgets=[{"type": "chart", "sensor_id": "123"}],
        )
        result = DashboardService.create_dashboard(mock_db, d_in, USER_MEMBER)

        assert result.name == "New Dash"
        assert result.project_id == sample_project.id
        assert isinstance(result.widgets, list)
        assert len(result.widgets) == 1

    def test_update_dashboard_success(self, mock_db, sample_dashboard):
        mock_db.query.return_value.filter.return_value.first.return_value = (
            sample_dashboard
        )

        with pytest.MonkeyPatch.context() as mp:
            mp.setattr(ProjectService, "_check_access", MagicMock())

            from app.schemas.user_context import DashboardUpdate

            d_in = DashboardUpdate(name="Updated Dash")

            result = DashboardService.update_dashboard(
                mock_db, sample_dashboard.id, d_in, USER_MEMBER
            )

            assert result.name == "Updated Dash"
            mock_db.commit.assert_called()

    def test_delete_dashboard_success(self, mock_db, sample_dashboard):
        mock_db.query.return_value.filter.return_value.first.return_value = (
            sample_dashboard
        )

        with pytest.MonkeyPatch.context() as mp:
            mp.setattr(ProjectService, "_check_access", MagicMock())

            DashboardService.delete_dashboard(mock_db, sample_dashboard.id, USER_MEMBER)

            mock_db.delete.assert_called_with(sample_dashboard)
            mock_db.commit.assert_called()


class TestProjectServiceExtended:
    """Additional tests for coverage."""

    def test_update_project(self, mock_db, sample_project):
        with pytest.MonkeyPatch.context() as mp:
            mp.setattr(
                ProjectService, "_check_access", MagicMock(return_value=sample_project)
            )

            from app.schemas.user_context import ProjectUpdate

            p_in = ProjectUpdate(name="Updated Name")

            result = ProjectService.update_project(
                mock_db, sample_project.id, p_in, USER_OWNER
            )
            assert result.name == "Updated Name"
            mock_db.commit.assert_called()

    @patch("app.services.project_service.PermissionResolver")
    def test_delete_project(self, mock_resolver, mock_db, sample_project):
        mock_db.query.return_value.filter.return_value.first.return_value = (
            sample_project
        )

        mock_perms = MagicMock()
        mock_perms.can_delete = True
        mock_perms.effective_role = "owner"
        mock_resolver.resolve.return_value = mock_perms

        ProjectService.delete_project(mock_db, sample_project.id, USER_OWNER)

        mock_db.delete.assert_called_with(sample_project)
        mock_db.commit.assert_called()

    def test_remove_sensor(self, mock_db, sample_project):
        with pytest.MonkeyPatch.context() as mp:
            mp.setattr(ProjectService, "_check_access", MagicMock())

            sensor_uuid = str(uuid4())
            ProjectService.remove_sensor(
                mock_db, sample_project.id, sensor_uuid, USER_MEMBER
            )

            mock_db.execute.assert_called()
            mock_db.commit.assert_called()
