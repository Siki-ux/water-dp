import ast
import logging
import os
import re
import tempfile
from typing import Annotated, Any, Dict

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status

from app.api import deps
from app.schemas.sensor import ExternalAPIConfig, ExternalSFTPConfig
from app.services.minio_service import minio_service
from app.services.timeio.crypto_utils import encrypt_password
from app.services.timeio.orchestrator import TimeIOOrchestrator
from app.services.timeio.timeio_db import TimeIODatabase

router = APIRouter()
logger = logging.getLogger(__name__)

CUSTOM_SYNCERS_BUCKET = "custom-syncers"
_MAX_SYNCER_SIZE = 1 * 1024 * 1024  # 1 MB
_SAFE_NAME_RE = re.compile(r"^[a-zA-Z0-9_\-]+$")

# ========== External API Type Management ==========


@router.get("/api-types", response_model=Dict[str, Any])
def list_ext_api_types(
    limit: int = 100,
    offset: int = 0,
    user: dict = Depends(deps.get_current_user),
):
    """List all available external API types (built-in and custom)."""
    try:
        db = TimeIODatabase()
        return db.get_all_ext_api_types(limit, offset)
    except Exception as e:
        logger.error(f"Failed to list ext API types: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to list API types",
        )


@router.get("/api-types/{id_or_name}", response_model=Dict[str, Any])
def get_ext_api_type(id_or_name: str, user: dict = Depends(deps.get_current_user)):
    """Get details for an external API type, including syncer code if available."""
    db = TimeIODatabase()
    api_type = db.get_ext_api_type(id_or_name)
    if not api_type:
        raise HTTPException(status_code=404, detail="API type not found")

    # Load syncer code if available
    properties = api_type.get("properties") or {}
    script_bucket = properties.get("script_bucket")
    script_path = properties.get("script_path")

    if script_bucket and script_path:
        try:
            content = minio_service.get_file_content(script_bucket, script_path)
            if content:
                api_type["code"] = content.decode("utf-8")
        except Exception as e:
            logger.error(f"Failed to fetch syncer code for {id_or_name}: {e}")
            api_type["code_error"] = str(e)

    return api_type


@router.post("/api-types", status_code=status.HTTP_201_CREATED)
def create_ext_api_type(
    name: str, user: dict = Depends(deps.get_current_active_superuser)
):
    """Register a new external API type (name only)."""
    try:
        db = TimeIODatabase()
        existing = db.get_ext_api_type(name)
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"API type '{name}' already exists",
            )
        db.upsert_ext_api_type(name)
        return {"message": f"API type '{name}' created", "name": name}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to create ext API type: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create API type",
        )


@router.delete("/api-types/{id_or_name}")
def delete_ext_api_type(
    id_or_name: str, user: dict = Depends(deps.get_current_active_superuser)
):
    """Delete an external API type (only if not in use by any sensor)."""
    db = TimeIODatabase()
    result = db.delete_ext_api_type(id_or_name)
    if not result.get("success"):
        detail = result.get("reason", "Unknown error")
        code = 409 if "in use" in detail else 404
        raise HTTPException(status_code=code, detail=detail)
    return {"message": f"API type '{id_or_name}' deleted"}


# ========== Custom Syncer Script Upload ==========


@router.post("/api-types/upload", status_code=status.HTTP_201_CREATED)
async def upload_custom_syncer(
    api_type_name: Annotated[str, Form()],
    file: Annotated[UploadFile, File()],
    user: dict = Depends(deps.get_current_active_superuser),
):
    """
    Upload a custom Python syncer script for an external API type.

    The script must define a class inheriting from ExtApiSyncer with
    fetch_api_data() and do_parse() methods.
    """
    # Sanitize api_type_name to prevent object-key manipulation
    if not _SAFE_NAME_RE.match(api_type_name):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="api_type_name must contain only alphanumeric characters, hyphens, and underscores.",
        )

    safe_filename = os.path.basename(file.filename or "upload.py")
    if not safe_filename.endswith(".py"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only Python (.py) files are allowed.",
        )

    try:
        if not minio_service.bucket_exists(CUSTOM_SYNCERS_BUCKET):
            logger.info(f"Bucket {CUSTOM_SYNCERS_BUCKET} not found, creating it.")
            minio_service.client.make_bucket(CUSTOM_SYNCERS_BUCKET)

        # Stream upload to a spooled temp file to avoid holding everything in memory
        spool = tempfile.SpooledTemporaryFile(max_size=64 * 1024)
        total = 0
        while chunk := await file.read(64 * 1024):
            total += len(chunk)
            if total > _MAX_SYNCER_SIZE:
                spool.close()
                raise HTTPException(
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    detail=f"File exceeds maximum size of {_MAX_SYNCER_SIZE} bytes.",
                )
            spool.write(chunk)

        spool.seek(0)
        content = spool.read()
        spool.seek(0)

        # Parse with ast to verify a class inheriting from ExtApiSyncer exists
        try:
            tree = ast.parse(content, filename=safe_filename)
        except SyntaxError as exc:
            spool.close()
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Uploaded script has a syntax error: {exc.msg} (line {exc.lineno}).",
            )

        has_syncer_class = any(
            isinstance(node, ast.ClassDef)
            and any(
                (isinstance(b, ast.Name) and b.id == "ExtApiSyncer")
                or (isinstance(b, ast.Attribute) and b.attr == "ExtApiSyncer")
                for b in node.bases
            )
            for node in ast.walk(tree)
        )
        if not has_syncer_class:
            spool.close()
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Script must define a class inheriting from ExtApiSyncer.",
            )

        file_path = f"{api_type_name}/{safe_filename}"
        size = len(content)

        minio_service.upload_file(
            bucket_name=CUSTOM_SYNCERS_BUCKET,
            object_name=file_path,
            data=spool,
            length=size,
            content_type="text/x-python",
        )
        spool.close()

        # Register in config_db
        db = TimeIODatabase()
        properties = {
            "script_bucket": CUSTOM_SYNCERS_BUCKET,
            "script_path": file_path,
        }
        db.upsert_ext_api_type(api_type_name, properties)

        return {
            "message": f"Syncer uploaded and registered for API type '{api_type_name}'",
            "api_type": api_type_name,
            "location": f"{CUSTOM_SYNCERS_BUCKET}/{file_path}",
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to upload syncer: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to upload syncer",
        )


# ========== Sensor External Config Management ==========


@router.get("/things/{thing_uuid}/config", response_model=Dict[str, Any])
def get_thing_external_config(
    thing_uuid: str, user: dict = Depends(deps.get_current_user)
):
    """Get external source configuration (API and/or SFTP) for a sensor."""
    db = TimeIODatabase()
    config = db.get_thing_external_config(thing_uuid)
    if not config:
        raise HTTPException(status_code=404, detail="Thing not found")
    return config


@router.put("/things/{thing_uuid}/external-api")
def update_thing_external_api(
    thing_uuid: str,
    config: ExternalAPIConfig,
    user: dict = Depends(deps.get_current_user),
):
    """Configure or update external API source on an existing sensor."""
    db = TimeIODatabase()

    # Verify the API type exists
    api_type = db.get_ext_api_type(config.type)
    if not api_type:
        raise HTTPException(status_code=400, detail=f"Unknown API type: {config.type}")

    # Encrypt sensitive settings
    encrypted_settings = dict(config.settings)
    for key in ("password", "api_key"):
        if key in encrypted_settings and encrypted_settings[key]:
            encrypted_settings[key] = encrypt_password(encrypted_settings[key])

    ext_api_data = {
        "type": config.type,
        "enabled": config.enabled,
        "sync_interval": config.sync_interval,
        "settings": encrypted_settings,
    }

    try:
        success = db.update_thing_external_api(thing_uuid, ext_api_data)
        if not success:
            raise HTTPException(status_code=404, detail="Thing not found")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Trigger re-sync to update cron jobs
    orchestrator = TimeIOOrchestrator()
    orchestrator.sync_sensor(thing_uuid)

    return {
        "message": f"External API configured for sensor {thing_uuid}",
        "type": config.type,
    }


@router.put("/things/{thing_uuid}/external-sftp")
def update_thing_external_sftp(
    thing_uuid: str,
    config: ExternalSFTPConfig,
    user: dict = Depends(deps.get_current_user),
):
    """Configure or update external SFTP source on an existing sensor."""
    db = TimeIODatabase()

    # Encrypt sensitive fields
    ext_sftp_data = {
        "uri": config.uri,
        "path": config.path,
        "username": config.username,
        "password": encrypt_password(config.password) if config.password else None,
        "private_key": encrypt_password(config.private_key)
        if config.private_key
        else "",
        "public_key": config.public_key,
        "sync_interval": config.sync_interval,
        "sync_enabled": config.sync_enabled,
    }

    try:
        success = db.update_thing_external_sftp(thing_uuid, ext_sftp_data)
        if not success:
            raise HTTPException(status_code=404, detail="Thing not found")
    except Exception as e:
        logger.error(f"Failed to update ext_sftp for {thing_uuid}: {e}", exc_info=True)
        raise HTTPException(
            status_code=500, detail="Failed to update SFTP configuration"
        )

    # Trigger re-sync to update cron jobs
    orchestrator = TimeIOOrchestrator()
    orchestrator.sync_sensor(thing_uuid)

    return {"message": f"External SFTP configured for sensor {thing_uuid}"}


@router.delete("/things/{thing_uuid}/external-api")
def remove_thing_external_api(
    thing_uuid: str, user: dict = Depends(deps.get_current_user)
):
    """Remove external API configuration from a sensor."""
    db = TimeIODatabase()
    success = db.remove_thing_external_api(thing_uuid)
    if not success:
        raise HTTPException(
            status_code=404, detail="Thing not found or no ext_api configured"
        )

    # Trigger re-sync
    orchestrator = TimeIOOrchestrator()
    orchestrator.sync_sensor(thing_uuid)

    return {"message": f"External API removed from sensor {thing_uuid}"}


@router.delete("/things/{thing_uuid}/external-sftp")
def remove_thing_external_sftp(
    thing_uuid: str, user: dict = Depends(deps.get_current_user)
):
    """Remove external SFTP configuration from a sensor."""
    db = TimeIODatabase()
    success = db.remove_thing_external_sftp(thing_uuid)
    if not success:
        raise HTTPException(
            status_code=404, detail="Thing not found or no ext_sftp configured"
        )

    # Trigger re-sync
    orchestrator = TimeIOOrchestrator()
    orchestrator.sync_sensor(thing_uuid)

    return {"message": f"External SFTP removed from sensor {thing_uuid}"}
