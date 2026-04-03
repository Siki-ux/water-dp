"""
Dataset schemas for Pydantic validation.

Datasets are Things with ingest_type=sftp for file-based data ingestion.
"""

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import UUID4, BaseModel, Field


class DatastreamDefinition(BaseModel):
    """Definition for a datastream (column) in the dataset."""

    name: str = Field(..., description="Datastream name (e.g., 'Temperature')")
    unit: str = Field(..., description="Unit of measurement (e.g., '°C')")
    description: Optional[str] = Field(None, description="Optional description")


class TimestampColumnConfig(BaseModel):
    """Configuration for timestamp column parsing."""

    column: int = Field(..., description="0-based column index")
    format: str = Field(
        default="%Y-%m-%d %H:%M:%S", description="Datetime format string"
    )


class CsvParserConfig(BaseModel):
    """CSV parser configuration matching TSM's csvparser settings."""

    delimiter: str = Field(default=",", description="Column delimiter")
    exclude_headlines: int = Field(
        default=0, description="Lines to skip at start (header rows)"
    )
    exclude_footlines: int = Field(default=0, description="Lines to skip at end")
    timestamp_columns: List[TimestampColumnConfig] = Field(
        default_factory=lambda: [
            TimestampColumnConfig(column=0, format="%Y-%m-%d %H:%M:%S")
        ],
        description="Timestamp column configuration",
    )
    encoding: str = Field(default="utf-8", description="File encoding")

    model_config = {
        "json_schema_extra": {
            "example": {
                "delimiter": ",",
                "exclude_headlines": 1,
                "exclude_footlines": 0,
                "timestamp_columns": [{"column": 0, "format": "%Y-%m-%dT%H:%M:%S.%fZ"}],
                "encoding": "utf-8",
            }
        }
    }


class DatasetCreate(BaseModel):
    """Request schema for creating a new dataset."""

    name: str = Field(..., min_length=1, max_length=255, description="Dataset name")
    description: Optional[str] = Field(None, description="Dataset description")
    project_id: UUID4 = Field(..., description="Project UUID to associate with")
    parser_config: CsvParserConfig = Field(
        default_factory=CsvParserConfig, description="CSV parser configuration"
    )
    filename_pattern: str = Field(
        default="*.csv", description="Glob pattern for matching uploaded files"
    )

    model_config = {
        "json_schema_extra": {
            "example": {
                "name": "River Flow Data 2024",
                "description": "Daily river flow measurements from CSV export",
                "project_id": "1bfde64c-a785-416a-a513-6be718055ce1",
                "parser_config": {
                    "delimiter": ",",
                    "exclude_headlines": 1,
                    "timestamp_columns": [{"column": 0, "format": "%Y-%m-%d %H:%M:%S"}],
                },
                "filename_pattern": "*.csv",
            }
        }
    }


class DatasetResponse(BaseModel):
    """Response schema for dataset operations."""

    id: str = Field(..., description="Dataset Thing UUID")
    name: str
    description: Optional[str] = None
    bucket_name: str = Field(..., description="MinIO bucket for file uploads")
    schema_name: str = Field(..., description="Database schema name")
    parser_config: Optional[Dict[str, Any]] = None
    filename_pattern: str = "*.csv"
    status: str = Field(default="active", description="Dataset status")
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class DatasetUploadResponse(BaseModel):
    """Response schema for file upload operations."""

    success: bool
    message: str
    bucket_name: str
    object_name: str
    etag: Optional[str] = None
    version_id: Optional[str] = None


class DatasetUploadUrlResponse(BaseModel):
    """Response schema for presigned upload URL."""

    upload_url: str = Field(..., description="Presigned URL for direct upload")
    bucket_name: str
    object_name: str
    expires_in: int = Field(..., description="Seconds until URL expires")


class DatasetFileList(BaseModel):
    """List of files in a dataset bucket."""

    dataset_id: str
    bucket_name: str
    files: List[Dict[str, Any]]
    total_count: int
