from typing import Any, List

from fastapi import APIRouter, Body, Depends, HTTPException

from app.api.deps import get_current_user
from app.services.keycloak_service import KeycloakService
from app.services.rbac_service import is_realm_admin, parse_group_roles

router = APIRouter()

# ---------------------------------------------------------------------------
# Helper: check if the current user has group-admin or realm-admin rights
# over the given Keycloak group.
# ---------------------------------------------------------------------------


def _can_manage_group(user: dict, group_id: str) -> bool:
    """True if the user is a realm admin or has the 'admin' Tier 1 role in this group."""
    if is_realm_admin(user):
        return True

    # Parse JWT groups to find the user's Tier 1 role for this group
    jwt_groups: List[str] = user.get("groups", [])
    group_roles = parse_group_roles(jwt_groups)

    # Find the group's name by ID to match against parsed group paths
    try:
        group = KeycloakService.get_group(group_id)
        if group:
            group_name = group.get("name", "")
            group_path = group.get("path", "").lstrip("/")
            for key, role in group_roles.items():
                if key == group_name or key == group_path or group_name.endswith(key):
                    return role == "admin"
    except Exception:
        pass
    return False


# ---------------------------------------------------------------------------
# Group listing
# ---------------------------------------------------------------------------


@router.get("/", response_model=List[Any])
async def list_groups(user: dict = Depends(get_current_user)):
    """
    List groups.
    Realm admins see all groups; others see only groups they belong to.
    """
    user_id = user.get("sub")
    if is_realm_admin(user):
        groups = KeycloakService.get_all_groups()
    else:
        groups = KeycloakService.get_user_groups(user_id)
    return groups


@router.get("/my-authorization-groups", response_model=List[Any])
async def list_my_authorization_groups(user: dict = Depends(get_current_user)):
    """
    List the Keycloak groups the user belongs to (direct parent groups only).
    Returns group id, name, path and the user's role within each group.
    Realm admins see ALL UFZ-TSM groups with role 'admin'.
    Used by the frontend to determine which groups the user can create projects in.
    """
    # Realm admins get owner-equivalent access to all groups
    if is_realm_admin(user):
        all_groups = KeycloakService.get_all_groups() or []
        result = []
        for g in all_groups:
            name = g.get("name", "")
            if not name.startswith("UFZ-TSM:"):
                continue
            result.append(
                {
                    "id": g.get("id"),
                    "name": name,
                    "path": g.get("path"),
                    "role": "admin",
                }
            )
        return result

    user_id = user.get("sub")
    # Fetch all groups the user is in (includes subgroups)
    all_user_groups = KeycloakService.get_user_groups(user_id)

    # Parse Tier 1 roles from JWT
    jwt_groups: List[str] = user.get("groups", [])
    group_roles = parse_group_roles(jwt_groups)

    # Filter to top-level UFZ-TSM groups only and enrich with role
    result = []
    for g in all_user_groups:
        name = g.get("name", "")
        path = g.get("path", "").lstrip("/")
        if not name.startswith("UFZ-TSM:"):
            continue
        role = group_roles.get(name) or group_roles.get(path) or "viewer"
        result.append(
            {
                "id": g.get("id"),
                "name": name,
                "path": g.get("path"),
                "role": role,
            }
        )

    return result


# ---------------------------------------------------------------------------
# Group creation
# ---------------------------------------------------------------------------


@router.post("/", status_code=201)
async def create_group(
    name: str = Body(..., embed=True), user: dict = Depends(get_current_user)
):
    """
    Create a new Keycloak group with subgroups (viewers / editors / admins).
    - Prefixes with 'UFZ-TSM:' if not present
    - Creates viewers, editors, admins subgroups
    - Assigns matching client roles to each subgroup
    - Adds creator to 'admins' subgroup
    """
    group_name = name if name.startswith("UFZ-TSM:") else f"UFZ-TSM:{name}"

    existing = KeycloakService.get_group_by_name(group_name)
    if existing:
        raise HTTPException(
            status_code=400, detail="Group with this name already exists"
        )

    group_id = KeycloakService.create_group(group_name)
    if not group_id:
        raise HTTPException(status_code=500, detail="Failed to create group")

    # Set empty schema attributes for future schema linking
    try:
        KeycloakService.set_group_attributes(group_id, {"schema_name": ""})
    except Exception as e:
        print(f"Warning: Could not set group attributes: {e}")

    # Create subgroups and assign client roles
    timeio_client_uuid = KeycloakService.get_client_id("timeIO-client")
    for subgroup_name, role_name in [
        ("viewers", "viewer"),
        ("editors", "editor"),
        ("admins", "admin"),
    ]:
        try:
            sub_id = KeycloakService.create_subgroup(group_id, subgroup_name)
            if sub_id and timeio_client_uuid:
                role_rep = KeycloakService.get_client_role(
                    timeio_client_uuid, role_name
                )
                if role_rep:
                    KeycloakService.assign_group_client_roles(
                        sub_id, timeio_client_uuid, [role_rep]
                    )
        except Exception as e:
            print(f"Warning: Could not create subgroup '{subgroup_name}': {e}")

    # Add creator to 'admins' subgroup
    user_id = user.get("sub")
    admins_subgroup = KeycloakService.get_subgroup_by_name(group_id, "admins")
    if admins_subgroup:
        KeycloakService.add_user_to_group(user_id, admins_subgroup["id"])
    else:
        # Fallback: add to parent group
        KeycloakService.add_user_to_group(user_id, group_id)

    return {"id": group_id, "name": group_name, "status": "created"}


# ---------------------------------------------------------------------------
# Group details
# ---------------------------------------------------------------------------


@router.get("/{group_id}", response_model=Any)
async def get_group_details(group_id: str, user: dict = Depends(get_current_user)):
    """Get details of a specific group."""
    group = KeycloakService.get_group(group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    return group


# ---------------------------------------------------------------------------
# Group member management (subgroup-aware)
# ---------------------------------------------------------------------------


@router.get("/{group_id}/members", response_model=List[Any])
async def get_group_members(group_id: str, user: dict = Depends(get_current_user)):
    """
    Get all members of a group (aggregated from all subgroups).
    Each member entry includes their Tier 1 role.
    """
    # Collect members from each subgroup, tagging with role
    all_members: dict = {}  # user_id → {user, role}

    subgroups = KeycloakService.get_subgroups(group_id)
    subgroup_role_map = {
        sg["name"]: sg
        for sg in subgroups
        if sg.get("name") in ("viewers", "editors", "admins")
    }

    from app.services.rbac_service import SUBGROUP_TO_ROLE

    for subgroup_name, subgroup in subgroup_role_map.items():
        role = SUBGROUP_TO_ROLE.get(subgroup_name, "viewer")
        members = KeycloakService.get_group_members(subgroup["id"])
        for m in members:
            uid = m.get("id")
            if uid and uid not in all_members:
                all_members[uid] = {**m, "group_role": role}

    # Also include flat members (legacy / parent group members without subgroup)
    flat_members = KeycloakService.get_group_members(group_id)
    for m in flat_members:
        uid = m.get("id")
        if uid and uid not in all_members:
            all_members[uid] = {**m, "group_role": "viewer"}  # default

    return list(all_members.values())


@router.post("/{group_id}/members", status_code=201)
async def add_group_member(
    group_id: str,
    username: str = Body(..., embed=True),
    role: str = Body("viewer", embed=True),
    user: dict = Depends(get_current_user),
):
    """
    Add a user to a group with a specific Tier 1 role (viewer/editor/admin).
    Requires group admin or realm admin permissions.
    """
    if not _can_manage_group(user, group_id):
        raise HTTPException(
            status_code=403, detail="Group admin or realm admin required"
        )

    if role not in ("viewer", "editor", "admin"):
        raise HTTPException(
            status_code=422, detail="role must be 'viewer', 'editor', or 'admin'"
        )

    target_user = KeycloakService.get_user_by_username(username)
    if not target_user:
        raise HTTPException(status_code=404, detail=f"User '{username}' not found")

    subgroup_name = f"{role}s"  # viewer→viewers, editor→editors, admin→admins
    subgroup = KeycloakService.get_subgroup_by_name(group_id, subgroup_name)
    if subgroup:
        KeycloakService.add_user_to_group(
            user_id=target_user["id"], group_id=subgroup["id"]
        )
    else:
        # Fallback: add to parent group (legacy)
        KeycloakService.add_user_to_group(user_id=target_user["id"], group_id=group_id)

    return {"status": "added", "user_id": target_user["id"], "role": role}


@router.put("/{group_id}/members/{target_user_id}/role", status_code=200)
async def update_group_member_role(
    group_id: str,
    target_user_id: str,
    role: str = Body(..., embed=True),
    user: dict = Depends(get_current_user),
):
    """
    Change a user's Tier 1 role within a group.
    Moves the user from their current subgroup to the new one.
    Requires group admin or realm admin permissions.
    """
    if not _can_manage_group(user, group_id):
        raise HTTPException(
            status_code=403, detail="Group admin or realm admin required"
        )

    if role not in ("viewer", "editor", "admin"):
        raise HTTPException(
            status_code=422, detail="role must be 'viewer', 'editor', or 'admin'"
        )

    # Remove from all subgroups first
    for subgroup_name in ("viewers", "editors", "admins"):
        sub = KeycloakService.get_subgroup_by_name(group_id, subgroup_name)
        if sub:
            try:
                KeycloakService.remove_user_from_group(
                    user_id=target_user_id, group_id=sub["id"]
                )
            except Exception:
                pass

    # Add to target subgroup
    new_subgroup_name = f"{role}s"
    subgroup = KeycloakService.get_subgroup_by_name(group_id, new_subgroup_name)
    if subgroup:
        KeycloakService.add_user_to_group(
            user_id=target_user_id, group_id=subgroup["id"]
        )
    else:
        KeycloakService.add_user_to_group(user_id=target_user_id, group_id=group_id)

    return {"status": "updated", "user_id": target_user_id, "role": role}


@router.delete("/{group_id}/members/{user_id}")
async def remove_group_member(
    group_id: str, user_id: str, user: dict = Depends(get_current_user)
):
    """
    Remove a user from a group (and all its subgroups).
    Requires group admin or realm admin permissions.
    """
    if not _can_manage_group(user, group_id):
        raise HTTPException(
            status_code=403, detail="Group admin or realm admin required"
        )

    # Remove from all subgroups
    for subgroup_name in ("viewers", "editors", "admins"):
        sub = KeycloakService.get_subgroup_by_name(group_id, subgroup_name)
        if sub:
            try:
                KeycloakService.remove_user_from_group(
                    user_id=user_id, group_id=sub["id"]
                )
            except Exception:
                pass

    # Also remove from parent group (legacy flat members)
    try:
        KeycloakService.remove_user_from_group(user_id=user_id, group_id=group_id)
    except Exception:
        pass

    return {"status": "removed"}
