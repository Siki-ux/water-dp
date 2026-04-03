"""
Computation schemas.
"""

from pydantic import UUID4, BaseModel


class ComputationScriptRead(BaseModel):
    id: UUID4
    name: str
    description: str | None
    project_id: UUID4
    filename: str

    class ConfigDict:
        from_attributes = True


class ComputationRequest(BaseModel):
    params: dict = {}


class TaskSubmissionResponse(BaseModel):
    task_id: str
    status: str


class ComputationJobRead(BaseModel):
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

    class ConfigDict:
        from_attributes = True


class ScriptContentUpdate(BaseModel):
    content: str
