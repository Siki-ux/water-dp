"""
MinIO Service for file storage operations.

Handles file uploads to MinIO buckets for dataset file ingestion.
"""

import logging
from datetime import timedelta
from typing import BinaryIO, List, Optional

from minio import Minio
from minio.error import S3Error

from app.core.config import settings

logger = logging.getLogger(__name__)


class MinioService:
    """Service for interacting with MinIO object storage."""

    def __init__(self):
        self.client = Minio(
            endpoint=settings.minio_url,
            access_key=settings.minio_access_key,
            secret_key=settings.minio_secret_key,
            secure=settings.minio_secure,
        )

    def bucket_exists(self, bucket_name: str) -> bool:
        """Check if a bucket exists."""
        try:
            return self.client.bucket_exists(bucket_name)
        except S3Error as e:
            if getattr(e, "code", None) == "NoSuchBucket":
                logger.info(f"Bucket does not exist: {bucket_name}")
                return False
            logger.error(f"Error checking bucket existence: {e}")
            raise

    def get_presigned_upload_url(
        self,
        bucket_name: str,
        object_name: str,
        expires: int = 3600,
    ) -> str:
        """
        Generate a presigned URL for uploading a file.

        Args:
            bucket_name: The bucket to upload to
            object_name: The object key/filename
            expires: URL expiration time in seconds (default 1 hour)

        Returns:
            Presigned URL for PUT request
        """
        try:
            url = self.client.presigned_put_object(
                bucket_name=bucket_name,
                object_name=object_name,
                expires=timedelta(seconds=expires),
            )
            logger.info(
                f"Generated presigned upload URL for {bucket_name}/{object_name}"
            )
            return url
        except S3Error as e:
            logger.error(f"Error generating presigned URL: {e}")
            raise

    def upload_file(
        self,
        bucket_name: str,
        object_name: str,
        data: BinaryIO,
        length: int,
        content_type: str = "application/octet-stream",
    ) -> dict:
        """
        Upload a file to MinIO bucket.

        This triggers the file-ingest worker via MinIO event notification.

        Args:
            bucket_name: Target bucket
            object_name: Object key/filename
            data: File data as binary stream
            length: Size of the data in bytes
            content_type: MIME type of the file

        Returns:
            Upload result with etag and version_id
        """
        try:
            result = self.client.put_object(
                bucket_name=bucket_name,
                object_name=object_name,
                data=data,
                length=length,
                content_type=content_type,
            )
            logger.info(
                f"Uploaded {object_name} to {bucket_name}, "
                f"etag: {result.etag}, version: {result.version_id}"
            )
            return {
                "bucket_name": bucket_name,
                "object_name": object_name,
                "etag": result.etag,
                "version_id": result.version_id,
            }
        except S3Error as e:
            logger.error(f"Error uploading file: {e}")
            raise

    def list_objects(
        self,
        bucket_name: str,
        prefix: Optional[str] = None,
        recursive: bool = True,
    ) -> List[dict]:
        """
        List objects in a bucket.

        Args:
            bucket_name: Bucket to list
            prefix: Filter by prefix (folder path)
            recursive: Include nested objects

        Returns:
            List of object metadata dicts
        """
        try:
            objects = self.client.list_objects(
                bucket_name=bucket_name,
                prefix=prefix,
                recursive=recursive,
            )
            result = []
            for obj in objects:
                result.append(
                    {
                        "name": obj.object_name,
                        "size": obj.size,
                        "last_modified": (
                            obj.last_modified.isoformat() if obj.last_modified else None
                        ),
                        "etag": obj.etag,
                        "is_dir": obj.is_dir,
                    }
                )
            return result
        except S3Error as e:
            logger.error(f"Error listing objects: {e}")
            raise

    def get_object_info(self, bucket_name: str, object_name: str) -> Optional[dict]:
        """Get metadata for a specific object."""
        try:
            stat = self.client.stat_object(bucket_name, object_name)
            return {
                "name": object_name,
                "size": stat.size,
                "last_modified": (
                    stat.last_modified.isoformat() if stat.last_modified else None
                ),
                "etag": stat.etag,
                "content_type": stat.content_type,
                "metadata": dict(stat.metadata) if stat.metadata else {},
            }
        except S3Error as e:
            if e.code == "NoSuchKey":
                return None
            logger.error(f"Error getting object info: {e}")
            raise

    def get_file_content(self, bucket_name: str, object_name: str) -> Optional[bytes]:
        """
        Get the content of a file from MinIO.
        """
        try:
            response = self.client.get_object(bucket_name, object_name)
            try:
                return response.read()
            finally:
                response.close()
                response.release_conn()
        except S3Error as e:
            if e.code == "NoSuchKey":
                return None
            logger.error(f"Error getting file content: {e}")
            raise

    def remove_file(self, bucket_name: str, object_name: str) -> None:
        """
        Remove a file from MinIO.
        """
        try:
            self.client.remove_object(bucket_name, object_name)
            logger.info(f"Removed {object_name} from {bucket_name}")
        except S3Error as e:
            logger.error(f"Error removing file: {e}")
            raise


# Lazy-initialized singleton — avoids import-time init when env vars
# may not yet be set (migrations, CLI scripts, tests).
_minio_service: MinioService | None = None


def get_minio_service() -> MinioService:
    """Return the lazily-created MinioService singleton."""
    global _minio_service
    if _minio_service is None:
        _minio_service = MinioService()
    return _minio_service


class _MinioServiceProxy:
    """Transparent proxy that defers MinioService creation to first use."""

    def __getattr__(self, name: str):
        return getattr(get_minio_service(), name)


minio_service: MinioService = _MinioServiceProxy()  # type: ignore[assignment]
