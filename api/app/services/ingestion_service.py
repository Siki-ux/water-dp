import asyncio
import io
import logging

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

        # 2. Initialize MinIO client using the configured endpoint and TLS setting.
        # `settings.minio_url` and `settings.minio_secure` define how the API
        # connects to object storage. Per-thing credentials from ConfigDB are
        # used instead of the global MinioService singleton because each thing's
        # bucket has its own access/secret key pair.

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
            from app.utils.storage import sanitize_object_name

            if file.filename:
                object_name = sanitize_object_name(file.filename)
            else:
                object_name = "upload.csv"

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
