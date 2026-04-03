"""
RBAC Service — Two-Tier Permission System

Tier 1: Keycloak group-level roles (viewer / editor / admin)
  - Stored as Keycloak subgroup membership
  - Parsed from JWT 'groups' claim (full paths like /UFZ-TSM:X/editors)

Tier 2: Project-level roles (owner / editor / viewer)
  - Stored in project_members DB table
  - Explicit per-project role assignments

Permission resolution priority (highest wins):
  1. Realm admin (realm_access.roles = ['admin'])  → owner everywhere
  2. Group admin for project's group               → owner for all projects in group
  3. project_members row (project_id, user_sub)    → that row's role
  4. project.owner_id == user.sub                  → owner (backward compat)
  5. user in project's Keycloak group (any role)   → viewer (default)
  6. no match                                      → 403
"""

import logging
import uuid
from dataclasses import dataclass
from typing import Any, Dict, List, Optional
from uuid import UUID

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.exceptions import (
    AuthorizationException,
    ResourceNotFoundException,
    ValidationException,
)
from app.models.user_context import Project, ProjectMember
from app.schemas.rbac import (
    PermissionsResponse,
    ProjectMemberCreate,
    ProjectMemberResponse,
    ProjectMemberUpdate,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Role constants
# ---------------------------------------------------------------------------

ROLE_OWNER = "owner"
ROLE_EDITOR = "editor"
ROLE_VIEWER = "viewer"

ROLE_ORDER = {ROLE_OWNER: 3, ROLE_EDITOR: 2, ROLE_VIEWER: 1}

# Keycloak subgroup name → Tier 1 role
SUBGROUP_TO_ROLE: Dict[str, str] = {
    "viewers": ROLE_VIEWER,
    "editors": ROLE_EDITOR,
    "admins": "admin",
}


# ---------------------------------------------------------------------------
# JWT group parsing
# ---------------------------------------------------------------------------


def parse_group_roles(jwt_groups: List[str]) -> Dict[str, str]:
    """
    Parse JWT 'groups' claim into a {parent_group_path: role} mapping.

    Examples:
      ["/UFZ-TSM:ProjectA/editors", "/UFZ-TSM:ProjectB/viewers"]
      → {"UFZ-TSM:ProjectA": "editor", "UFZ-TSM:ProjectB": "viewer"}

    Legacy flat group (no subgroup suffix) → default 'viewer'.
    """
    result: Dict[str, str] = {}
    for path in jwt_groups:
        clean = path.strip("/")
        parts = clean.split("/")
        if len(parts) >= 2 and parts[-1] in SUBGROUP_TO_ROLE:
            parent = "/".join(parts[:-1])
            role = SUBGROUP_TO_ROLE[parts[-1]]
            # Keep highest role if somehow two subgroup paths exist for same parent
            existing = result.get(parent)
            if existing is None or ROLE_ORDER.get(role, 0) > ROLE_ORDER.get(
                existing, 0
            ):
                result[parent] = role
        else:
            # Legacy flat group membership → default viewer
            if clean and clean not in result:
                result[clean] = ROLE_VIEWER
    return result


def get_highest_group_role(group_roles: Dict[str, str]) -> Optional[str]:
    """Return the highest Tier 1 role across all group memberships."""
    if not group_roles:
        return None
    role_values = list(group_roles.values())
    return max(role_values, key=lambda r: ROLE_ORDER.get(r, 0) if r != "admin" else 4)


def is_realm_admin(user: Dict[str, Any]) -> bool:
    """Check if user has 'admin' realm role (god user)."""
    return "admin" in user.get("realm_access", {}).get("roles", [])


# ---------------------------------------------------------------------------
# Effective permissions dataclass
# ---------------------------------------------------------------------------


@dataclass
class EffectivePermissions:
    # Tier info
    is_realm_admin: bool
    group_role: Optional[str]  # Tier 1 role for this project's Keycloak group
    project_role: Optional[str]  # Tier 2 role from project_members table
    effective_role: str  # Resolved final role

    # Project-level capabilities
    can_view: bool
    can_edit_settings: bool
    can_edit_alerts: bool
    can_link_sensors: bool
    can_add_data_sources: bool
    can_view_simulator: bool
    can_manage_members: bool
    can_delete: bool

    # Global capabilities (Tier 1 based, project-independent)
    global_sms_access: bool
    global_layers_access: bool

    @classmethod
    def from_role(
        cls,
        effective_role: str,
        *,
        is_realm_admin_: bool,
        group_role: Optional[str],
        project_role: Optional[str],
        highest_group_role: Optional[str],
    ) -> "EffectivePermissions":
        """Build EffectivePermissions from a resolved role string."""
        is_owner = effective_role == ROLE_OWNER
        is_editor = effective_role in (ROLE_OWNER, ROLE_EDITOR)
        can_see = effective_role in (ROLE_OWNER, ROLE_EDITOR, ROLE_VIEWER)

        # SMS/Layers: editor+ in ANY group (or realm admin)
        hr = highest_group_role or ""
        sms_access = is_realm_admin_ or hr in (ROLE_EDITOR, "admin")

        return cls(
            is_realm_admin=is_realm_admin_,
            group_role=group_role,
            project_role=project_role,
            effective_role=effective_role,
            can_view=can_see,
            can_edit_settings=is_editor,
            can_edit_alerts=is_editor,
            can_link_sensors=is_editor,
            can_add_data_sources=is_editor,
            can_view_simulator=is_editor,
            can_manage_members=is_owner,
            can_delete=is_owner,
            global_sms_access=sms_access,
            global_layers_access=sms_access,
        )

    @classmethod
    def no_access(
        cls, *, is_realm_admin_: bool = False, highest_group_role: Optional[str] = None
    ) -> "EffectivePermissions":
        hr = highest_group_role or ""
        sms_access = is_realm_admin_ or hr in (ROLE_EDITOR, "admin")
        return cls(
            is_realm_admin=is_realm_admin_,
            group_role=None,
            project_role=None,
            effective_role="none",
            can_view=False,
            can_edit_settings=False,
            can_edit_alerts=False,
            can_link_sensors=False,
            can_add_data_sources=False,
            can_view_simulator=False,
            can_manage_members=False,
            can_delete=False,
            global_sms_access=sms_access,
            global_layers_access=sms_access,
        )

    def to_response(self, project_id: UUID) -> PermissionsResponse:
        return PermissionsResponse(
            project_id=project_id,
            effective_role=self.effective_role,
            group_role=self.group_role,
            is_realm_admin=self.is_realm_admin,
            can_view=self.can_view,
            can_edit_settings=self.can_edit_settings,
            can_edit_alerts=self.can_edit_alerts,
            can_link_sensors=self.can_link_sensors,
            can_add_data_sources=self.can_add_data_sources,
            can_view_simulator=self.can_view_simulator,
            can_manage_members=self.can_manage_members,
            can_delete=self.can_delete,
            global_sms_access=self.global_sms_access,
            global_layers_access=self.global_layers_access,
        )


# ---------------------------------------------------------------------------
# Permission resolver
# ---------------------------------------------------------------------------


class PermissionResolver:
    """
    Resolves effective permissions for a user on a project.
    Uses JWT claims only — NO Keycloak Admin API calls in the hot path.
    """

    @staticmethod
    def resolve(
        user: Dict[str, Any], project: Project, db: Session
    ) -> EffectivePermissions:
        user_sub = str(user.get("sub", ""))
        jwt_groups: List[str] = user.get("groups", [])

        # Parse all group roles from JWT
        group_roles = parse_group_roles(jwt_groups)
        highest_group_role = get_highest_group_role(group_roles)
        realm_admin = is_realm_admin(user)

        common_kwargs = dict(
            is_realm_admin_=realm_admin,
            highest_group_role=highest_group_role,
        )

        # 1. Realm admin — god user
        if realm_admin:
            return EffectivePermissions.from_role(
                ROLE_OWNER,
                group_role=None,
                project_role=None,
                **common_kwargs,
            )

        # Resolve the Keycloak group name/path for this project
        project_group_name = PermissionResolver._resolve_project_group_name(project, db)

        # Find user's Tier 1 role for this project's group
        group_role_for_project = PermissionResolver._find_group_role(
            group_roles, project_group_name
        )

        # 2. Group admin → owner-equivalent for all projects in their group
        if group_role_for_project == "admin":
            return EffectivePermissions.from_role(
                ROLE_OWNER,
                group_role="admin",
                project_role=None,
                **common_kwargs,
            )

        # 3. Explicit project_members row
        member = (
            db.query(ProjectMember)
            .filter(
                ProjectMember.project_id == project.id,
                ProjectMember.user_id == user_sub,
            )
            .first()
        )
        if member:
            return EffectivePermissions.from_role(
                member.role,
                group_role=group_role_for_project,
                project_role=member.role,
                **common_kwargs,
            )

        # 4. Legacy owner_id fallback
        if str(project.owner_id) == user_sub:
            return EffectivePermissions.from_role(
                ROLE_OWNER,
                group_role=group_role_for_project,
                project_role=ROLE_OWNER,
                **common_kwargs,
            )

        # 5. Group membership without explicit project row → default viewer
        if group_role_for_project is not None:
            return EffectivePermissions.from_role(
                ROLE_VIEWER,
                group_role=group_role_for_project,
                project_role=None,
                **common_kwargs,
            )

        # 6. No access
        return EffectivePermissions.no_access(**common_kwargs)

    @staticmethod
    def _resolve_project_group_name(project: Project, db: Session) -> Optional[str]:
        """
        Return the human-readable group name/path for a project.
        Uses stored authorization_provider_group_name if available.
        Falls back to Keycloak Admin API for legacy projects (one-time, then stores result).
        """
        if project.authorization_provider_group_name:
            return project.authorization_provider_group_name

        if not project.authorization_provider_group_id:
            return None

        # Legacy: try to fetch from Keycloak and cache in the column
        try:
            from app.services.keycloak_service import KeycloakService

            group = KeycloakService.get_group(project.authorization_provider_group_id)
            if group and group.get("name"):
                name = group["name"]
                project.authorization_provider_group_name = name
                try:
                    db.commit()
                except Exception:
                    db.rollback()
                return name
        except Exception as e:
            logger.warning(
                f"Could not resolve group name for project {project.id}: {e}"
            )
        return None

    @staticmethod
    def _find_group_role(
        group_roles: Dict[str, str], project_group_name: Optional[str]
    ) -> Optional[str]:
        """
        Find the user's role for the project's group.
        Tries exact match and common variants (with/without UFZ-TSM: prefix).
        """
        if not project_group_name:
            return None

        # Direct match
        if project_group_name in group_roles:
            return group_roles[project_group_name]

        # Try stripping leading slash
        clean = project_group_name.lstrip("/")
        if clean in group_roles:
            return group_roles[clean]

        # Try matching just the last path segment (group name without prefix hierarchy)
        for path, role in group_roles.items():
            if path.endswith(project_group_name) or project_group_name.endswith(path):
                return role

        return None

    @staticmethod
    def resolve_batch(
        user: Dict[str, Any], projects: List[Project], db: Session
    ) -> Dict[UUID, EffectivePermissions]:
        """
        Resolve permissions for multiple projects in one pass.

        Pre-fetches all ProjectMember rows for the user to avoid N+1 queries.
        Returns a mapping of project_id → EffectivePermissions.
        """
        user_sub = str(user.get("sub", ""))
        jwt_groups: List[str] = user.get("groups", [])
        group_roles = parse_group_roles(jwt_groups)
        highest_group_role = get_highest_group_role(group_roles)
        realm_admin = is_realm_admin(user)

        common_kwargs = dict(
            is_realm_admin_=realm_admin,
            highest_group_role=highest_group_role,
        )

        # Realm admin → owner on everything, skip DB lookup entirely
        if realm_admin:
            owner_perms = EffectivePermissions.from_role(
                ROLE_OWNER, group_role=None, project_role=None, **common_kwargs
            )
            return {p.id: owner_perms for p in projects}

        # Batch-load all ProjectMember rows for this user across the given projects
        project_ids = [p.id for p in projects]
        members = (
            db.query(ProjectMember)
            .filter(
                ProjectMember.user_id == user_sub,
                ProjectMember.project_id.in_(project_ids),
            )
            .all()
        )
        member_by_project: Dict[UUID, ProjectMember] = {
            m.project_id: m for m in members
        }

        result: Dict[UUID, EffectivePermissions] = {}
        for project in projects:
            project_group_name = PermissionResolver._resolve_project_group_name(
                project, db
            )
            group_role_for_project = PermissionResolver._find_group_role(
                group_roles, project_group_name
            )

            # Group admin → owner
            if group_role_for_project == "admin":
                result[project.id] = EffectivePermissions.from_role(
                    ROLE_OWNER, group_role="admin", project_role=None, **common_kwargs
                )
                continue

            # Explicit project_members row (already fetched in batch)
            member = member_by_project.get(project.id)
            if member:
                result[project.id] = EffectivePermissions.from_role(
                    member.role,
                    group_role=group_role_for_project,
                    project_role=member.role,
                    **common_kwargs,
                )
                continue

            # Legacy owner_id fallback
            if str(project.owner_id) == user_sub:
                result[project.id] = EffectivePermissions.from_role(
                    ROLE_OWNER,
                    group_role=group_role_for_project,
                    project_role=ROLE_OWNER,
                    **common_kwargs,
                )
                continue

            # Group membership without explicit row → viewer
            if group_role_for_project is not None:
                result[project.id] = EffectivePermissions.from_role(
                    ROLE_VIEWER,
                    group_role=group_role_for_project,
                    project_role=None,
                    **common_kwargs,
                )
                continue

            # No access
            result[project.id] = EffectivePermissions.no_access(**common_kwargs)

        return result

    @staticmethod
    def resolve_global(user: Dict[str, Any]) -> Dict[str, Any]:
        """
        Resolve global (platform-level) permissions from JWT only.
        No DB query needed.
        """
        jwt_groups: List[str] = user.get("groups", [])
        group_roles = parse_group_roles(jwt_groups)
        highest = get_highest_group_role(group_roles)
        realm_admin = is_realm_admin(user)

        sms_access = realm_admin or (highest in (ROLE_EDITOR, "admin"))

        return {
            "is_realm_admin": realm_admin,
            "highest_group_role": highest,
            "can_access_sms": sms_access,
            "can_access_layers": sms_access,
            "group_memberships": [
                {"group_path": k, "role": v} for k, v in group_roles.items()
            ],
        }


# ---------------------------------------------------------------------------
# RBAC service — project member CRUD
# ---------------------------------------------------------------------------


class RBACService:
    """
    Manages project-level role assignments (Tier 2).
    """

    @staticmethod
    def get_project_permissions(
        db: Session, project_id: UUID, user: Dict[str, Any]
    ) -> PermissionsResponse:
        """
        Returns effective permissions for the user on this project.
        Returns can_view=False instead of raising 403 (allows silent frontend redirects).
        """
        project = db.query(Project).filter(Project.id == project_id).first()
        if not project:
            # Return no-access response instead of 404 to avoid leaking existence
            return EffectivePermissions.no_access(
                is_realm_admin_=is_realm_admin(user),
                highest_group_role=get_highest_group_role(
                    parse_group_roles(user.get("groups", []))
                ),
            ).to_response(project_id)

        perms = PermissionResolver.resolve(user, project, db)
        return perms.to_response(project_id)

    @staticmethod
    def list_members(
        db: Session, project_id: UUID, user: Dict[str, Any]
    ) -> List[ProjectMemberResponse]:
        """List all explicit project members. Requires can_view."""
        project = db.query(Project).filter(Project.id == project_id).first()
        if not project:
            raise ResourceNotFoundException(message="Project not found")

        perms = PermissionResolver.resolve(user, project, db)
        if not perms.can_view:
            raise AuthorizationException(message="Not authorized to view this project")

        members = (
            db.query(ProjectMember).filter(ProjectMember.project_id == project_id).all()
        )

        result = []
        for m in members:
            # Enrich with Keycloak display info (best-effort)
            username = None
            email = None
            try:
                from app.services.keycloak_service import KeycloakService

                kc_user = KeycloakService.get_user_by_id(m.user_id)
                if kc_user:
                    username = kc_user.get("username")
                    email = kc_user.get("email")
            except Exception:
                pass
            result.append(
                ProjectMemberResponse(
                    user_id=m.user_id,
                    username=username,
                    email=email,
                    role=m.role,
                    created_at=m.created_at,
                )
            )
        return result

    @staticmethod
    def add_member(
        db: Session,
        project_id: UUID,
        req: ProjectMemberCreate,
        user: Dict[str, Any],
    ) -> ProjectMemberResponse:
        """Add a member to a project. Requires can_manage_members."""
        project = db.query(Project).filter(Project.id == project_id).first()
        if not project:
            raise ResourceNotFoundException(message="Project not found")

        perms = PermissionResolver.resolve(user, project, db)
        if not perms.can_manage_members:
            raise AuthorizationException(
                message="Only project owners can manage members"
            )

        # Resolve user_id from username if needed
        target_user_id = req.user_id
        target_username = req.username
        target_email = None

        if not target_user_id and target_username:
            from app.services.keycloak_service import KeycloakService

            kc_user = KeycloakService.get_user_by_username(target_username)
            if not kc_user:
                raise ResourceNotFoundException(
                    message=f"User '{target_username}' not found"
                )
            target_user_id = kc_user["id"]
            target_email = kc_user.get("email")
        elif target_user_id:
            try:
                from app.services.keycloak_service import KeycloakService

                kc_user = KeycloakService.get_user_by_id(target_user_id)
                if kc_user:
                    target_username = kc_user.get("username")
                    target_email = kc_user.get("email")
            except Exception:
                pass

        # Cannot add yourself as a non-owner (you're already owner)
        if str(target_user_id) == str(user.get("sub")):
            raise ValidationException(
                message="Cannot add yourself as a member (you are already the owner)"
            )

        new_member = ProjectMember(
            id=uuid.uuid4(),
            project_id=project_id,
            user_id=str(target_user_id),
            role=req.role,
        )
        try:
            db.add(new_member)
            db.commit()
            db.refresh(new_member)
        except IntegrityError:
            db.rollback()
            raise ValidationException(
                message="User is already a member of this project"
            )

        return ProjectMemberResponse(
            user_id=new_member.user_id,
            username=target_username,
            email=target_email,
            role=new_member.role,
            created_at=new_member.created_at,
        )

    @staticmethod
    def update_member_role(
        db: Session,
        project_id: UUID,
        target_user_id: str,
        req: ProjectMemberUpdate,
        user: Dict[str, Any],
    ) -> ProjectMemberResponse:
        """Change a member's role. Requires can_manage_members. Cannot change owner's role."""
        project = db.query(Project).filter(Project.id == project_id).first()
        if not project:
            raise ResourceNotFoundException(message="Project not found")

        perms = PermissionResolver.resolve(user, project, db)
        if not perms.can_manage_members:
            raise AuthorizationException(
                message="Only project owners can manage members"
            )

        member = (
            db.query(ProjectMember)
            .filter(
                ProjectMember.project_id == project_id,
                ProjectMember.user_id == target_user_id,
            )
            .first()
        )
        if not member:
            raise ResourceNotFoundException(message="Member not found in this project")

        if member.role == ROLE_OWNER:
            raise ValidationException(message="Cannot change the owner's role")

        member.role = req.role
        db.commit()
        db.refresh(member)

        username = None
        email = None
        try:
            from app.services.keycloak_service import KeycloakService

            kc_user = KeycloakService.get_user_by_id(target_user_id)
            if kc_user:
                username = kc_user.get("username")
                email = kc_user.get("email")
        except Exception:
            pass

        return ProjectMemberResponse(
            user_id=member.user_id,
            username=username,
            email=email,
            role=member.role,
            created_at=member.created_at,
        )

    @staticmethod
    def remove_member(
        db: Session,
        project_id: UUID,
        target_user_id: str,
        user: Dict[str, Any],
    ) -> None:
        """Remove a member from a project. Requires can_manage_members. Cannot remove owner."""
        project = db.query(Project).filter(Project.id == project_id).first()
        if not project:
            raise ResourceNotFoundException(message="Project not found")

        perms = PermissionResolver.resolve(user, project, db)
        if not perms.can_manage_members:
            raise AuthorizationException(
                message="Only project owners can manage members"
            )

        member = (
            db.query(ProjectMember)
            .filter(
                ProjectMember.project_id == project_id,
                ProjectMember.user_id == target_user_id,
            )
            .first()
        )
        if not member:
            raise ResourceNotFoundException(message="Member not found in this project")

        if member.role == ROLE_OWNER:
            raise ValidationException(
                message="Cannot remove the project owner. Transfer ownership first."
            )

        db.delete(member)
        db.commit()
