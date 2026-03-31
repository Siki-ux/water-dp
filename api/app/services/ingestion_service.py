import asyncio
import io
import logging
import os

from fastapi import UploadFile
from minio import Minio
from minio.error import S3Error

from app.core.config import settings
from app.core.exceptions import AppException, ResourceNotFoundException
from app.services.timeio.timeio_db import TimeIODatabase

logger = logging.getLogger(__name__)


class IngestionService:
    @staticmethod
    async def upload_csv(thing_uuid: str, file: UploadFile):
        """
        Upload a CSV file to the Thing's S3 bucket to trigger ingestion.
        """
        db = TimeIODatabase()

        # 1. Fetch S3 Config for this Thing
        s3_config = db.get_s3_config(thing_uuid)
        if not s3_config:
            raise ResourceNotFoundException(
                message="Thing not found or S3 not configured"
            )

        bucket = s3_config["bucket"]
        access_key = s3_config["user"]
        secret_key = s3_config["password"]

        # 2. Initialize MinIO Client
        # We use the internal MinIO Endpoint
        # Note: settings.OBJECT_STORAGE_HOST might be "localhost:9000" or internal "object-storage:9000"
        # Since we are in the API container, we should use the internal docker-compose name "object-storage" if configured,
        # or use what is in settings.
        # Let's check settings for MINIO/OBJECT_STORAGE config.
        # Assuming settings has keys. If not, we might need to rely on env vars or internal defaults.
        # Docker Compose says: object-storage ports 9000.

        try:
            client = Minio(
                settings.minio_url,
                access_key=access_key,
                secret_key=secret_key,
                secure=settings.minio_secure,
            )

            # 3. Determine file size without loading entirely into memory
            upload_stream = file.file
            upload_stream.seek(0, io.SEEK_END)
            file_size = upload_stream.tell()
            upload_stream.seek(0, io.SEEK_SET)

            max_upload_size = 256 * 1024 * 1024  # 256 MB
            if file_size > max_upload_size:
                raise AppException(message="Uploaded file is too large (max 256MB)")

            # 4. Upload — stream directly without reading into memory
            # Wrap synchronous MinIO put_object in a thread to avoid blocking the event loop
            # Sanitize filename to prevent path traversal in object keys
            object_name = (
                os.path.basename(file.filename) if file.filename else "upload.csv"
            )

            await asyncio.to_thread(
                client.put_object,
                bucket_name=bucket,
                object_name=object_name,
                data=upload_stream,
                length=file_size,
                content_type=file.content_type or "text/csv",
            )

            logger.info(
                f"Uploaded {object_name} to bucket {bucket} for thing {thing_uuid}"
            )
            return {"status": "success", "bucket": bucket, "file": object_name}

        except S3Error as e:
            logger.error(f"MinIO Error: {e}")
            raise AppException(message="S3 upload failed")
        except Exception as e:
            logger.error(f"Ingestion Error: {e}")
            raise AppException(message="Ingestion failed")
