"""
QA/QC Endpoints

Two routers:
  - `router`      → project-scoped (registered under /projects prefix)
  - `sms_router`  → SMS/sensor-scoped (registered under /sms prefix)
                    Uses TSM schema_name directly — the natural SMS context.

Architecture:
  TSM projects (config_db.project) own the QA/QC configs.
  Each TSM project maps to a schema (e.g. user_myproject).
  Water_dp projects are user-facing sub-groupings that point to TSM schemas.
  QA/QC is managed at the TSM-project (schema) level via the SMS.
"""

import io
import logging
from typing import Annotated, Any, List
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.api import deps
from app.core.database import get_db
from app.schemas.qaqc import (
    QAQCConfigCreate,
    QAQCConfigResponse,
    QAQCConfigUpdate,
    QAQCTestCreate,
    QAQCTestResponse,
    QAQCTestUpdate,
    QAQCTriggerRequest,
)
from app.services.minio_service import minio_service
from app.services.project_service import ProjectService
from app.services.qaqc_service import QAQCService

# Project-scoped router (prefix /projects added in api.py)
router = APIRouter()
# SMS-scoped router (prefix /sms added in api.py)
sms_router = APIRouter()

logger = logging.getLogger(__name__)

_svc = QAQCService()


# ------------------------------------------------------------------
# Shared helpers
# ------------------------------------------------------------------


def _resolve_schema(schema_name: str) -> dict:
    """Resolve a TSM schema_name to its config_db.project row. Raises 404 if missing."""
    tsm_project = _svc.get_tsm_project(schema_name)
    if tsm_project is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No TSM project found for schema '{schema_name}'. "
            "Ensure at least one sensor exists in this schema.",
        )
    return tsm_project


def _get_project_and_tsm(project_id: UUID, db: Session, user: dict) -> tuple:
    """Resolve water_dp project_id to both the local Project and TSM project."""
    project = ProjectService.get_project(db, project_id, user)
    if not project.schema_name:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project {project_id} has no TSM schema yet.",
        )
    return project, _resolve_schema(project.schema_name)


def _build_config_response(config: dict, tests: list | None = None) -> dict:
    return {
        "id": config["id"],
        "name": config["name"],
        "context_window": config["context_window"],
        "is_default": config.get("is_default", False),
        "tsm_project_id": config.get("project_id"),
        "tests": tests or [],
    }


def _build_test_response(test: dict) -> dict:
    return {
        "id": test["id"],
        "qaqc_id": test["qaqc_id"],
        "function": test["function"],
        "name": test.get("name"),
        "position": test.get("position"),
        "args": test.get("args"),
        "streams": test.get("streams"),
    }


def _get_config_with_tests(qaqc_id: int) -> dict:
    cfg = _svc.get_config(qaqc_id)
    if cfg is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="QA/QC config not found"
        )
    tests = _svc.list_tests(qaqc_id)
    return _build_config_response(cfg, [_build_test_response(t) for t in tests])


def _assert_config_belongs_to_project(cfg: dict | None, tsm_project_id: int) -> None:
    if cfg is None or cfg.get("project_id") != tsm_project_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="QA/QC config not found"
        )


# ==================================================================
# SMS-scoped routes  (prefix /sms in api.py)
# ==================================================================
#
# URL pattern: /sms/qaqc/{schema_name}/...
# Identifies QA/QC configs by the TSM schema_name (e.g. user_myproject).
# This is the primary management interface used by the SMS.
#

# ==================================================================
# Custom SaQC function management  (stored in MinIO)
# MUST be registered before /qaqc/{schema_name} routes to avoid
# FastAPI treating "functions" as a schema_name path parameter.
# ==================================================================

_CUSTOM_SAQC_BUCKET = "custom-saqc-functions"

_CONNECTIVITY_HINTS = (
    "NameResolutionError",
    "Max retries exceeded",
    "Connection refused",
    "timed out",
)


def _raise_storage_error(exc: Exception) -> None:
    """Translate a raw MinIO/urllib3 exception into a clean HTTP response."""
    exc_str = str(exc)
    if any(hint in exc_str for hint in _CONNECTIVITY_HINTS):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Object storage is unavailable. Check MINIO_URL configuration.",
        )
    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="Object storage error.",
    )


def _ensure_custom_saqc_bucket() -> None:
    if not minio_service.bucket_exists(_CUSTOM_SAQC_BUCKET):
        minio_service.client.make_bucket(_CUSTOM_SAQC_BUCKET)


@sms_router.get("/qaqc/functions", tags=["qaqc"])
async def list_custom_saqc_functions(
    user: dict = Depends(deps.get_current_user),
) -> Any:
    """List all custom SaQC functions uploaded to MinIO."""
    try:
        _ensure_custom_saqc_bucket()
        objects = list(minio_service.client.list_objects(_CUSTOM_SAQC_BUCKET))
        return [
            {
                "name": obj.object_name.removesuffix(".py"),
                "filename": obj.object_name,
                "size": obj.size,
                "uploaded_at": obj.last_modified.isoformat()
                if obj.last_modified
                else None,
            }
            for obj in objects
        ]
    except HTTPException:
        raise
    except Exception as exc:
        _raise_storage_error(exc)


@sms_router.post("/qaqc/functions", status_code=status.HTTP_201_CREATED, tags=["qaqc"])
async def upload_custom_saqc_function(
    file: Annotated[UploadFile, File()],
    user: dict = Depends(deps.get_current_user),
) -> Any:
    """
    Upload a custom SaQC function script (.py).

    The script must define at least one function decorated with @register
    (the standard SaQC extension mechanism).  Example:

        from saqc import register

        @register()
        def myCustomCheck(saqc, field, threshold=10, **kwargs):
            ...
            return saqc
    """
    if not file.filename or not file.filename.endswith(".py"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only Python (.py) files are allowed.",
        )
    content = await file.read()
    if b"@register" not in content:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Script must contain at least one @register-decorated SaQC function.",
        )
    try:
        _ensure_custom_saqc_bucket()
        minio_service.upload_file(
            bucket_name=_CUSTOM_SAQC_BUCKET,
            object_name=file.filename,
            data=io.BytesIO(content),
            length=len(content),
            content_type="text/x-python",
        )
    except HTTPException:
        raise
    except Exception as exc:
        _raise_storage_error(exc)
    return {
        "name": file.filename.removesuffix(".py"),
        "filename": file.filename,
        "size": len(content),
    }


@sms_router.delete(
    "/qaqc/functions/{name}", status_code=status.HTTP_204_NO_CONTENT, tags=["qaqc"]
)
async def delete_custom_saqc_function(
    name: str,
    user: dict = Depends(deps.get_current_user),
) -> None:
    """Delete a custom SaQC function by name (without .py extension)."""
    try:
        _ensure_custom_saqc_bucket()
        minio_service.client.remove_object(_CUSTOM_SAQC_BUCKET, f"{name}.py")
    except HTTPException:
        raise
    except Exception as exc:
        _raise_storage_error(exc)


@sms_router.get(
    "/qaqc/schemas",
    tags=["qaqc"],
)
async def list_qaqc_schemas(
    user: dict = Depends(deps.get_current_user),
) -> Any:
    """
    List all TSM projects (schemas) that have QA/QC configurations.

    Returns a list of {schema_name, project_name, project_uuid, config_count}.
    """
    rows = _svc.list_schemas_with_configs()
    return rows


@sms_router.get(
    "/qaqc/{schema_name}",
    response_model=List[QAQCConfigResponse],
    tags=["qaqc"],
)
async def sms_list_qaqc_configs(
    schema_name: str,
    user: dict = Depends(deps.get_current_user),
) -> Any:
    """List all QA/QC configurations for a TSM schema."""
    tsm = _resolve_schema(schema_name)
    configs = _svc.list_configs(tsm["id"])
    result = []
    for cfg in configs:
        tests = _svc.list_tests(cfg["id"])
        result.append(
            _build_config_response(cfg, [_build_test_response(t) for t in tests])
        )
    return result


@sms_router.post(
    "/qaqc/{schema_name}",
    response_model=QAQCConfigResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["qaqc"],
)
async def sms_create_qaqc_config(
    schema_name: str,
    config_in: QAQCConfigCreate,
    user: dict = Depends(deps.get_current_user),
) -> Any:
    """Create a new QA/QC configuration for a TSM schema."""
    tsm = _resolve_schema(schema_name)
    new_id = _svc.create_config(
        tsm_project_id=tsm["id"],
        name=config_in.name,
        context_window=config_in.context_window,
        is_default=config_in.is_default,
    )
    return _get_config_with_tests(new_id)


@sms_router.get(
    "/qaqc/{schema_name}/{qaqc_id}",
    response_model=QAQCConfigResponse,
    tags=["qaqc"],
)
async def sms_get_qaqc_config(
    schema_name: str,
    qaqc_id: int,
    user: dict = Depends(deps.get_current_user),
) -> Any:
    """Get a single QA/QC configuration with all its tests."""
    tsm = _resolve_schema(schema_name)
    cfg = _svc.get_config(qaqc_id)
    _assert_config_belongs_to_project(cfg, tsm["id"])
    tests = _svc.list_tests(qaqc_id)
    return _build_config_response(cfg, [_build_test_response(t) for t in tests])


@sms_router.put(
    "/qaqc/{schema_name}/{qaqc_id}",
    response_model=QAQCConfigResponse,
    tags=["qaqc"],
)
async def sms_update_qaqc_config(
    schema_name: str,
    qaqc_id: int,
    config_in: QAQCConfigUpdate,
    user: dict = Depends(deps.get_current_user),
) -> Any:
    """Update a QA/QC configuration."""
    tsm = _resolve_schema(schema_name)
    cfg = _svc.get_config(qaqc_id)
    _assert_config_belongs_to_project(cfg, tsm["id"])
    _svc.update_config(
        qaqc_id=qaqc_id,
        tsm_project_id=tsm["id"],
        name=config_in.name,
        context_window=config_in.context_window,
        is_default=config_in.is_default,
    )
    return _get_config_with_tests(qaqc_id)


@sms_router.delete(
    "/qaqc/{schema_name}/{qaqc_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["qaqc"],
)
async def sms_delete_qaqc_config(
    schema_name: str,
    qaqc_id: int,
    user: dict = Depends(deps.get_current_user),
) -> None:
    """Delete a QA/QC configuration and all its tests."""
    tsm = _resolve_schema(schema_name)
    cfg = _svc.get_config(qaqc_id)
    _assert_config_belongs_to_project(cfg, tsm["id"])
    _svc.delete_config(qaqc_id)


@sms_router.post(
    "/qaqc/{schema_name}/{qaqc_id}/tests",
    response_model=QAQCTestResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["qaqc"],
)
async def sms_add_test(
    schema_name: str,
    qaqc_id: int,
    test_in: QAQCTestCreate,
    user: dict = Depends(deps.get_current_user),
) -> Any:
    """Add a QC test to a configuration."""
    tsm = _resolve_schema(schema_name)
    cfg = _svc.get_config(qaqc_id)
    _assert_config_belongs_to_project(cfg, tsm["id"])
    streams_raw = [s.model_dump() for s in test_in.streams] if test_in.streams else None
    new_id = _svc.create_test(
        qaqc_id=qaqc_id,
        function=test_in.function,
        name=test_in.name,
        position=test_in.position,
        args=test_in.args,
        streams=streams_raw,
    )
    tests = _svc.list_tests(qaqc_id)
    test = next((t for t in tests if t["id"] == new_id), None)
    return _build_test_response(test)


@sms_router.put(
    "/qaqc/{schema_name}/{qaqc_id}/tests/{test_id}",
    response_model=QAQCTestResponse,
    tags=["qaqc"],
)
async def sms_update_test(
    schema_name: str,
    qaqc_id: int,
    test_id: int,
    test_in: QAQCTestUpdate,
    user: dict = Depends(deps.get_current_user),
) -> Any:
    """Update a QC test."""
    tsm = _resolve_schema(schema_name)
    cfg = _svc.get_config(qaqc_id)
    _assert_config_belongs_to_project(cfg, tsm["id"])
    streams_raw = [s.model_dump() for s in test_in.streams] if test_in.streams else None
    _svc.update_test(
        test_id=test_id,
        function=test_in.function,
        name=test_in.name,
        position=test_in.position,
        args=test_in.args,
        streams=streams_raw,
    )
    tests = _svc.list_tests(qaqc_id)
    test = next((t for t in tests if t["id"] == test_id), None)
    if test is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Test not found"
        )
    return _build_test_response(test)


@sms_router.delete(
    "/qaqc/{schema_name}/{qaqc_id}/tests/{test_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["qaqc"],
)
async def sms_delete_test(
    schema_name: str,
    qaqc_id: int,
    test_id: int,
    user: dict = Depends(deps.get_current_user),
) -> None:
    """Delete a QC test."""
    tsm = _resolve_schema(schema_name)
    cfg = _svc.get_config(qaqc_id)
    _assert_config_belongs_to_project(cfg, tsm["id"])
    _svc.delete_test(test_id)


@sms_router.post(
    "/qaqc/{schema_name}/trigger",
    tags=["qaqc"],
)
async def sms_trigger_qaqc(
    schema_name: str,
    trigger_in: QAQCTriggerRequest,
    user: dict = Depends(deps.get_current_user),
) -> Any:
    """Manually trigger a QA/QC run for a schema over a given time range."""
    tsm = _resolve_schema(schema_name)
    ok = _svc.trigger_qaqc(
        project_uuid=str(tsm["uuid"]),
        qaqc_name=trigger_in.qaqc_name,
        start_date=trigger_in.start_date,
        end_date=trigger_in.end_date,
    )
    if not ok:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to publish QC trigger.",
        )
    return {
        "status": "triggered",
        "schema_name": schema_name,
        "qaqc_name": trigger_in.qaqc_name,
    }


# ==================================================================
# Per-sensor routes  (prefix /things in api.py)
# ==================================================================


@sms_router.get(
    "/things/{thing_uuid}/qaqc",
    response_model=QAQCConfigResponse,
    tags=["qaqc"],
)
async def get_thing_qaqc(
    thing_uuid: str,
    user: dict = Depends(deps.get_current_user),
) -> Any:
    """Get the per-sensor QA/QC config assigned to a Thing (if any)."""
    cfg = _svc.get_thing_qaqc(thing_uuid)
    if cfg is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="No per-sensor QA/QC config."
        )
    tests = _svc.list_tests(cfg["id"])
    return _build_config_response(cfg, [_build_test_response(t) for t in tests])


@sms_router.post(
    "/things/{thing_uuid}/qaqc",
    response_model=QAQCConfigResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["qaqc"],
)
async def create_thing_qaqc(
    thing_uuid: str,
    config_in: QAQCConfigCreate,
    user: dict = Depends(deps.get_current_user),
) -> Any:
    """Create a per-sensor QA/QC config and assign it to a Thing."""
    new_id = _svc.assign_thing_qaqc(
        thing_uuid=thing_uuid,
        name=config_in.name,
        context_window=config_in.context_window,
    )
    cfg = _svc.get_config(new_id)
    return _build_config_response(cfg)


@sms_router.delete(
    "/things/{thing_uuid}/qaqc",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["qaqc"],
)
async def delete_thing_qaqc(
    thing_uuid: str,
    user: dict = Depends(deps.get_current_user),
) -> None:
    """Unassign and delete the per-sensor QA/QC config for a Thing."""
    _svc.unassign_thing_qaqc(thing_uuid)


@sms_router.post(
    "/things/{thing_uuid}/qaqc/tests",
    response_model=QAQCTestResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["qaqc"],
)
async def add_thing_qaqc_test(
    thing_uuid: str,
    test_in: QAQCTestCreate,
    user: dict = Depends(deps.get_current_user),
) -> Any:
    """Add a test to the per-sensor QA/QC config."""
    cfg = _svc.get_thing_qaqc(thing_uuid)
    if cfg is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No per-sensor config assigned.",
        )
    streams_raw = [s.model_dump() for s in test_in.streams] if test_in.streams else None
    new_id = _svc.create_test(
        qaqc_id=cfg["id"],
        function=test_in.function,
        name=test_in.name,
        position=test_in.position,
        args=test_in.args,
        streams=streams_raw,
    )
    tests = _svc.list_tests(cfg["id"])
    test = next((t for t in tests if t["id"] == new_id), None)
    return _build_test_response(test)


@sms_router.delete(
    "/things/{thing_uuid}/qaqc/tests/{test_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["qaqc"],
)
async def delete_thing_qaqc_test(
    thing_uuid: str,
    test_id: int,
    user: dict = Depends(deps.get_current_user),
) -> None:
    """Delete a test from the per-sensor QA/QC config."""
    _svc.delete_test(test_id)


@sms_router.post(
    "/things/{thing_uuid}/qaqc/trigger",
    tags=["qaqc"],
)
async def trigger_thing_qaqc(
    thing_uuid: str,
    user: dict = Depends(deps.get_current_user),
) -> Any:
    """Trigger QA/QC for a specific sensor."""
    ok = _svc.trigger_thing_qaqc(thing_uuid)
    if not ok:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to publish QC trigger.",
        )
    return {"status": "triggered", "thing_uuid": thing_uuid}


# ==================================================================
# Project-scoped routes  (prefix /projects in api.py — kept for compat)
# ==================================================================


@router.get(
    "/{project_id}/qaqc", response_model=List[QAQCConfigResponse], tags=["qaqc"]
)
async def list_qaqc_configs(
    project_id: UUID,
    db: Session = Depends(get_db),
    user: dict = Depends(deps.get_current_user),
) -> Any:
    _, tsm = _get_project_and_tsm(project_id, db, user)
    configs = _svc.list_configs(tsm["id"])
    return [
        _build_config_response(
            c, [_build_test_response(t) for t in _svc.list_tests(c["id"])]
        )
        for c in configs
    ]


@router.post(
    "/{project_id}/qaqc",
    response_model=QAQCConfigResponse,
    status_code=201,
    tags=["qaqc"],
)
async def create_qaqc_config(
    project_id: UUID,
    config_in: QAQCConfigCreate,
    db: Session = Depends(get_db),
    user: dict = Depends(deps.get_current_user),
) -> Any:
    _, tsm = _get_project_and_tsm(project_id, db, user)
    new_id = _svc.create_config(
        tsm["id"], config_in.name, config_in.context_window, config_in.is_default
    )
    return _get_config_with_tests(new_id)


@router.get(
    "/{project_id}/qaqc/{qaqc_id}", response_model=QAQCConfigResponse, tags=["qaqc"]
)
async def get_qaqc_config(
    project_id: UUID,
    qaqc_id: int,
    db: Session = Depends(get_db),
    user: dict = Depends(deps.get_current_user),
) -> Any:
    _, tsm = _get_project_and_tsm(project_id, db, user)
    cfg = _svc.get_config(qaqc_id)
    _assert_config_belongs_to_project(cfg, tsm["id"])
    return _get_config_with_tests(qaqc_id)


@router.put(
    "/{project_id}/qaqc/{qaqc_id}", response_model=QAQCConfigResponse, tags=["qaqc"]
)
async def update_qaqc_config(
    project_id: UUID,
    qaqc_id: int,
    config_in: QAQCConfigUpdate,
    db: Session = Depends(get_db),
    user: dict = Depends(deps.get_current_user),
) -> Any:
    _, tsm = _get_project_and_tsm(project_id, db, user)
    cfg = _svc.get_config(qaqc_id)
    _assert_config_belongs_to_project(cfg, tsm["id"])
    _svc.update_config(
        qaqc_id,
        tsm["id"],
        config_in.name,
        config_in.context_window,
        config_in.is_default,
    )
    return _get_config_with_tests(qaqc_id)


@router.delete("/{project_id}/qaqc/{qaqc_id}", status_code=204, tags=["qaqc"])
async def delete_qaqc_config(
    project_id: UUID,
    qaqc_id: int,
    db: Session = Depends(get_db),
    user: dict = Depends(deps.get_current_user),
) -> None:
    _, tsm = _get_project_and_tsm(project_id, db, user)
    cfg = _svc.get_config(qaqc_id)
    _assert_config_belongs_to_project(cfg, tsm["id"])
    _svc.delete_config(qaqc_id)


@router.post(
    "/{project_id}/qaqc/{qaqc_id}/tests",
    response_model=QAQCTestResponse,
    status_code=201,
    tags=["qaqc"],
)
async def add_qaqc_test(
    project_id: UUID,
    qaqc_id: int,
    test_in: QAQCTestCreate,
    db: Session = Depends(get_db),
    user: dict = Depends(deps.get_current_user),
) -> Any:
    _, tsm = _get_project_and_tsm(project_id, db, user)
    cfg = _svc.get_config(qaqc_id)
    _assert_config_belongs_to_project(cfg, tsm["id"])
    streams_raw = [s.model_dump() for s in test_in.streams] if test_in.streams else None
    new_id = _svc.create_test(
        qaqc_id,
        test_in.function,
        test_in.name,
        test_in.position,
        test_in.args,
        streams_raw,
    )
    test = next((t for t in _svc.list_tests(qaqc_id) if t["id"] == new_id), None)
    return _build_test_response(test)


@router.put(
    "/{project_id}/qaqc/{qaqc_id}/tests/{test_id}",
    response_model=QAQCTestResponse,
    tags=["qaqc"],
)
async def update_qaqc_test(
    project_id: UUID,
    qaqc_id: int,
    test_id: int,
    test_in: QAQCTestUpdate,
    db: Session = Depends(get_db),
    user: dict = Depends(deps.get_current_user),
) -> Any:
    _, tsm = _get_project_and_tsm(project_id, db, user)
    cfg = _svc.get_config(qaqc_id)
    _assert_config_belongs_to_project(cfg, tsm["id"])
    streams_raw = [s.model_dump() for s in test_in.streams] if test_in.streams else None
    _svc.update_test(
        test_id,
        test_in.function,
        test_in.name,
        test_in.position,
        test_in.args,
        streams_raw,
    )
    test = next((t for t in _svc.list_tests(qaqc_id) if t["id"] == test_id), None)
    if test is None:
        raise HTTPException(status_code=404, detail="Test not found")
    return _build_test_response(test)


@router.delete(
    "/{project_id}/qaqc/{qaqc_id}/tests/{test_id}", status_code=204, tags=["qaqc"]
)
async def delete_qaqc_test(
    project_id: UUID,
    qaqc_id: int,
    test_id: int,
    db: Session = Depends(get_db),
    user: dict = Depends(deps.get_current_user),
) -> None:
    _, tsm = _get_project_and_tsm(project_id, db, user)
    cfg = _svc.get_config(qaqc_id)
    _assert_config_belongs_to_project(cfg, tsm["id"])
    _svc.delete_test(test_id)


@router.post("/{project_id}/qaqc/trigger", tags=["qaqc"])
async def trigger_qaqc(
    project_id: UUID,
    trigger_in: QAQCTriggerRequest,
    db: Session = Depends(get_db),
    user: dict = Depends(deps.get_current_user),
) -> Any:
    _, tsm = _get_project_and_tsm(project_id, db, user)
    ok = _svc.trigger_qaqc(
        str(tsm["uuid"]),
        trigger_in.qaqc_name,
        trigger_in.start_date,
        trigger_in.end_date,
    )
    if not ok:
        raise HTTPException(status_code=502, detail="Failed to publish QC trigger.")
    return {"status": "triggered", "qaqc_name": trigger_in.qaqc_name}
