from typing import Any, List

from fastapi import APIRouter, Body, Depends, HTTPException

from app.api.deps import get_current_user
from app.services.keycloak_service import KeycloakService
from app.services.project_service import ProjectService

router = APIRouter()


@router.get("/", response_model=List[Any])
async def list_groups(user: dict = Depends(get_current_user)):
    """
    List groups.
    If user has 'admin' realm role, returns all groups.
    Otherwise, returns only groups the user is a member of.
    """
    user_id = user.get("sub")

    # Check for admin role
    is_admin = False
    realm_access = user.get("realm_access", {})
    if realm_access and "admin" in realm_access.get("roles", []):
        is_admin = True

    if is_admin:
        groups = KeycloakService.get_all_groups()
    else:
        groups = KeycloakService.get_user_groups(user_id)

    return groups


@router.get("/my-authorization-groups", response_model=List[Any])
async def list_my_authorization_groups(user: dict = Depends(get_current_user)):
    """
    List groups the user belongs to (Keycloak-centric model).
    Membership = authorization. No subgroup parsing needed.
    """
    user_id = user.get("sub")
    user_groups = KeycloakService.get_user_groups(user_id)

    # Return all groups the user is a member of
    # (the frontend uses this as "which projects can I create?")
    return [
        {"id": g.get("id"), "name": g.get("name"), "path": g.get("path")}
        for g in user_groups
        if g.get("name", "").startswith("UFZ-TSM:")
    ]


@router.post("/", status_code=201)
async def create_group(
    name: str = Body(..., embed=True), user: dict = Depends(get_current_user)
):
    """
    Create a new Keycloak group (Keycloak-centric model).
    - Prefixes with 'UFZ-TSM:' if not present
    - Adds creator to the group
    - Assigns 'admin' client role on timeIO-client to the group
    - Sets empty group attributes for schema linking
    """
    # Enforce UFZ-TSM prefix
    group_name = name
    if not group_name.startswith("UFZ-TSM:"):
        group_name = f"UFZ-TSM:{group_name}"

    existing = KeycloakService.get_group_by_name(group_name)
    if existing:
        raise HTTPException(
            status_code=400, detail="Group with this name already exists"
        )

    group_id = KeycloakService.create_group(group_name)
    if not group_id:
        raise HTTPException(status_code=500, detail="Failed to create group")

    # Add creator to group
    user_id = user.get("sub")
    KeycloakService.add_user_to_group(user_id, group_id)

    # Set empty attributes for future schema linking
    try:
        KeycloakService.set_group_attributes(group_id, {
            "schema_name": "",
        })
    except Exception as error:
        print(f"Warning: Could not set group attributes: {error}")

    # Assign 'admin' client role to the group (all members inherit)
    try:
        timeio_client_uuid = KeycloakService.get_client_id("timeIO-client")
        if timeio_client_uuid:
            admin_role = KeycloakService.get_client_role(timeio_client_uuid, "admin")
            if admin_role:
                KeycloakService.assign_group_client_roles(
                    group_id, timeio_client_uuid, [admin_role]
                )
            else:
                print("Warning: 'admin' role not found for timeIO-client")
        else:
            print("Warning: timeIO-client not found")
    except Exception as error:
        print(f"Failed to assign client role: {error}")

    return {"id": group_id, "name": group_name, "status": "created"}


@router.get("/{group_id}", response_model=Any)
async def get_group_details(group_id: str, user: dict = Depends(get_current_user)):
    """
    Get details of a specific group.
    """
    group = KeycloakService.get_group(group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    return group


@router.get("/{group_id}/members", response_model=List[Any])
async def get_group_members(
    group_id: str,
    user: dict = Depends(get_current_user),
):
    """
    Get members of a specific Keycloak group.
    In Keycloak-centric model, all members are returned (no subgroup filtering).
    """
    members = KeycloakService.get_group_members(group_id)
    return members


@router.post("/{group_id}/members", status_code=201)
async def add_group_member(
    group_id: str,
    username: str = Body(..., embed=True),
    user: dict = Depends(get_current_user),
):
    """
    Add a user to a group by username.
    """
    if not ProjectService._is_admin(user):
        raise HTTPException(
            status_code=403, detail="Only Admins can manage group members"
        )

    target_user = KeycloakService.get_user_by_username(username)
    if not target_user:
        raise HTTPException(status_code=404, detail=f"User '{username}' not found")

    KeycloakService.add_user_to_group(user_id=target_user["id"], group_id=group_id)
    return {"status": "added", "user_id": target_user["id"]}


@router.delete("/{group_id}/members/{user_id}")
async def remove_group_member(
    group_id: str, user_id: str, user: dict = Depends(get_current_user)
):
    """
    Remove a user from a group.
    """
    if not ProjectService._is_admin(user):
        raise HTTPException(
            status_code=403, detail="Only Admins can manage group members"
        )

    KeycloakService.remove_user_from_group(user_id=user_id, group_id=group_id)
    return {"status": "removed"}
