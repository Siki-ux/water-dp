from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.base import PydanticBase

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
    authorization_group_ids: Optional[List[str]] = None


class ProjectResponse(ProjectBase):
    id: UUID
    owner_id: str
    authorization_provider_group_id: Optional[str] = None
    authorization_group_ids: Optional[List[str]] = None
    created_at: datetime
    updated_at: datetime
    schema_name: Optional[str] = None
    user_role: Optional[str] = (
        None  # effective role for the requesting user (owner/editor/viewer)
    )
    sensor_count: int = 0

    @classmethod
    def model_validate(cls, obj: Any, **kwargs: Any) -> "ProjectResponse":
        """
        Custom validation to handle field mapping.
        Frontend expects authorization_group_ids (array).
        Backend stores authorization_provider_group_id (string).
        """
        # If it's already a dict (e.g. from ORM or model_dump)
        if isinstance(obj, dict):
            # Work on a shallow copy to avoid mutating shared input dicts
            data = {**obj}
            if "authorization_provider_group_id" in data and not data.get(
                "authorization_group_ids"
            ):
                data["authorization_group_ids"] = (
                    [data["authorization_provider_group_id"]]
                    if data["authorization_provider_group_id"]
                    else []
                )
            return super().model_validate(data, **kwargs)

        # If it's an ORM object
        data = {
            "id": obj.id,
            "name": obj.name,
            "description": obj.description,
            "owner_id": obj.owner_id,
            "authorization_provider_group_id": obj.authorization_provider_group_id,
            "authorization_group_ids": (
                [obj.authorization_provider_group_id]
                if obj.authorization_provider_group_id
                else []
            ),
            "created_at": obj.created_at,
            "updated_at": obj.updated_at,
            "schema_name": obj.schema_name,
        }
        return cls(**data)

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
    latest_data: List[SensorDataPoint] = Field(default_factory=list)
    station_type: str = "unknown"
    properties: Dict[str, Any] = Field(default_factory=dict)


class SensorCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: Optional[str] = None
    lat: float
    lng: float
    station_type: Optional[str] = "unknown"
