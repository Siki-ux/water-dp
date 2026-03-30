import ast
import os
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from celery.result import AsyncResult
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import UUID4
from sqlalchemy.orm import Session

from app.api import deps
from app.core.database import get_db
from app.models.computations import ComputationJob, ComputationScript
from app.schemas.computation import (
    ComputationJobRead,
    ComputationRequest,
    ComputationScriptRead,
    ScriptContentUpdate,
    TaskSubmissionResponse,
)
from app.services.project_service import ProjectService
from app.tasks.computation_tasks import run_computation_task

router = APIRouter()


COMPUTATIONS_DIR = "app/computations"
MAX_FILE_SIZE = 1 * 1024 * 1024  # 1MB


ALLOWED_IMPORTS = frozenset(
    {
        "math",
        "statistics",
        "datetime",
        "json",
        "csv",
        "io",
        "re",
        "collections",
        "itertools",
        "functools",
        "decimal",
        "fractions",
        "typing",
        "dataclasses",
        "enum",
        "copy",
        "textwrap",
        "string",
        "numpy",
        "pandas",
        "scipy",
    }
)

FORBIDDEN_BUILTINS = frozenset(
    {
        "eval",
        "exec",
        "compile",
        "__import__",
        "globals",
        "locals",
        "getattr",
        "setattr",
        "delattr",
        "open",
        "input",
        "breakpoint",
        "memoryview",
        "type",
        "vars",
        "dir",
    }
)


def validate_script_security(content: str):
    """Validate uploaded Python scripts using an import allowlist."""
    try:
        tree = ast.parse(content)
    except SyntaxError:
        raise HTTPException(status_code=400, detail="Invalid Python syntax")

    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                top_module = alias.name.split(".")[0]
                if top_module not in ALLOWED_IMPORTS:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Import '{alias.name}' is not allowed",
                    )
        elif isinstance(node, ast.ImportFrom):
            if node.module:
                top_module = node.module.split(".")[0]
                if top_module not in ALLOWED_IMPORTS:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Import from '{node.module}' is not allowed",
                    )
        elif isinstance(node, ast.Call):
            func_name = None
            if isinstance(node.func, ast.Name):
                func_name = node.func.id
            elif isinstance(node.func, ast.Attribute):
                func_name = node.func.attr

            if func_name and func_name in FORBIDDEN_BUILTINS:
                raise HTTPException(
                    status_code=400,
                    detail=f"Function '{func_name}' is not allowed",
                )


@router.post("/upload", response_model=ComputationScriptRead)
async def upload_computation_script(
    file: UploadFile = File(...),
    name: str = Form(...),
    description: str = Form(None),
    project_id: UUID4 = Form(...),
    database: Session = Depends(get_db),
    user: dict = Depends(deps.get_current_user),
):
    """Upload a computation script. Requires 'editor' access."""
    # Check Project Access (Editor required)
    ProjectService._check_access(database, project_id, user, required_role="editor")

    # 1. Validate Extension
    if not file.filename.endswith(".py"):
        raise HTTPException(status_code=400, detail="Only .py files are allowed")

    # 2. Validate Size & Content Security
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File size exceeds 1MB limit")

    content_str = content.decode("utf-8")
    validate_script_security(content_str)

    if not os.path.exists(COMPUTATIONS_DIR):
        os.makedirs(COMPUTATIONS_DIR)

    # Secure filename - ensure valid python module name (no dashes)
    project_hex = (
        project_id.hex
        if hasattr(project_id, "hex")
        else str(project_id).replace("-", "")
    )
    safe_filename = f"{project_hex}_{uuid.uuid4().hex[:8]}_{file.filename}"
    file_path = os.path.join(COMPUTATIONS_DIR, safe_filename)

    # Save File
    with open(file_path, "wb") as buffer:
        buffer.write(content)

    # Save to DB
    db_script = ComputationScript(
        id=uuid.uuid4(),
        name=name,
        description=description,
        filename=safe_filename,
        project_id=project_id,
        uploaded_by=user.get("sub", "unknown"),
    )
    database.add(db_script)
    database.commit()
    database.refresh(db_script)

    return db_script


@router.post("/run/{script_id}", response_model=TaskSubmissionResponse)
async def run_computation(
    script_id: UUID4,
    request: ComputationRequest,
    database: Session = Depends(get_db),
    user: dict = Depends(deps.get_current_user),
):
    """Run a computation script. Requires 'viewer' access."""
    script = (
        database.query(ComputationScript)
        .filter(ComputationScript.id == script_id)
        .first()
    )
    if not script:
        raise HTTPException(status_code=404, detail="Script not found")

    # Check Project Access (Viewer required)
    ProjectService._check_access(
        database, script.project_id, user, required_role="viewer"
    )

    # Check file existence
    script_path = os.path.join(COMPUTATIONS_DIR, script.filename)
    if not os.path.exists(script_path):
        raise HTTPException(status_code=404, detail="Script file missing on server")

    module_name = script.filename
    if module_name.endswith(".py"):
        module_name = module_name[:-3]

    task = run_computation_task.delay(
        module_name, request.params, script_id=str(script.id)
    )

    # Create Job Record
    job = ComputationJob(
        id=task.id,
        script_id=script.id,
        user_id=user.get("sub"),
        status="PENDING",
        start_time=datetime.now(timezone.utc).isoformat(),
        created_by=user.get("preferred_username", "unknown"),
        updated_by=user.get("preferred_username", "unknown"),
    )
    database.add(job)
    database.commit()

    return {"task_id": task.id, "status": "submitted"}


@router.get("/list/{project_id}", response_model=List[ComputationScriptRead])
async def list_project_computations(
    project_id: UUID4,
    database: Session = Depends(get_db),
    user: dict = Depends(deps.get_current_user),
):
    """
    List scripts for a specific project.
    """
    ProjectService._check_access(database, project_id, user, required_role="viewer")

    scripts = (
        database.query(ComputationScript)
        .filter(ComputationScript.project_id == project_id)
        .all()
    )
    return scripts


@router.get("/scripts", response_model=List[ComputationScriptRead])
async def list_all_scripts(
    project_id: Optional[UUID4] = None,
    database: Session = Depends(get_db),
    user: dict = Depends(deps.get_current_user),
):
    """
    List scripts. If project_id provided, filter by project.
    """
    query = database.query(ComputationScript)

    if project_id:
        ProjectService._check_access(database, project_id, user, required_role="viewer")
        query = query.filter(ComputationScript.project_id == project_id)

    return query.all()


@router.get("/jobs/{script_id}", response_model=List[ComputationJobRead])
async def list_script_jobs(
    script_id: UUID4,
    database: Session = Depends(get_db),
    user: dict = Depends(deps.get_current_user),
):
    """List execution history for a script."""
    script = (
        database.query(ComputationScript)
        .filter(ComputationScript.id == script_id)
        .first()
    )
    if not script:
        raise HTTPException(status_code=404, detail="Script not found")

    ProjectService._check_access(
        database, script.project_id, user, required_role="viewer"
    )

    jobs = (
        database.query(ComputationJob)
        .filter(ComputationJob.script_id == script_id)
        .order_by(ComputationJob.start_time.desc())
        .limit(50)
        .all()
    )

    import json

    from app.core.celery_app import celery_app

    dirty = False
    for job in jobs:
        if job.status in ["PENDING", "STARTED"]:
            task_result = AsyncResult(job.id, app=celery_app)
            if task_result.ready():
                job.status = task_result.status
                job.end_time = datetime.now(timezone.utc).isoformat()

                if task_result.successful():
                    task_result_data = task_result.result
                    if isinstance(task_result_data, (dict, list)):
                        job.result = json.dumps(task_result_data)
                        job.logs = json.dumps(task_result_data, indent=2)
                    else:
                        job.result = str(task_result_data)
                        job.logs = str(task_result_data)
                else:
                    job.error = str(task_result.result)
                    job.logs = f"Error: {task_result.result}\nTraceback: {task_result.traceback}"

                dirty = True

    if dirty:
        database.commit()

    return jobs


@router.get("/tasks/{task_id}")
async def get_computation_status(
    task_id: str,
    database: Session = Depends(get_db),
    user: dict = Depends(deps.get_current_user),
):
    """Get computation task status."""
    job = database.query(ComputationJob).filter(ComputationJob.id == task_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    from app.core.config import settings

    roles = user.get("realm_access", {}).get("roles", [])
    is_superuser = any(role in roles for role in settings.admin_roles_list)

    if not is_superuser and job.user_id != user.get("sub"):
        raise HTTPException(status_code=403, detail="Not authorized to view this job")

    if job.status in ["SUCCESS", "FAILURE", "REVOKED"]:
        return {
            "task_id": task_id,
            "status": job.status,
            "result": job.result,
            "error": job.error,
            "logs": job.logs,
        }

    from app.core.celery_app import celery_app

    task_result = AsyncResult(task_id, app=celery_app)

    # Check if ready and sync to DB
    if task_result.ready():
        import json

        job.status = task_result.status
        job.end_time = datetime.now(timezone.utc).isoformat()

        if task_result.successful():
            task_result_data = task_result.result
            if isinstance(task_result_data, (dict, list)):
                job.result = json.dumps(task_result_data)
                job.logs = json.dumps(task_result_data, indent=2)
            else:
                job.result = str(task_result_data)
                job.logs = str(task_result_data)
        else:
            job.error = str(task_result.result)
            job.logs = (
                f"Error: {task_result.result}\nTraceback: {task_result.traceback}"
            )

        database.commit()
        database.refresh(job)

    return {
        "task_id": task_id,
        "status": task_result.status,
        "result": job.result,
        "logs": job.logs,
    }


@router.get("/content/{script_id}")
async def get_script_content(
    script_id: UUID4,
    database: Session = Depends(get_db),
    user: dict = Depends(deps.get_current_user),
):
    """Get the content of a computation script."""
    script = (
        database.query(ComputationScript)
        .filter(ComputationScript.id == script_id)
        .first()
    )
    if not script:
        raise HTTPException(status_code=404, detail="Script not found")

    ProjectService._check_access(
        database, script.project_id, user, required_role="viewer"
    )

    script_path = os.path.join(COMPUTATIONS_DIR, script.filename)
    if not os.path.exists(script_path):
        raise HTTPException(status_code=404, detail="Script file missing on server")

    with open(script_path, "r", encoding="utf-8") as file_object:
        content = file_object.read()

    return {"content": content}


@router.put("/content/{script_id}")
async def update_script_content(
    script_id: UUID4,
    update_data: ScriptContentUpdate,
    database: Session = Depends(get_db),
    user: dict = Depends(deps.get_current_user),
):
    """Update script content. Requires 'editor' access."""
    script = (
        database.query(ComputationScript)
        .filter(ComputationScript.id == script_id)
        .first()
    )
    if not script:
        raise HTTPException(status_code=404, detail="Script not found")

    ProjectService._check_access(
        database, script.project_id, user, required_role="editor"
    )

    new_content = update_data.content

    # 1. Validate Security
    validate_script_security(new_content)

    # 2. Validate Size (approx)
    if len(new_content.encode("utf-8")) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File size exceeds 1MB limit")

    # 3. Save
    script_path = os.path.join(COMPUTATIONS_DIR, script.filename)
    with open(script_path, "w", encoding="utf-8") as file_object:
        file_object.write(new_content)

    return {"status": "updated", "id": script_id}
