"""
Dataset Service for managing file-based data ingestion.

Datasets are Things with ingest_type=sftp, designed for CSV file uploads.
"""

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.exceptions import ResourceNotFoundException
from app.models.user_context import Project, project_sensors
from app.services.minio_service import minio_service
from app.services.thing_service import ThingService
from app.services.timeio.orchestrator import TimeIOOrchestrator

logger = logging.getLogger(__name__)


class DatasetService:
    """Service for dataset (file-based Thing) operations."""

    orchestrator = TimeIOOrchestrator()

    @staticmethod
    def create_dataset(
        db: Session,
        project_id: UUID,
        name: str,
        description: Optional[str],
        parser_config: Dict[str, Any],
        filename_pattern: str,
        user: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Create a new dataset.

        Args:
            db: Database session
            project_id: Project to associate with
            name: Dataset name
            description: Optional description
            parser_config: CSV parser configuration
            filename_pattern: Glob pattern for file matching
            user: Current user dict

        Returns:
            Created dataset info including UUID and bucket name
        """
        # Get project
        project = db.query(Project).filter(Project.id == project_id).first()
        if not project:
            raise ResourceNotFoundException(f"Project {project_id} not found")

        # Get authorization group name for project
        project_group = project.name
        if project.authorization_provider_group_id:
            # Use group name if available
            from app.services.keycloak_service import KeycloakService

            try:
                group = KeycloakService.get_group(
                    project.authorization_provider_group_id
                )
                if group:
                    project_group = group.get("name", project.name)
            except Exception as e:
                logger.warning(f"Could not fetch group name: {e}")

        # Create dataset via orchestrator
        result = DatasetService.orchestrator.create_dataset(
            project_group=project_group,
            dataset_name=name,
            description=description or "",
            parser_config=parser_config,
            filename_pattern=filename_pattern,
            project_schema=project.schema_name,
        )

        # Link dataset to project using project_sensors table
        thing_uuid = (
            UUID(result["uuid"]) if isinstance(result["uuid"], str) else result["uuid"]
        )

        # Check if link already exists
        existing = db.execute(
            select(project_sensors.c.thing_uuid).where(
                project_sensors.c.project_id == project_id,
                project_sensors.c.thing_uuid == thing_uuid,
            )
        ).first()

        if not existing:
            stmt = project_sensors.insert().values(
                project_id=project_id,
                thing_uuid=thing_uuid,
                added_at=datetime.now(timezone.utc),
            )
            db.execute(stmt)
            db.commit()
            logger.info(f"Linked dataset {thing_uuid} to project {project_id}")

        return result

    @staticmethod
    def get_dataset(
        schema_name: str,
        dataset_uuid: str,
    ) -> Optional[Dict[str, Any]]:
        """
        Get dataset details by UUID.

        Args:
            schema_name: Database schema
            dataset_uuid: Dataset UUID

        Returns:
            Dataset details or None if not found
        """
        thing_service = ThingService(schema_name)
        thing = thing_service.get_thing(
            dataset_uuid, expand=["Locations", "Datastreams"]
        )

        if not thing:
            return None

        # Check if it's actually a dataset (not a sensor)
        properties = thing.properties or {}
        if properties.get("station_type") != "dataset":
            logger.warning(f"Thing {dataset_uuid} is not a dataset")
            return None

        return {
            "id": dataset_uuid,
            "name": thing.name,
            "description": thing.description,
            "properties": properties,
            "bucket_name": f"b-{dataset_uuid}",
            "schema_name": schema_name,
        }

    @staticmethod
    def list_datasets(
        db: Session,
        project_id: UUID,
    ) -> List[Dict[str, Any]]:
        """
        List all datasets for a project.

        Args:
            db: Database session
            project_id: Project UUID

        Returns:
            List of dataset info dicts
        """
        project = db.query(Project).filter(Project.id == project_id).first()
        if not project or not project.schema_name:
            return []

        # Get all linked sensors/datasets using project_sensors table
        stmt = select(project_sensors.c.thing_uuid).where(
            project_sensors.c.project_id == project_id
        )
        result = db.execute(stmt)
        thing_uuids = [row[0] for row in result]

        if not thing_uuids:
            return []

        thing_service = ThingService(project.schema_name)
        datasets = []

        for thing_uuid in thing_uuids:
            try:
                thing = thing_service.get_thing(str(thing_uuid), expand=[])
                if thing:
                    properties = thing.properties or {}
                    # Filter for datasets only
                    if (
                        properties.get("station_type") == "dataset"
                        or properties.get("type") == "static_dataset"
                    ):
                        datasets.append(
                            {
                                "id": str(thing_uuid),
                                "name": thing.name,
                                "description": thing.description,
                                "properties": properties,
                                "bucket_name": f"b-{thing_uuid}",
                                "schema_name": project.schema_name,
                                "status": "active",
                            }
                        )
            except Exception as e:
                logger.warning(f"Error fetching dataset {thing_uuid}: {e}")
                continue

        return datasets

    @staticmethod
    def get_upload_url(
        dataset_uuid: str,
        filename: str,
        expires: int = 3600,
    ) -> Dict[str, Any]:
        """
        Get a presigned URL for uploading a file to the dataset's bucket.

        Args:
            dataset_uuid: Dataset UUID
            filename: Name of the file to upload
            expires: URL expiration time in seconds

        Returns:
            Dict with upload_url, bucket_name, object_name, expires_in
        """
        bucket_name = f"b-{dataset_uuid}"

        # Check if bucket exists
        if not minio_service.bucket_exists(bucket_name):
            raise ValueError(
                f"Bucket {bucket_name} does not exist. Dataset may not be fully provisioned."
            )

        url = minio_service.get_presigned_upload_url(
            bucket_name=bucket_name,
            object_name=filename,
            expires=expires,
        )

        return {
            "upload_url": url,
            "bucket_name": bucket_name,
            "object_name": filename,
            "expires_in": expires,
        }

    @staticmethod
    def upload_file(
        dataset_uuid: str,
        filename: str,
        data: bytes,
        content_type: str = "text/csv",
    ) -> Dict[str, Any]:
        """
        Upload a file directly to the dataset's MinIO bucket.

        This triggers the file-ingest worker via MinIO event notifications.

        Args:
            dataset_uuid: Dataset UUID
            filename: Name of the file
            data: File contents as bytes
            content_type: MIME type

        Returns:
            Upload result with etag and version_id
        """
        import io

        bucket_name = f"b-{dataset_uuid}"

        if not minio_service.bucket_exists(bucket_name):
            raise ValueError(
                f"Bucket {bucket_name} does not exist. Dataset may not be fully provisioned."
            )

        result = minio_service.upload_file(
            bucket_name=bucket_name,
            object_name=filename,
            data=io.BytesIO(data),
            length=len(data),
            content_type=content_type,
        )

        logger.info(f"Uploaded {filename} to dataset {dataset_uuid}")

        return {
            "success": True,
            "message": "File uploaded successfully. Processing will begin shortly.",
            **result,
        }

    @staticmethod
    def list_files(
        dataset_uuid: str,
    ) -> Dict[str, Any]:
        """
        List files in a dataset's bucket.

        Args:
            dataset_uuid: Dataset UUID

        Returns:
            Dict with files list and count
        """
        bucket_name = f"b-{dataset_uuid}"

        if not minio_service.bucket_exists(bucket_name):
            return {
                "dataset_id": dataset_uuid,
                "bucket_name": bucket_name,
                "files": [],
                "total_count": 0,
            }

        files = minio_service.list_objects(bucket_name)

        return {
            "dataset_id": dataset_uuid,
            "bucket_name": bucket_name,
            "files": files,
            "total_count": len(files),
        }
