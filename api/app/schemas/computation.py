"""
Computation schemas.
"""

from pydantic import UUID4, BaseModel, ConfigDict, Field


class ComputationScriptRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID4
    name: str
    description: str | None
    project_id: UUID4
    filename: str


class ComputationRequest(BaseModel):
    params: dict = Field(default_factory=dict)


class TaskSubmissionResponse(BaseModel):
    task_id: str
    status: str


class ComputationJobRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    script_id: UUID4
    user_id: str
    status: str
    start_time: str | None
    end_time: str | None
    result: str | None
    error: str | None
    logs: str | None
    created_by: str | None


class ScriptContentUpdate(BaseModel):
    content: str
