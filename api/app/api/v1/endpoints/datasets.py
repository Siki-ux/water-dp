"""
Dataset API endpoints for file-based data ingestion.

Datasets are Things with ingest_type=sftp for CSV file uploads.
"""

import logging
from typing import Any, List
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy.orm import Session

from app.api import deps
from app.core.database import get_db
from app.models.user_context import Project
from app.schemas.dataset import (
    DatasetCreate,
    DatasetFileList,
    DatasetResponse,
    DatasetUploadResponse,
    DatasetUploadUrlResponse,
)
from app.services.dataset_service import DatasetService
from app.services.project_service import ProjectService

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/", response_model=DatasetResponse, status_code=201)
async def create_dataset(
    dataset_in: DatasetCreate,
    database: Session = Depends(get_db),
    user: dict = Depends(deps.get_current_user),
) -> Any:
    """
    Create a new dataset for file-based data ingestion.

    A dataset is a Thing with ingest_type="sftp" that accepts CSV file uploads.
    Unlike sensors, datasets have no location and don't appear on the map.

    The parser configuration is assigned at creation time and will be used
    to parse all uploaded files. Datastreams are created automatically
    after the first file is processed.
    """
    # Check project access
    ProjectService._check_access(
        database, dataset_in.project_id, user, required_role="editor"
    )

    # Convert parser config to dict
    parser_config = {}
    if dataset_in.parser_config:
        parser_config = {
            "delimiter": dataset_in.parser_config.delimiter,
            "exclude_headlines": dataset_in.parser_config.exclude_headlines,
            "exclude_footlines": dataset_in.parser_config.exclude_footlines,
            "encoding": dataset_in.parser_config.encoding,
        }
        if dataset_in.parser_config.timestamp_columns:
            parser_config["timestamp_columns"] = [
                {"column": tc.column, "format": tc.format}
                for tc in dataset_in.parser_config.timestamp_columns
            ]

    try:
        result = DatasetService.create_dataset(
            db=database,
            project_id=dataset_in.project_id,
            name=dataset_in.name,
            description=dataset_in.description,
            parser_config=parser_config,
            filename_pattern=dataset_in.filename_pattern,
            user=user,
        )

        return DatasetResponse(
            id=result["uuid"],
            name=result["name"],
            description=dataset_in.description,
            bucket_name=result["bucket_name"],
            schema_name=result["schema"],
            parser_config=result.get("parser_config"),
            filename_pattern=result.get("filename_pattern", "*.csv"),
            status="active",
        )
    except TimeoutError as e:
        raise HTTPException(status_code=408, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to create dataset: {e}", exc_info=True)
        raise HTTPException(
            status_code=500, detail=f"Failed to create dataset: {str(e)}"
        )


@router.get("/project/{project_id}", response_model=List[DatasetResponse])
async def list_project_datasets(
    project_id: UUID,
    database: Session = Depends(get_db),
    user: dict = Depends(deps.get_current_user),
) -> Any:
    """
    List all datasets for a project.

    Returns only Things with station_type="dataset".
    """
    ProjectService._check_access(database, project_id, user, required_role="viewer")

    datasets = DatasetService.list_datasets(database, project_id)

    return [
        DatasetResponse(
            id=ds["id"],
            name=ds["name"],
            description=ds.get("description"),
            bucket_name=ds["bucket_name"],
            schema_name=ds["schema_name"],
            parser_config=ds.get("properties", {}).get("parser_config"),
            status=ds.get("status", "active"),
        )
        for ds in datasets
    ]


@router.get("/{dataset_id}", response_model=DatasetResponse)
async def get_dataset(
    dataset_id: str,
    project_id: UUID = Query(..., description="Project UUID for access check"),
    database: Session = Depends(get_db),
    user: dict = Depends(deps.get_current_user),
) -> Any:
    """
    Get dataset details by ID.
    """
    ProjectService._check_access(database, project_id, user, required_role="viewer")

    project = database.query(Project).filter(Project.id == project_id).first()
    if not project or not project.schema_name:
        raise HTTPException(
            status_code=404, detail="Project not found or has no schema"
        )

    dataset = DatasetService.get_dataset(project.schema_name, dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")

    return DatasetResponse(
        id=dataset["id"],
        name=dataset["name"],
        description=dataset.get("description"),
        bucket_name=dataset["bucket_name"],
        schema_name=dataset["schema_name"],
        parser_config=dataset.get("properties", {}).get("parser_config"),
        status="active",
    )


@router.get("/{dataset_id}/upload-url", response_model=DatasetUploadUrlResponse)
async def get_upload_url(
    dataset_id: str,
    filename: str = Query(..., description="Name of the file to upload"),
    expires: int = Query(3600, description="URL expiration time in seconds"),
    project_id: UUID = Query(..., description="Project UUID for access check"),
    database: Session = Depends(get_db),
    user: dict = Depends(deps.get_current_user),
) -> Any:
    """
    Get a presigned URL for direct file upload to the dataset's MinIO bucket.

    Use this URL for client-side uploads. The URL is valid for the specified
    expiration time (default 1 hour).
    """
    ProjectService._check_access(database, project_id, user, required_role="editor")

    try:
        result = DatasetService.get_upload_url(
            dataset_uuid=dataset_id,
            filename=filename,
            expires=expires,
        )
        return DatasetUploadUrlResponse(**result)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to get upload URL: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{dataset_id}/upload", response_model=DatasetUploadResponse)
async def upload_file(
    dataset_id: str,
    file: UploadFile = File(...),
    project_id: UUID = Query(..., description="Project UUID for access check"),
    database: Session = Depends(get_db),
    user: dict = Depends(deps.get_current_user),
) -> Any:
    """
    Upload a file to the dataset's MinIO bucket.

    This triggers the file-ingest worker which will:
    1. Parse the file using the dataset's parser configuration
    2. Create datastreams if they don't exist
    3. Insert observations into the database

    Progress can be monitored via the TSM Journal.
    """
    ProjectService._check_access(database, project_id, user, required_role="editor")

    # Read file content
    content = await file.read()

    if not content:
        raise HTTPException(status_code=400, detail="Empty file")

    # Check file size (max 256MB to match TSM limit)
    max_size = 256 * 1024 * 1024
    if len(content) > max_size:
        raise HTTPException(
            status_code=400, detail="File size exceeds maximum of 256MB"
        )

    # Determine content type
    content_type = file.content_type or "text/csv"
    if file.filename and file.filename.endswith(".csv"):
        content_type = "text/csv"

    try:
        result = DatasetService.upload_file(
            dataset_uuid=dataset_id,
            filename=file.filename or "upload.csv",
            data=content,
            content_type=content_type,
        )
        return DatasetUploadResponse(**result)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to upload file: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{dataset_id}/files", response_model=DatasetFileList)
async def list_files(
    dataset_id: str,
    project_id: UUID = Query(..., description="Project UUID for access check"),
    database: Session = Depends(get_db),
    user: dict = Depends(deps.get_current_user),
) -> Any:
    """
    List all files in the dataset's MinIO bucket.

    Returns file metadata including name, size, and last modified time.
    """
    ProjectService._check_access(database, project_id, user, required_role="viewer")

    try:
        result = DatasetService.list_files(dataset_id)
        return DatasetFileList(**result)
    except Exception as e:
        logger.error(f"Failed to list files: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{dataset_id}")
async def delete_dataset(
    dataset_id: str,
    project_id: UUID = Query(..., description="Project UUID for access check"),
    delete_from_source: bool = Query(False, description="Also delete from TimeIO"),
    database: Session = Depends(get_db),
    user: dict = Depends(deps.get_current_user),
) -> Any:
    """
    Delete a dataset.

    By default, only unlinks the dataset from the project.
    Set delete_from_source=true to also delete from TimeIO (permanent).
    """
    ProjectService._check_access(database, project_id, user, required_role="editor")

    # Use the existing sensor removal logic
    ProjectService.remove_sensor(
        database, project_id, dataset_id, user, delete_from_source=delete_from_source
    )

    return {"status": "deleted", "dataset_id": dataset_id}
