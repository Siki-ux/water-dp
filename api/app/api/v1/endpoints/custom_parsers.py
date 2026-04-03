from fastapi import APIRouter, UploadFile, File, Form, HTTPException, status
import logging
from typing import Annotated, List, Dict, Any

from app.services.minio_service import minio_service
from app.services.timeio.timeio_db import TimeIODatabase

router = APIRouter()
logger = logging.getLogger(__name__)

CUSTOM_PARSERS_BUCKET = "custom-parsers"


@router.post("/upload", status_code=status.HTTP_201_CREATED)
async def upload_custom_parser(
    device_type_name: Annotated[str, Form()],
    file: Annotated[UploadFile, File()],
):
    """
    Upload a custom Python parser script for a specific MQTT device type.
    
    - Uploads the file to MinIO bucket 'custom-parsers'
    - Updates config_db.mqtt_device_type with script location
    - The system will dynamically load this script when processing data for this device type
    """
    if not file.filename.endswith(".py"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only Python (.py) files are allowed.",
        )

    try:
        # Ensure bucket exists
        if not minio_service.bucket_exists(CUSTOM_PARSERS_BUCKET):
            logger.info(f"Bucket {CUSTOM_PARSERS_BUCKET} not found, creating it.")
            minio_service.client.make_bucket(CUSTOM_PARSERS_BUCKET)

        # Upload file
        # We use a structured path: device_type_name/filename
        file_path = f"{device_type_name}/{file.filename}"
        
        # Read file content for upload
        content = await file.read()
        
        # Minimal validation: Check for MqttParser class (simple text check)
        # Proper validation should use AST but strict security checks might be complex.
        # For now, just a sanity check.
        if b"class" not in content or b"MqttParser" not in content:
             raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Script must define a class inheriting from MqttParser.",
            )

        # Reset cursor
        # file.seek(0) # upload_file expects bytes or stream. minio put_object expects stream or bytes.
        # minio_service.upload_file expects BinaryIO but puts data directly if we use client or specific method.
        # But minio_service.upload_file signature: (bucket, object, data, length). data is BinaryIO.
        # file.file is a SpooledTemporaryFile which is BinaryIO.
        
        # We need to get size.
        import io
        file_obj = io.BytesIO(content)
        size = len(content)

        minio_service.upload_file(
            bucket_name=CUSTOM_PARSERS_BUCKET,
            object_name=file_path,
            data=file_obj,
            length=size,
            content_type="text/x-python",
        )

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
        logger.error(f"Failed to upload parser: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to upload parser: {str(e)}",
        )


@router.get("/device-types", response_model=List[Dict[str, Any]])
def list_device_types():
    """
    List all available MQTT device types (both hardcoded and custom).
    """
    try:
        db = TimeIODatabase()
        types = db.get_all_mqtt_device_types()
        return types
    except Exception as e:
        logger.error(f"Failed to list device types: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list device types: {str(e)}",
        )
