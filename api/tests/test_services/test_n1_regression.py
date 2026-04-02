"""
N+1 Query Regression Tests

Verifies that batch-loading patterns are used instead of per-item queries.
"""

from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest

from app.services.rbac_service import PermissionResolver, EffectivePermissions


class TestPermissionResolverBatch:
    """Tests for PermissionResolver.resolve_batch — the fix for N+1 in project listing."""

    def _make_project(self, owner_id="user-1", group_name="GroupA"):
        p = MagicMock()
        p.id = uuid4()
        p.owner_id = owner_id
        p.authorization_provider_group_name = group_name
        p.authorization_provider_group_id = str(uuid4())
        return p

    def _make_user(self, sub="user-1", groups=None, realm_admin=False):
        user = {
            "sub": sub,
            "groups": groups or [],
            "realm_access": {"roles": ["admin"] if realm_admin else []},
        }
        return user

    def test_batch_returns_all_project_ids(self):
        """resolve_batch must return a result for every project."""
        db = MagicMock()
        db.query.return_value.filter.return_value.all.return_value = []
        projects = [self._make_project() for _ in range(5)]
        user = self._make_user(groups=["/GroupA/editors"])

        result = PermissionResolver.resolve_batch(user, projects, db)

        assert set(result.keys()) == {p.id for p in projects}

    def test_batch_realm_admin_skips_db(self):
        """Realm admin should not query ProjectMember at all."""
        db = MagicMock()
        projects = [self._make_project() for _ in range(3)]
        user = self._make_user(realm_admin=True)

        result = PermissionResolver.resolve_batch(user, projects, db)

        # db.query should NOT be called at all for realm admin
        db.query.assert_not_called()
        # All should be owner
        for perms in result.values():
            assert perms.effective_role == "owner"

    def test_batch_single_query_for_members(self):
        """resolve_batch must issue exactly one ProjectMember query (not N)."""
        db = MagicMock()
        db.query.return_value.filter.return_value.all.return_value = []
        projects = [self._make_project() for _ in range(10)]
        user = self._make_user(groups=["/GroupA/editors"])

        PermissionResolver.resolve_batch(user, projects, db)

        # Should have exactly one db.query() call
        assert db.query.call_count == 1, (
            f"Expected 1 query, got {db.query.call_count}"
        )

    def test_batch_uses_prefetched_member(self):
        """Pre-fetched ProjectMember row should be used to resolve the role."""
        p = self._make_project(owner_id="other-user")
        member = MagicMock()
        member.project_id = p.id
        member.user_id = "user-1"
        member.role = "editor"

        db = MagicMock()
        db.query.return_value.filter.return_value.all.return_value = [member]

        user = self._make_user(sub="user-1", groups=[])

        result = PermissionResolver.resolve_batch(user, [p], db)

        assert result[p.id].effective_role == "editor"

    def test_batch_owner_fallback(self):
        """Legacy owner_id match should give owner role when no member row exists."""
        p = self._make_project(owner_id="user-1")
        db = MagicMock()
        db.query.return_value.filter.return_value.all.return_value = []
        user = self._make_user(sub="user-1", groups=[])

        result = PermissionResolver.resolve_batch(user, [p], db)

        assert result[p.id].effective_role == "owner"
