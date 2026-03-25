"""
RBAC schemas for two-tier permission system.

Tier 1: Keycloak group-level roles (viewer / editor / admin)
Tier 2: Project-level roles (owner / editor / viewer)
"""

from datetime import datetime
from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, model_validator

# ---------------------------------------------------------------------------
# Project member schemas
# ---------------------------------------------------------------------------


class ProjectMemberCreate(BaseModel):
    """Add a user to a project with an explicit role."""

    user_id: Optional[str] = None      # Keycloak sub (UUID string)
    username: Optional[str] = None     # Resolved server-side if user_id not given
    role: Literal["editor", "viewer"]  # Cannot assign 'owner' via API

    @model_validator(mode="after")
    def require_user_id_or_username(self) -> "ProjectMemberCreate":
        if not self.user_id and not self.username:
            raise ValueError("Either user_id or username must be provided")
        return self


class ProjectMemberUpdate(BaseModel):
    """Change the role of an existing project member."""

    role: Literal["editor", "viewer"]  # Cannot change to 'owner' via API


class ProjectMemberResponse(BaseModel):
    """Project member with resolved display info."""

    user_id: str
    username: Optional[str] = None
    email: Optional[str] = None
    role: str
    created_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Permission response schema
# ---------------------------------------------------------------------------


class PermissionsResponse(BaseModel):
    """
    Effective permissions for the current user on a specific project.
    Used by the frontend to gate UI elements.
    """

    project_id: UUID

    # Resolved role (highest-priority match from the 6-step resolution chain)
    effective_role: str             # "owner" | "editor" | "viewer" | "none"

    # Raw tier info (for debugging / display)
    group_role: Optional[str]       # Tier 1 role for this project's Keycloak group
    is_realm_admin: bool

    # Project-level capabilities
    can_view: bool
    can_edit_settings: bool
    can_edit_alerts: bool
    can_link_sensors: bool
    can_add_data_sources: bool
    can_view_simulator: bool
    can_manage_members: bool
    can_delete: bool

    # Global capabilities (derived from Tier 1, independent of project)
    global_sms_access: bool
    global_layers_access: bool


# ---------------------------------------------------------------------------
# Global permissions schema (no project context)
# ---------------------------------------------------------------------------


class GlobalPermissionsResponse(BaseModel):
    """
    Platform-level permissions for the current user.
    Derived purely from JWT claims (no DB query needed).
    """

    is_realm_admin: bool
    highest_group_role: Optional[str]   # highest role across all Keycloak groups
    can_access_sms: bool
    can_access_layers: bool
    group_memberships: list[dict]        # [{group_path, role}]
