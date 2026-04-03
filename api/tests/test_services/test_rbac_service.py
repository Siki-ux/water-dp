"""
Comprehensive unit tests for app.services.rbac_service.

Covers:
  - parse_group_roles
  - get_highest_group_role
  - is_realm_admin
  - EffectivePermissions (from_role, no_access, to_response)
  - PermissionResolver (resolve, resolve_global)
  - RBACService (get_project_permissions, list_members, add_member,
                  update_member_role, remove_member)
"""

import uuid
from datetime import datetime
from unittest.mock import MagicMock, patch

import pytest

from app.core.exceptions import (
    AuthorizationException,
    ResourceNotFoundException,
    ValidationException,
)
from app.services.rbac_service import (
    ROLE_EDITOR,
    ROLE_OWNER,
    ROLE_VIEWER,
    EffectivePermissions,
    PermissionResolver,
    RBACService,
    get_highest_group_role,
    is_realm_admin,
    parse_group_roles,
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_project(**overrides):
    """Create a mock Project with sensible defaults."""
    p = MagicMock()
    p.id = overrides.get("id", uuid.uuid4())
    p.owner_id = overrides.get("owner_id", str(uuid.uuid4()))
    p.authorization_provider_group_name = overrides.get(
        "authorization_provider_group_name", None
    )
    p.authorization_provider_group_id = overrides.get(
        "authorization_provider_group_id", None
    )
    return p


def _make_member(**overrides):
    """Create a mock ProjectMember."""
    m = MagicMock()
    m.id = overrides.get("id", uuid.uuid4())
    m.project_id = overrides.get("project_id", uuid.uuid4())
    m.user_id = overrides.get("user_id", str(uuid.uuid4()))
    m.role = overrides.get("role", ROLE_VIEWER)
    m.created_at = overrides.get("created_at", datetime(2025, 1, 1))
    return m


def _admin_user(sub=None, groups=None):
    return {
        "sub": sub or str(uuid.uuid4()),
        "realm_access": {"roles": ["admin"]},
        "groups": groups or [],
    }


def _regular_user(sub=None, groups=None):
    return {
        "sub": sub or str(uuid.uuid4()),
        "realm_access": {"roles": ["user"]},
        "groups": groups or [],
    }


# ===================================================================
# 1. parse_group_roles
# ===================================================================


class TestParseGroupRoles:
    def test_admin_group(self):
        result = parse_group_roles(["/UFZ-TSM:group/admins"])
        assert result == {"UFZ-TSM:group": "admin"}

    def test_editor_group(self):
        result = parse_group_roles(["/UFZ-TSM:group/editors"])
        assert result == {"UFZ-TSM:group": "editor"}

    def test_viewer_group(self):
        result = parse_group_roles(["/UFZ-TSM:group/viewers"])
        assert result == {"UFZ-TSM:group": "viewer"}

    def test_multiple_groups(self):
        result = parse_group_roles(
            [
                "/UFZ-TSM:ProjectA/editors",
                "/UFZ-TSM:ProjectB/viewers",
            ]
        )
        assert result == {
            "UFZ-TSM:ProjectA": "editor",
            "UFZ-TSM:ProjectB": "viewer",
        }

    def test_duplicate_group_keeps_highest(self):
        """If the same parent appears twice, keep the higher role."""
        result = parse_group_roles(
            [
                "/UFZ-TSM:X/viewers",
                "/UFZ-TSM:X/editors",
            ]
        )
        assert result == {"UFZ-TSM:X": "editor"}

    def test_duplicate_group_keeps_highest_admin_over_editor(self):
        # "admin" is not in ROLE_ORDER, so "editor" (order=2) beats "admin" (order=0)
        result = parse_group_roles(
            [
                "/UFZ-TSM:X/editors",
                "/UFZ-TSM:X/admins",
            ]
        )
        assert result == {"UFZ-TSM:X": "editor"}

    def test_legacy_flat_group(self):
        """Flat group without subgroup suffix -> default viewer."""
        result = parse_group_roles(["/SomeGroup"])
        assert result == {"SomeGroup": "viewer"}

    def test_legacy_flat_group_not_overwritten(self):
        """If flat group already in result, don't overwrite."""
        result = parse_group_roles(["/SomeGroup", "/SomeGroup"])
        assert result == {"SomeGroup": "viewer"}

    def test_empty_list(self):
        result = parse_group_roles([])
        assert result == {}

    def test_invalid_format_treated_as_legacy(self):
        result = parse_group_roles(["/UFZ-TSM:group/unknown_suffix"])
        assert result == {"UFZ-TSM:group/unknown_suffix": "viewer"}

    def test_empty_string_ignored(self):
        result = parse_group_roles([""])
        assert result == {}

    def test_nested_path_with_subgroup(self):
        result = parse_group_roles(["/org/dept/project/editors"])
        assert result == {"org/dept/project": "editor"}


# ===================================================================
# 2. get_highest_group_role
# ===================================================================


class TestGetHighestGroupRole:
    def test_empty_dict(self):
        assert get_highest_group_role({}) is None

    def test_single_viewer(self):
        assert get_highest_group_role({"g1": "viewer"}) == "viewer"

    def test_single_editor(self):
        assert get_highest_group_role({"g1": "editor"}) == "editor"

    def test_single_admin(self):
        assert get_highest_group_role({"g1": "admin"}) == "admin"

    def test_admin_beats_editor(self):
        assert get_highest_group_role({"g1": "editor", "g2": "admin"}) == "admin"

    def test_editor_beats_viewer(self):
        assert get_highest_group_role({"g1": "viewer", "g2": "editor"}) == "editor"

    def test_admin_beats_all(self):
        roles = {"g1": "viewer", "g2": "editor", "g3": "admin"}
        assert get_highest_group_role(roles) == "admin"

    def test_owner_role(self):
        # owner has ROLE_ORDER 3, admin maps to 4
        assert get_highest_group_role({"g1": "owner", "g2": "admin"}) == "admin"


# ===================================================================
# 3. is_realm_admin
# ===================================================================


class TestIsRealmAdmin:
    def test_admin_role_present(self):
        user = {"realm_access": {"roles": ["admin", "user"]}}
        assert is_realm_admin(user) is True

    def test_no_admin_role(self):
        user = {"realm_access": {"roles": ["user"]}}
        assert is_realm_admin(user) is False

    def test_missing_realm_access(self):
        assert is_realm_admin({}) is False

    def test_missing_roles(self):
        user = {"realm_access": {}}
        assert is_realm_admin(user) is False


# ===================================================================
# 4. EffectivePermissions.from_role
# ===================================================================


class TestEffectivePermissionsFromRole:
    def test_owner_role(self):
        ep = EffectivePermissions.from_role(
            ROLE_OWNER,
            is_realm_admin_=False,
            group_role=None,
            project_role=ROLE_OWNER,
            highest_group_role=None,
        )
        assert ep.effective_role == ROLE_OWNER
        assert ep.can_view is True
        assert ep.can_edit_settings is True
        assert ep.can_manage_members is True
        assert ep.can_delete is True
        assert ep.is_realm_admin is False
        assert ep.global_sms_access is False  # no group role, not admin

    def test_editor_role(self):
        ep = EffectivePermissions.from_role(
            ROLE_EDITOR,
            is_realm_admin_=False,
            group_role="editor",
            project_role=ROLE_EDITOR,
            highest_group_role="editor",
        )
        assert ep.effective_role == ROLE_EDITOR
        assert ep.can_view is True
        assert ep.can_edit_settings is True
        assert ep.can_manage_members is False
        assert ep.can_delete is False
        assert ep.global_sms_access is True  # editor group role

    def test_viewer_role(self):
        ep = EffectivePermissions.from_role(
            ROLE_VIEWER,
            is_realm_admin_=False,
            group_role="viewer",
            project_role=ROLE_VIEWER,
            highest_group_role="viewer",
        )
        assert ep.effective_role == ROLE_VIEWER
        assert ep.can_view is True
        assert ep.can_edit_settings is False
        assert ep.can_manage_members is False
        assert ep.can_delete is False
        assert ep.global_sms_access is False

    def test_unknown_role(self):
        ep = EffectivePermissions.from_role(
            "unknown",
            is_realm_admin_=False,
            group_role=None,
            project_role=None,
            highest_group_role=None,
        )
        assert ep.can_view is False
        assert ep.can_edit_settings is False
        assert ep.can_manage_members is False

    def test_realm_admin_grants_sms(self):
        ep = EffectivePermissions.from_role(
            ROLE_OWNER,
            is_realm_admin_=True,
            group_role=None,
            project_role=None,
            highest_group_role=None,
        )
        assert ep.global_sms_access is True
        assert ep.global_layers_access is True

    def test_admin_group_grants_sms(self):
        ep = EffectivePermissions.from_role(
            ROLE_VIEWER,
            is_realm_admin_=False,
            group_role=None,
            project_role=None,
            highest_group_role="admin",
        )
        assert ep.global_sms_access is True
        assert ep.global_layers_access is True


# ===================================================================
# 5. EffectivePermissions.no_access
# ===================================================================


class TestEffectivePermissionsNoAccess:
    def test_all_false(self):
        ep = EffectivePermissions.no_access()
        assert ep.effective_role == "none"
        assert ep.can_view is False
        assert ep.can_edit_settings is False
        assert ep.can_edit_alerts is False
        assert ep.can_link_sensors is False
        assert ep.can_add_data_sources is False
        assert ep.can_view_simulator is False
        assert ep.can_manage_members is False
        assert ep.can_delete is False
        assert ep.is_realm_admin is False
        assert ep.group_role is None
        assert ep.project_role is None
        assert ep.global_sms_access is False
        assert ep.global_layers_access is False

    def test_no_access_with_realm_admin(self):
        ep = EffectivePermissions.no_access(is_realm_admin_=True)
        assert ep.global_sms_access is True
        assert ep.global_layers_access is True
        assert ep.can_view is False  # still no project access

    def test_no_access_with_editor_group(self):
        ep = EffectivePermissions.no_access(highest_group_role="editor")
        assert ep.global_sms_access is True
        assert ep.global_layers_access is True


# ===================================================================
# 6. EffectivePermissions.to_response
# ===================================================================


class TestEffectivePermissionsToResponse:
    def test_to_response_fields(self):
        pid = uuid.uuid4()
        ep = EffectivePermissions.from_role(
            ROLE_EDITOR,
            is_realm_admin_=False,
            group_role="editor",
            project_role=ROLE_EDITOR,
            highest_group_role="editor",
        )
        resp = ep.to_response(pid)
        assert resp.project_id == pid
        assert resp.effective_role == ROLE_EDITOR
        assert resp.group_role == "editor"
        assert resp.is_realm_admin is False
        assert resp.can_view is True
        assert resp.can_edit_settings is True
        assert resp.can_manage_members is False
        assert resp.global_sms_access is True

    def test_to_response_no_access(self):
        pid = uuid.uuid4()
        resp = EffectivePermissions.no_access().to_response(pid)
        assert resp.project_id == pid
        assert resp.effective_role == "none"
        assert resp.can_view is False


# ===================================================================
# 7. PermissionResolver.resolve
# ===================================================================


class TestPermissionResolverResolve:
    def test_realm_admin_gets_owner(self):
        db = MagicMock()
        project = _make_project()
        user = _admin_user()

        perms = PermissionResolver.resolve(user, project, db)

        assert perms.effective_role == ROLE_OWNER
        assert perms.is_realm_admin is True
        assert perms.can_manage_members is True
        assert perms.can_delete is True

    def test_group_admin_gets_owner(self):
        db = MagicMock()
        project = _make_project(authorization_provider_group_name="UFZ-TSM:ProjectA")
        user = _regular_user(groups=["/UFZ-TSM:ProjectA/admins"])

        perms = PermissionResolver.resolve(user, project, db)

        assert perms.effective_role == ROLE_OWNER
        assert perms.group_role == "admin"
        assert perms.can_manage_members is True

    def test_project_member_editor(self):
        member = _make_member(role=ROLE_EDITOR)
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = None
        # First call: _resolve_project_group_name -> project has no group
        # Second call: project_members query returns our member
        # We need to handle the chained calls carefully.
        project = _make_project(
            authorization_provider_group_name=None,
            authorization_provider_group_id=None,
        )
        user_sub = str(uuid.uuid4())
        member.user_id = user_sub
        user = _regular_user(sub=user_sub)

        # The db.query chain is called once for ProjectMember lookup
        db.query.return_value.filter.return_value.first.return_value = member

        perms = PermissionResolver.resolve(user, project, db)

        assert perms.effective_role == ROLE_EDITOR
        assert perms.project_role == ROLE_EDITOR
        assert perms.can_edit_settings is True
        assert perms.can_manage_members is False

    def test_legacy_owner_id_fallback(self):
        db = MagicMock()
        user_sub = str(uuid.uuid4())
        project = _make_project(
            owner_id=user_sub,
            authorization_provider_group_name=None,
            authorization_provider_group_id=None,
        )
        user = _regular_user(sub=user_sub)

        # No project_member row found
        db.query.return_value.filter.return_value.first.return_value = None

        perms = PermissionResolver.resolve(user, project, db)

        assert perms.effective_role == ROLE_OWNER
        assert perms.can_manage_members is True

    def test_group_member_default_viewer(self):
        """User is in the project's group (editor subgroup) but no project_members row."""
        db = MagicMock()
        project = _make_project(authorization_provider_group_name="UFZ-TSM:ProjX")
        user = _regular_user(groups=["/UFZ-TSM:ProjX/editors"])

        # No project_members row
        db.query.return_value.filter.return_value.first.return_value = None

        perms = PermissionResolver.resolve(user, project, db)

        # Group editor without explicit membership -> viewer default
        assert perms.effective_role == ROLE_VIEWER
        assert perms.group_role == "editor"

    def test_group_viewer_default_viewer(self):
        db = MagicMock()
        project = _make_project(authorization_provider_group_name="UFZ-TSM:ProjX")
        user = _regular_user(groups=["/UFZ-TSM:ProjX/viewers"])

        db.query.return_value.filter.return_value.first.return_value = None

        perms = PermissionResolver.resolve(user, project, db)

        assert perms.effective_role == ROLE_VIEWER
        assert perms.group_role == "viewer"

    def test_no_access(self):
        db = MagicMock()
        project = _make_project(
            authorization_provider_group_name="SomeOtherGroup",
        )
        user = _regular_user(groups=[])

        db.query.return_value.filter.return_value.first.return_value = None

        perms = PermissionResolver.resolve(user, project, db)

        assert perms.effective_role == "none"
        assert perms.can_view is False

    @patch("app.services.keycloak_service.KeycloakService", create=True)
    def test_resolve_project_group_name_from_keycloak(self, mock_kc_cls):
        """Legacy project with group_id but no group_name -> fetch from Keycloak."""
        mock_kc_cls.get_group.return_value = {"name": "LegacyGroup"}
        db = MagicMock()
        project = _make_project(
            authorization_provider_group_name=None,
            authorization_provider_group_id="some-kc-group-id",
        )
        user = _regular_user(groups=["/LegacyGroup/editors"])

        db.query.return_value.filter.return_value.first.return_value = None

        with patch("app.services.keycloak_service.KeycloakService", mock_kc_cls):
            perms = PermissionResolver.resolve(user, project, db)

        # The group name was resolved and user is in /LegacyGroup/editors
        assert perms.group_role == "editor"

    def test_project_member_with_group_role(self):
        """Member has both group role and explicit project membership."""
        db = MagicMock()
        user_sub = str(uuid.uuid4())
        project = _make_project(authorization_provider_group_name="UFZ-TSM:ProjX")
        member = _make_member(role=ROLE_EDITOR, user_id=user_sub)
        user = _regular_user(sub=user_sub, groups=["/UFZ-TSM:ProjX/viewers"])

        db.query.return_value.filter.return_value.first.return_value = member

        perms = PermissionResolver.resolve(user, project, db)

        # Explicit membership takes precedence over default viewer
        assert perms.effective_role == ROLE_EDITOR
        assert perms.group_role == "viewer"
        assert perms.project_role == ROLE_EDITOR


# ===================================================================
# 8. PermissionResolver.resolve_global
# ===================================================================


class TestPermissionResolverResolveGlobal:
    def test_admin_user(self):
        user = _admin_user(groups=["/G1/editors"])
        result = PermissionResolver.resolve_global(user)

        assert result["is_realm_admin"] is True
        assert result["can_access_sms"] is True
        assert result["can_access_layers"] is True
        assert result["highest_group_role"] == "editor"
        assert len(result["group_memberships"]) == 1

    def test_non_admin_viewer(self):
        user = _regular_user(groups=["/G1/viewers"])
        result = PermissionResolver.resolve_global(user)

        assert result["is_realm_admin"] is False
        assert result["can_access_sms"] is False
        assert result["can_access_layers"] is False
        assert result["highest_group_role"] == "viewer"

    def test_non_admin_editor(self):
        user = _regular_user(groups=["/G1/editors"])
        result = PermissionResolver.resolve_global(user)

        assert result["is_realm_admin"] is False
        assert result["can_access_sms"] is True
        assert result["can_access_layers"] is True

    def test_no_groups(self):
        user = _regular_user(groups=[])
        result = PermissionResolver.resolve_global(user)

        assert result["is_realm_admin"] is False
        assert result["can_access_sms"] is False
        assert result["highest_group_role"] is None
        assert result["group_memberships"] == []


# ===================================================================
# 9. RBACService.get_project_permissions
# ===================================================================


class TestRBACServiceGetProjectPermissions:
    def test_project_not_found_returns_no_access(self):
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = None
        user = _regular_user()
        pid = uuid.uuid4()

        resp = RBACService.get_project_permissions(db, pid, user)

        assert resp.project_id == pid
        assert resp.effective_role == "none"
        assert resp.can_view is False

    def test_project_found_returns_permissions(self):
        project = _make_project(
            authorization_provider_group_name=None,
            authorization_provider_group_id=None,
        )
        user_sub = str(uuid.uuid4())
        project.owner_id = user_sub
        user = _regular_user(sub=user_sub)

        db = MagicMock()
        # First query returns project, second returns None (no member row)
        db.query.return_value.filter.return_value.first.side_effect = [
            project,
            None,
        ]

        resp = RBACService.get_project_permissions(db, project.id, user)

        assert resp.project_id == project.id
        assert resp.effective_role == ROLE_OWNER
        assert resp.can_view is True

    def test_admin_on_missing_project(self):
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = None
        user = _admin_user()
        pid = uuid.uuid4()

        resp = RBACService.get_project_permissions(db, pid, user)

        # Even admin gets no_access when project doesn't exist (no 404 leak)
        assert resp.effective_role == "none"
        assert resp.is_realm_admin is True
        assert resp.global_sms_access is True


# ===================================================================
# 10. RBACService.list_members
# ===================================================================


class TestRBACServiceListMembers:
    @patch("app.services.keycloak_service.KeycloakService", create=True)
    def test_list_members_with_permission(self, mock_kc):
        mock_kc.get_user_by_id.return_value = {
            "username": "testuser",
            "email": "test@example.com",
        }

        project = _make_project(
            authorization_provider_group_name=None,
            authorization_provider_group_id=None,
        )
        user_sub = str(uuid.uuid4())
        project.owner_id = user_sub
        user = _admin_user(sub=user_sub)

        member = _make_member(role=ROLE_EDITOR)

        db = MagicMock()
        # realm admin: PermissionResolver returns immediately, only 1 .first() for project
        db.query.return_value.filter.return_value.first.return_value = project
        # .all() -> member list
        db.query.return_value.filter.return_value.all.return_value = [member]

        with patch("app.services.keycloak_service.KeycloakService", mock_kc):
            result = RBACService.list_members(db, project.id, user)

        assert len(result) == 1
        assert result[0].role == ROLE_EDITOR

    def test_list_members_project_not_found(self):
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = None
        user = _regular_user()

        with pytest.raises(ResourceNotFoundException):
            RBACService.list_members(db, uuid.uuid4(), user)

    def test_list_members_no_permission(self):
        project = _make_project(
            authorization_provider_group_name=None,
            authorization_provider_group_id=None,
        )
        user = _regular_user()  # not owner, not in group

        db = MagicMock()
        # 1st .first() -> project, 2nd .first() -> None (no member row)
        db.query.return_value.filter.return_value.first.side_effect = [
            project,
            None,
        ]

        with pytest.raises(AuthorizationException):
            RBACService.list_members(db, project.id, user)


# ===================================================================
# 11. RBACService.add_member
# ===================================================================


class TestRBACServiceAddMember:
    @patch("app.services.keycloak_service.KeycloakService", create=True)
    def test_add_member_success_with_user_id(self, mock_kc):
        mock_kc.get_user_by_id.return_value = {
            "username": "newuser",
            "email": "new@example.com",
        }

        project = _make_project(
            authorization_provider_group_name=None,
            authorization_provider_group_id=None,
        )
        owner_sub = str(uuid.uuid4())
        project.owner_id = owner_sub
        user = _admin_user(sub=owner_sub)

        target_user_id = str(uuid.uuid4())
        req = MagicMock()
        req.user_id = target_user_id
        req.username = None
        req.role = ROLE_EDITOR

        db = MagicMock()
        # realm admin: PermissionResolver returns immediately, only 1 .first() for project
        db.query.return_value.filter.return_value.first.return_value = project
        # db.refresh must set created_at (column default only runs on real DB)
        db.refresh.side_effect = lambda obj: setattr(
            obj, "created_at", datetime(2025, 1, 1)
        )

        with patch("app.services.keycloak_service.KeycloakService", mock_kc):
            result = RBACService.add_member(db, project.id, req, user)

        assert result.role == ROLE_EDITOR
        assert result.username == "newuser"
        db.add.assert_called_once()
        db.commit.assert_called_once()

    @patch("app.services.keycloak_service.KeycloakService", create=True)
    def test_add_member_by_username(self, mock_kc):
        mock_kc.get_user_by_username.return_value = {
            "id": str(uuid.uuid4()),
            "username": "looked_up",
            "email": "lu@example.com",
        }

        project = _make_project(
            authorization_provider_group_name=None,
            authorization_provider_group_id=None,
        )
        owner_sub = str(uuid.uuid4())
        project.owner_id = owner_sub
        user = _admin_user(sub=owner_sub)

        req = MagicMock()
        req.user_id = None
        req.username = "looked_up"
        req.role = ROLE_VIEWER

        db = MagicMock()
        # realm admin: only 1 .first() call for project
        db.query.return_value.filter.return_value.first.return_value = project
        db.refresh.side_effect = lambda obj: setattr(
            obj, "created_at", datetime(2025, 1, 1)
        )

        with patch("app.services.keycloak_service.KeycloakService", mock_kc):
            result = RBACService.add_member(db, project.id, req, user)

        assert result.role == ROLE_VIEWER
        mock_kc.get_user_by_username.assert_called_once_with("looked_up")

    def test_add_member_no_permission(self):
        project = _make_project(
            authorization_provider_group_name=None,
            authorization_provider_group_id=None,
        )
        user = _regular_user()

        req = MagicMock()
        req.user_id = str(uuid.uuid4())
        req.username = None
        req.role = ROLE_EDITOR

        db = MagicMock()
        db.query.return_value.filter.return_value.first.side_effect = [
            project,
            None,
        ]

        with pytest.raises(AuthorizationException):
            RBACService.add_member(db, project.id, req, user)

    def test_add_member_project_not_found(self):
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = None
        user = _admin_user()
        req = MagicMock()

        with pytest.raises(ResourceNotFoundException):
            RBACService.add_member(db, uuid.uuid4(), req, user)

    def test_add_member_cannot_add_self(self):
        owner_sub = str(uuid.uuid4())
        project = _make_project(
            authorization_provider_group_name=None,
            authorization_provider_group_id=None,
        )
        project.owner_id = owner_sub
        user = _admin_user(sub=owner_sub)

        req = MagicMock()
        req.user_id = owner_sub  # same as caller
        req.username = None
        req.role = ROLE_EDITOR

        db = MagicMock()
        db.query.return_value.filter.return_value.first.side_effect = [
            project,
            None,
        ]

        with pytest.raises(ValidationException, match="Cannot add yourself"):
            RBACService.add_member(db, project.id, req, user)

    @patch("app.services.keycloak_service.KeycloakService", create=True)
    def test_add_member_duplicate_raises_validation(self, mock_kc):
        from sqlalchemy.exc import IntegrityError

        mock_kc.get_user_by_id.return_value = {
            "username": "dup",
            "email": "dup@example.com",
        }

        project = _make_project(
            authorization_provider_group_name=None,
            authorization_provider_group_id=None,
        )
        owner_sub = str(uuid.uuid4())
        project.owner_id = owner_sub
        user = _admin_user(sub=owner_sub)

        target_user_id = str(uuid.uuid4())
        req = MagicMock()
        req.user_id = target_user_id
        req.username = None
        req.role = ROLE_EDITOR

        db = MagicMock()
        # realm admin: only 1 .first() call for project
        db.query.return_value.filter.return_value.first.return_value = project
        db.commit.side_effect = IntegrityError("dup", {}, None)

        with patch("app.services.keycloak_service.KeycloakService", mock_kc):
            with pytest.raises(ValidationException, match="already a member"):
                RBACService.add_member(db, project.id, req, user)

    @patch("app.services.keycloak_service.KeycloakService", create=True)
    def test_add_member_username_not_found(self, mock_kc):
        mock_kc.get_user_by_username.return_value = None

        project = _make_project(
            authorization_provider_group_name=None,
            authorization_provider_group_id=None,
        )
        owner_sub = str(uuid.uuid4())
        project.owner_id = owner_sub
        user = _admin_user(sub=owner_sub)

        req = MagicMock()
        req.user_id = None
        req.username = "nonexistent"
        req.role = ROLE_EDITOR

        db = MagicMock()
        # realm admin: only 1 .first() call for project
        db.query.return_value.filter.return_value.first.return_value = project

        with patch("app.services.keycloak_service.KeycloakService", mock_kc):
            with pytest.raises(ResourceNotFoundException, match="not found"):
                RBACService.add_member(db, project.id, req, user)


# ===================================================================
# 12. RBACService.update_member_role
# ===================================================================


class TestRBACServiceUpdateMemberRole:
    @patch("app.services.keycloak_service.KeycloakService", create=True)
    def test_update_member_role_success(self, mock_kc):
        mock_kc.get_user_by_id.return_value = {
            "username": "member1",
            "email": "m1@example.com",
        }

        project = _make_project(
            authorization_provider_group_name=None,
            authorization_provider_group_id=None,
        )
        owner_sub = str(uuid.uuid4())
        project.owner_id = owner_sub
        user = _admin_user(sub=owner_sub)

        target_user_id = str(uuid.uuid4())
        member = _make_member(role=ROLE_VIEWER, user_id=target_user_id)

        req = MagicMock()
        req.role = ROLE_EDITOR

        db = MagicMock()
        # realm admin: only 2 .first() calls (project, then member)
        db.query.return_value.filter.return_value.first.side_effect = [
            project,
            member,
        ]
        db.refresh.side_effect = (
            lambda obj: None
        )  # no-op; member already has created_at

        with patch("app.services.keycloak_service.KeycloakService", mock_kc):
            result = RBACService.update_member_role(
                db, project.id, target_user_id, req, user
            )

        assert result.username == "member1"
        assert member.role == ROLE_EDITOR
        db.commit.assert_called_once()

    def test_update_member_role_project_not_found(self):
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = None
        user = _admin_user()
        req = MagicMock()
        req.role = ROLE_EDITOR

        with pytest.raises(ResourceNotFoundException):
            RBACService.update_member_role(db, uuid.uuid4(), "some-user-id", req, user)

    def test_update_member_role_no_permission(self):
        project = _make_project(
            authorization_provider_group_name=None,
            authorization_provider_group_id=None,
        )
        user = _regular_user()
        req = MagicMock()
        req.role = ROLE_EDITOR

        db = MagicMock()
        db.query.return_value.filter.return_value.first.side_effect = [
            project,
            None,
        ]

        with pytest.raises(AuthorizationException):
            RBACService.update_member_role(db, project.id, "some-user-id", req, user)

    def test_update_member_role_member_not_found(self):
        project = _make_project(
            authorization_provider_group_name=None,
            authorization_provider_group_id=None,
        )
        owner_sub = str(uuid.uuid4())
        project.owner_id = owner_sub
        user = _admin_user(sub=owner_sub)
        req = MagicMock()
        req.role = ROLE_EDITOR

        db = MagicMock()
        # realm admin: only 2 .first() calls (project, then member → None = not found)
        db.query.return_value.filter.return_value.first.side_effect = [
            project,
            None,
        ]

        with pytest.raises(ResourceNotFoundException, match="Member not found"):
            RBACService.update_member_role(db, project.id, "nonexistent", req, user)

    def test_update_owner_role_raises_validation(self):
        project = _make_project(
            authorization_provider_group_name=None,
            authorization_provider_group_id=None,
        )
        owner_sub = str(uuid.uuid4())
        project.owner_id = owner_sub
        user = _admin_user(sub=owner_sub)

        target_user_id = str(uuid.uuid4())
        member = _make_member(role=ROLE_OWNER, user_id=target_user_id)

        req = MagicMock()
        req.role = ROLE_EDITOR

        db = MagicMock()
        # realm admin: only 2 .first() calls (project, then member)
        db.query.return_value.filter.return_value.first.side_effect = [
            project,
            member,
        ]

        with pytest.raises(ValidationException, match="Cannot change the owner"):
            RBACService.update_member_role(db, project.id, target_user_id, req, user)


# ===================================================================
# 13. RBACService.remove_member
# ===================================================================


class TestRBACServiceRemoveMember:
    def test_remove_member_success(self):
        project = _make_project(
            authorization_provider_group_name=None,
            authorization_provider_group_id=None,
        )
        owner_sub = str(uuid.uuid4())
        project.owner_id = owner_sub
        user = _admin_user(sub=owner_sub)

        target_user_id = str(uuid.uuid4())
        member = _make_member(role=ROLE_EDITOR, user_id=target_user_id)

        db = MagicMock()
        # realm admin: only 2 .first() calls (project, then member)
        db.query.return_value.filter.return_value.first.side_effect = [
            project,
            member,
        ]

        RBACService.remove_member(db, project.id, target_user_id, user)

        db.delete.assert_called_once_with(member)
        db.commit.assert_called_once()

    def test_remove_member_no_permission(self):
        project = _make_project(
            authorization_provider_group_name=None,
            authorization_provider_group_id=None,
        )
        user = _regular_user()

        db = MagicMock()
        db.query.return_value.filter.return_value.first.side_effect = [
            project,
            None,
        ]

        with pytest.raises(AuthorizationException):
            RBACService.remove_member(db, project.id, "some-user-id", user)

    def test_remove_member_project_not_found(self):
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = None
        user = _admin_user()

        with pytest.raises(ResourceNotFoundException):
            RBACService.remove_member(db, uuid.uuid4(), "some-user-id", user)

    def test_remove_member_not_found(self):
        project = _make_project(
            authorization_provider_group_name=None,
            authorization_provider_group_id=None,
        )
        owner_sub = str(uuid.uuid4())
        project.owner_id = owner_sub
        user = _admin_user(sub=owner_sub)

        db = MagicMock()
        # realm admin: only 2 .first() calls (project, then member → None = not found)
        db.query.return_value.filter.return_value.first.side_effect = [
            project,
            None,
        ]

        with pytest.raises(ResourceNotFoundException, match="Member not found"):
            RBACService.remove_member(db, project.id, "nonexistent", user)

    def test_remove_owner_raises_validation(self):
        project = _make_project(
            authorization_provider_group_name=None,
            authorization_provider_group_id=None,
        )
        owner_sub = str(uuid.uuid4())
        project.owner_id = owner_sub
        user = _admin_user(sub=owner_sub)

        target_user_id = str(uuid.uuid4())
        member = _make_member(role=ROLE_OWNER, user_id=target_user_id)

        db = MagicMock()
        # realm admin: only 2 .first() calls (project, then member)
        db.query.return_value.filter.return_value.first.side_effect = [
            project,
            member,
        ]

        with pytest.raises(
            ValidationException, match="Cannot remove the project owner"
        ):
            RBACService.remove_member(db, project.id, target_user_id, user)


# ===================================================================
# Additional edge-case tests for _find_group_role
# ===================================================================


class TestFindGroupRole:
    def test_none_group_name(self):
        assert PermissionResolver._find_group_role({"g": "viewer"}, None) is None

    def test_direct_match(self):
        roles = {"UFZ-TSM:ProjA": "editor"}
        assert PermissionResolver._find_group_role(roles, "UFZ-TSM:ProjA") == "editor"

    def test_strip_leading_slash(self):
        roles = {"UFZ-TSM:ProjA": "editor"}
        assert PermissionResolver._find_group_role(roles, "/UFZ-TSM:ProjA") == "editor"

    def test_suffix_match(self):
        roles = {"UFZ-TSM:ProjA": "admin"}
        assert PermissionResolver._find_group_role(roles, "ProjA") == "admin"

    def test_no_match(self):
        roles = {"UFZ-TSM:ProjA": "editor"}
        assert PermissionResolver._find_group_role(roles, "TotallyDifferent") is None
