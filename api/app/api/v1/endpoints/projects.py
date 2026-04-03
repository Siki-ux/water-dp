"""
v1 Projects Endpoints

.. deprecated::
    Some endpoints in this module are deprecated in favor of v2 endpoints.
    For thing management with automatic TimeIO fixes, use `/api/v2/projects/{id}/things`.
    For TimeIO diagnostics, use `/api/v2/admin/timeio/`.
"""

import asyncio
import logging
from typing import Any, List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api import deps
from app.core.database import get_db
from app.schemas.rbac import (
    PermissionsResponse,
    ProjectMemberCreate,
    ProjectMemberResponse,
    ProjectMemberUpdate,
)
from app.schemas.user_context import (
    DashboardCreate,
    DashboardResponse,
    ProjectCreate,
    ProjectResponse,
    ProjectSensorResponse,
    ProjectUpdate,
)
from app.services.dashboard_service import DashboardService
from app.services.project_service import ProjectService
from app.services.rbac_service import RBACService

router = APIRouter()
logger = logging.getLogger(__name__)

# --- Projects ---


@router.post("/", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(
    project_in: ProjectCreate,
    database: Session = Depends(get_db),
    user: dict = Depends(deps.get_current_user),
) -> Any:
    """Create a new project."""
    return ProjectService.create_project(database, project_in, user)


@router.get("/", response_model=List[ProjectResponse])
async def list_projects(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    group_id: Optional[str] = Query(
        None, description="Filter by Keycloak group ID or name"
    ),
    database: Session = Depends(get_db),
    user: dict = Depends(deps.get_current_user),
) -> Any:
    """List projects (owned or member of). Optionally filter by Keycloak group."""
    from app.services.rbac_service import PermissionResolver

    projects = ProjectService.list_projects(
        database, user, skip=skip, limit=limit, group_id=group_id
    )
    # Batch-resolve permissions for all projects in one query (avoids N+1)
    perms_map = PermissionResolver.resolve_batch(user, projects, database)

    # Batch-count linked sensors per project (avoids N+1)
    from sqlalchemy import func, select

    from app.models.user_context import project_sensors

    project_ids = [p.id for p in projects]
    if project_ids:
        count_stmt = (
            select(
                project_sensors.c.project_id,
                func.count().label("cnt"),
            )
            .where(project_sensors.c.project_id.in_(project_ids))
            .group_by(project_sensors.c.project_id)
        )
        sensor_counts = {
            row.project_id: row.cnt for row in database.execute(count_stmt).all()
        }
    else:
        sensor_counts = {}

    result = []
    for p in projects:
        resp = ProjectResponse.model_validate(p)
        resp.user_role = perms_map[p.id].effective_role
        resp.sensor_count = sensor_counts.get(p.id, 0)
        result.append(resp)
    return result


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: UUID,
    database: Session = Depends(get_db),
    user: dict = Depends(deps.get_current_user),
) -> Any:
    """Get project details."""
    return ProjectService.get_project(database, project_id, user)


@router.put("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: UUID,
    project_in: ProjectUpdate,
    database: Session = Depends(get_db),
    user: dict = Depends(deps.get_current_user),
) -> Any:
    """Update a project."""
    return ProjectService.update_project(database, project_id, project_in, user)


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: UUID,
    database: Session = Depends(get_db),
    user: dict = Depends(deps.get_current_user),
) -> None:
    """Delete a project."""
    ProjectService.delete_project(database, project_id, user)
    return


# --- Grafana Integration ---


@router.get("/{project_id}/grafana-folder")
async def get_grafana_folder(
    project_id: UUID,
    database: Session = Depends(get_db),
    user: dict = Depends(deps.get_current_user),
) -> Any:
    """Get the Grafana folder UID for this project's dashboards."""
    folder_uid = await asyncio.to_thread(
        ProjectService.get_grafana_folder_uid, database, project_id, user
    )
    return {"folder_uid": folder_uid}


# --- Project Sensors ---


@router.get("/{project_id}/sensors", response_model=List[Any])
async def list_project_sensors(
    project_id: UUID,
    database: Session = Depends(get_db),
    user: dict = Depends(deps.get_current_user),
) -> Any:
    """List sensors in project with basic metadata from database."""
    # Run sync service in thread pool to avoid blocking
    return await asyncio.to_thread(
        ProjectService.get_linked_sensors, database, project_id, user
    )


@router.get("/{project_id}/available-sensors", response_model=List[Any])
async def get_available_sensors(
    project_id: UUID,
    database: Session = Depends(get_db),
    user: dict = Depends(deps.get_current_user),
) -> Any:
    """List sensors available in FROST that are NOT linked to this project."""
    return await asyncio.to_thread(
        ProjectService.get_available_sensors, database, project_id, user
    )


@router.post("/{project_id}/sensors", response_model=ProjectSensorResponse)
async def add_project_sensor(
    project_id: UUID,
    thing_uuid: str = Query(..., description="TimeIO Thing UUID"),
    database: Session = Depends(get_db),
    user: dict = Depends(deps.get_current_user),
) -> Any:
    """
    Link a sensor (TimeIO thing) to the project.

    When the first sensor is added to a project without a schema_name,
    the schema will be automatically resolved from TimeIO (deferred schema assignment).
    """
    return ProjectService.add_sensor(database, project_id, thing_uuid, user)


@router.delete("/{project_id}/sensors/{thing_uuid}")
async def remove_project_sensor(
    project_id: UUID,
    thing_uuid: str,
    delete_from_source: bool = Query(
        False, description="Permanently delete from database"
    ),
    database: Session = Depends(get_db),
    user: dict = Depends(deps.get_current_user),
) -> Any:
    """Remove a sensor from the project."""
    return ProjectService.remove_sensor(
        database, project_id, thing_uuid, user, delete_from_source=delete_from_source
    )


@router.put("/{project_id}/things/{thing_uuid}")
async def update_project_sensor(
    project_id: UUID,
    thing_uuid: str,
    updates: dict,
    database: Session = Depends(get_db),
    user: dict = Depends(deps.get_current_user),
) -> Any:
    """Update a sensor (Thing) details."""
    logger.info(f"Received update request for thing {thing_uuid}")
    return ProjectService.update_sensor(database, project_id, thing_uuid, updates, user)


# --- Project Dashboards (Convenience) ---


@router.get("/{project_id}/dashboards", response_model=List[DashboardResponse])
async def list_project_dashboards(
    project_id: UUID,
    database: Session = Depends(get_db),
    user: dict = Depends(deps.get_current_user),
) -> Any:
    """List dashboards in project."""
    return DashboardService.list_dashboards(database, project_id, user)


@router.post("/{project_id}/dashboards", response_model=DashboardResponse)
async def create_project_dashboard(
    project_id: UUID,
    dashboard_in: DashboardCreate,
    database: Session = Depends(get_db),
    user: dict = Depends(deps.get_current_user),
) -> Any:
    """Create a dashboard in the project."""
    # Ensure project_id matches if passed in body
    if dashboard_in.project_id and dashboard_in.project_id != project_id:
        raise HTTPException(
            status_code=400,
            detail="Project ID in body does not match URL parameter",
        )
    dashboard_in = dashboard_in.model_copy(update={"project_id": project_id})
    return DashboardService.create_dashboard(database, dashboard_in, user)


# --- Project Permissions ---


@router.get("/{project_id}/permissions", response_model=PermissionsResponse)
async def get_project_permissions(
    project_id: UUID,
    database: Session = Depends(get_db),
    user: dict = Depends(deps.get_current_user),
) -> Any:
    """
    Get effective permissions for the current user on this project.
    Returns can_view=False rather than 403 when user has no access,
    allowing the frontend to silently redirect.
    """
    return RBACService.get_project_permissions(database, project_id, user)


# --- Project Members ---


@router.get("/{project_id}/members", response_model=List[ProjectMemberResponse])
async def list_project_members(
    project_id: UUID,
    database: Session = Depends(get_db),
    user: dict = Depends(deps.get_current_user),
) -> Any:
    """List all explicit members of a project with their roles."""
    return RBACService.list_members(database, project_id, user)


@router.post(
    "/{project_id}/members",
    response_model=ProjectMemberResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_project_member(
    project_id: UUID,
    member_in: ProjectMemberCreate,
    database: Session = Depends(get_db),
    user: dict = Depends(deps.get_current_user),
) -> Any:
    """
    Add a user to a project with editor or viewer role.
    Requires owner or group admin permissions.
    Accepts either user_id (Keycloak sub) or username.
    """
    return RBACService.add_member(database, project_id, member_in, user)


@router.put(
    "/{project_id}/members/{target_user_id}",
    response_model=ProjectMemberResponse,
)
async def update_project_member(
    project_id: UUID,
    target_user_id: str,
    member_in: ProjectMemberUpdate,
    database: Session = Depends(get_db),
    user: dict = Depends(deps.get_current_user),
) -> Any:
    """
    Change a project member's role.
    Requires owner permissions. Cannot change the owner's role.
    """
    return RBACService.update_member_role(
        database, project_id, target_user_id, member_in, user
    )


@router.delete(
    "/{project_id}/members/{target_user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def remove_project_member(
    project_id: UUID,
    target_user_id: str,
    database: Session = Depends(get_db),
    user: dict = Depends(deps.get_current_user),
) -> None:
    """
    Remove a member from a project.
    Requires owner permissions. Cannot remove the project owner.
    """
    RBACService.remove_member(database, project_id, target_user_id, user)
    return
