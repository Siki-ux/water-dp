from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.base import PydanticBase

# --- Project Member Schemas ---


class ProjectMemberBase(PydanticBase):
    role: str = Field(default="viewer", pattern="^(viewer|editor)$")


class ProjectMemberCreate(ProjectMemberBase):
    user_id: Optional[str] = None
    username: Optional[str] = None  # Alternative to user_id


class ProjectMemberUpdate(BaseModel):
    role: str = Field(pattern="^(viewer|editor)$")


class ProjectMemberResponse(ProjectMemberBase):
    id: UUID
    project_id: UUID
    user_id: str
    username: Optional[str] = None
    created_at: datetime
    updated_at: datetime


# --- Dashboard Schemas ---


class DashboardBase(PydanticBase):
    name: str = Field(min_length=1, max_length=255)
    layout_config: Optional[Dict[str, Any]] = None
    widgets: Optional[List[Dict[str, Any]]] = None
    is_public: bool = False


class DashboardCreate(DashboardBase):
    project_id: Optional[UUID] = None


class DashboardUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    layout_config: Optional[Dict[str, Any]] = None
    widgets: Optional[List[Dict[str, Any]]] = None
    is_public: Optional[bool] = None


class DashboardResponse(DashboardBase):
    id: UUID
    project_id: UUID
    created_at: datetime
    updated_at: datetime


# --- Project Schemas ---


class ProjectBase(PydanticBase):
    name: str = Field(min_length=1, max_length=255)
    description: Optional[str] = None


class ProjectCreate(ProjectBase):
    # Support array from frontend (authorization_group_ids)
    # or single string (authorization_provider_group_id)
    authorization_group_ids: Optional[List[str]] = Field(
        default=None, description="Authorization Group IDs from Keycloak (array)"
    )
    authorization_provider_group_id: Optional[str] = Field(
        default=None, description="Authorization Group ID from Keycloak (single)"
    )

    @property
    def resolved_group_id(self) -> Optional[str]:
        """Get the group ID, preferring the array format from frontend."""
        if self.authorization_group_ids and len(self.authorization_group_ids) > 0:
            return self.authorization_group_ids[0]
        return self.authorization_provider_group_id


class ProjectUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    authorization_provider_group_id: Optional[str] = None


class ProjectResponse(ProjectBase):
    id: UUID
    owner_id: str
    authorization_provider_group_id: Optional[str] = None
    created_at: datetime
    created_at: datetime
    updated_at: datetime
    schema_name: Optional[str] = None

    # Optional fields to include linked resources?
    # For now, keep it simple. Members and Dashboards fetched separately or via include param.


class ProjectSensorResponse(BaseModel):
    """Response when linking a sensor to a project."""

    project_id: UUID
    thing_uuid: UUID


class SensorLocation(BaseModel):
    lat: float
    lng: float


class SensorDataPoint(BaseModel):
    parameter: str
    value: float | str | None
    unit: str
    timestamp: datetime


class SensorDetail(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    status: str
    last_activity: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    latest_data: List[SensorDataPoint] = []
    station_type: str = "unknown"
    properties: Dict[str, Any] = {}


class SensorCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: Optional[str] = None
    lat: float
    lng: float
    station_type: Optional[str] = "unknown"
