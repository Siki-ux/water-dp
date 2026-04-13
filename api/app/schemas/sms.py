from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class UnitSMS(BaseModel):
    name: Optional[str] = None
    symbol: str
    definition: Optional[str] = None


class ObservedPropertySMS(BaseModel):
    name: str
    definition: Optional[str] = None
    description: Optional[str] = None


class DatastreamMetadata(BaseModel):
    id: int
    unit: Optional[UnitSMS] = None
    observed_property: Optional[ObservedPropertySMS] = None
    accuracy: Optional[float] = None
    resolution: Optional[float] = None
    measuring_range_min: Optional[float] = None
    measuring_range_max: Optional[float] = None
    aggregation_type: Optional[str] = None


class SensorSMS(BaseModel):
    uuid: str
    name: str
    description: Optional[str] = ""
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    properties: Optional[Dict[str, Any]] = None

    # Extended fields
    mqtt_username: Optional[str] = None
    mqtt_password: Optional[str] = None
    mqtt_topic: Optional[str] = None
    device_type_id: Optional[int] = None
    device_type: Optional[str] = None
    ingest_type_id: Optional[int] = None
    ingest_type: Optional[str] = None
    parser: Optional[str] = None
    parser_id: Optional[int] = None

    # S3 / File Ingestion
    s3_bucket: Optional[str] = None
    s3_user: Optional[str] = None
    s3_password: Optional[str] = None
    filename_pattern: Optional[str] = None

    # External API Source
    external_api: Optional[Dict[str, Any]] = None
    # External SFTP Source
    external_sftp: Optional[Dict[str, Any]] = None

    # Context
    project_name: Optional[str] = None
    schema_name: Optional[str] = None
    datastreams: Optional[List[Dict[str, Any]]] = None
    datastream_metadata: Optional[List[DatastreamMetadata]] = None


class PaginatedResponse(BaseModel):
    items: List[Any]
    total: int
    page: int
    page_size: int


class CSVParserCreate(BaseModel):
    name: str = Field(..., description="Name of the parser")
    delimiter: str = Field(",", description="CSV Delimiter")
    timestamp_column: int = Field(0, description="Index of timestamp column")
    timestamp_format: str = Field(
        "%Y-%m-%dT%H:%M:%S%z", description="Timestamp format string"
    )
    header_line: int = Field(0, description="Row index of header")
    extra_params: Optional[Dict[str, Any]] = None


class ParserUpdate(BaseModel):
    name: Optional[str] = None
    settings: Optional[Dict[str, Any]] = None
