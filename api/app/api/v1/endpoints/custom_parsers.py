import logging
import os
import re
import tempfile
from typing import Annotated, Any, Dict, List

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status

from app.api import deps
from app.services.minio_service import minio_service
from app.services.timeio.timeio_db import TimeIODatabase

router = APIRouter()
logger = logging.getLogger(__name__)

CUSTOM_PARSERS_BUCKET = "custom-parsers"
_MAX_PARSER_SIZE = 1 * 1024 * 1024  # 1 MB
_SAFE_NAME_RE = re.compile(r"^[a-zA-Z0-9_\-]+$")


@router.post("/upload", status_code=status.HTTP_201_CREATED)
async def upload_custom_parser(
    device_type_name: Annotated[str, Form()],
    file: Annotated[UploadFile, File()],
    user: dict = Depends(deps.get_current_active_superuser),
):
    """Upload a custom parser script for an MQTT device type."""
    # Sanitize device_type_name to prevent object-key manipulation
    if not _SAFE_NAME_RE.match(device_type_name):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="device_type_name must contain only alphanumeric characters, hyphens, and underscores.",
        )

    safe_filename = os.path.basename(file.filename or "upload.py")
    if not safe_filename.endswith(".py"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only Python (.py) files are allowed.",
        )

    try:
        if not minio_service.bucket_exists(CUSTOM_PARSERS_BUCKET):
            logger.info(f"Bucket {CUSTOM_PARSERS_BUCKET} not found, creating it.")
            minio_service.client.make_bucket(CUSTOM_PARSERS_BUCKET)

        # Stream upload to a spooled temp file to avoid holding everything in memory
        spool = tempfile.SpooledTemporaryFile(max_size=_MAX_PARSER_SIZE)
        total = 0
        while chunk := await file.read(64 * 1024):
            total += len(chunk)
            if total > _MAX_PARSER_SIZE:
                spool.close()
                raise HTTPException(
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    detail=f"File exceeds maximum size of {_MAX_PARSER_SIZE} bytes.",
                )
            spool.write(chunk)

        spool.seek(0)
        content = spool.read()
        spool.seek(0)

        if b"class" not in content or b"MqttParser" not in content:
            spool.close()
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Script must define a class inheriting from MqttParser.",
            )

        file_path = f"{device_type_name}/{safe_filename}"
        size = len(content)

        minio_service.upload_file(
            bucket_name=CUSTOM_PARSERS_BUCKET,
            object_name=file_path,
            data=spool,
            length=size,
            content_type="text/x-python",
        )
        spool.close()

        # Update Database
        db = TimeIODatabase()
        properties = {
            "script_bucket": CUSTOM_PARSERS_BUCKET,
            "script_path": file_path,
        }
        db.upsert_mqtt_device_type(device_type_name, properties)

        return {
            "message": f"Parser uploaded and registered for device type '{device_type_name}'",
            "device_type": device_type_name,
            "location": f"{CUSTOM_PARSERS_BUCKET}/{file_path}",
        }

    except Exception as e:
        logger.error(f"Failed to upload parser: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to upload parser",
        )


@router.get("/device-types", response_model=List[Dict[str, Any]])
def list_device_types(user: dict = Depends(deps.get_current_user)):
    """List all available MQTT device types (both hardcoded and custom)."""
    try:
        db = TimeIODatabase()
        types = db.get_all_mqtt_device_types()
        return types
    except Exception as e:
        logger.error(f"Failed to list device types: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to list device types",
        )
