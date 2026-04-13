"""
Sensor (Thing) schemas.
"""

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, model_validator


class ExternalSFTPConfig(BaseModel):
    uri: str = Field(..., description="SFTP server URI (e.g. sftp://host:22)")
    path: str = Field(..., description="Remote directory path to sync from")
    username: str = Field(..., description="SFTP username")
    password: Optional[str] = Field(
        None, description="SFTP password (plaintext, will be encrypted)"
    )
    public_key: str = Field("", description="SSH public key")
    private_key: str = Field(
        "", description="SSH private key (plaintext, will be encrypted)"
    )
    sync_interval: int = Field(60, description="Sync interval in minutes")
    sync_enabled: bool = Field(True, description="Whether sync is active")

    model_config = {
        "json_schema_extra": {
            "example": {
                "uri": "sftp://data.example.com:22",
                "path": "/data/sensors",
                "username": "sftpuser",
                "password": "secret",
                "sync_interval": 60,
                "sync_enabled": True,
            }
        }
    }


class ExternalAPIConfig(BaseModel):
    type: str = Field(
        ..., description="API type name (e.g. 'dwd', 'uba', or custom type)"
    )
    enabled: bool = Field(True, description="Whether sync is active")
    sync_interval: int = Field(60, description="Sync interval in minutes")
    settings: Dict[str, Any] = Field(
        default_factory=dict,
        description="API-type-specific settings (e.g. station_id, endpoint, credentials)",
    )

    model_config = {
        "json_schema_extra": {
            "example": {
                "type": "dwd",
                "enabled": True,
                "sync_interval": 60,
                "settings": {"station_id": "01766"},
            }
        }
    }


class SensorProperty(BaseModel):
    name: str = Field(..., description="Machine-readable name (e.g. 'temp')")
    unit: str = Field("Unknown", description="Unit of measurement (e.g. 'Celsius')")
    symbol: Optional[str] = Field(
        None, description="Short symbol for the property (e.g. '°C')"
    )
    label: Optional[str] = Field(
        None, description="Human-readable label (e.g. 'Air Temperature')"
    )


class SensorCreate(BaseModel):
    group_id: Optional[str] = Field(
        None,
        description="Keycloak group ID. The sensor will be created under this group's schema.",
        example="a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    )
    project_uuid: Optional[str] = Field(
        None,
        description="(Legacy) Project UUID. If provided, takes precedence over group_id.",
        example="1bfde64c-a785-416a-a513-6be718055ce1",
    )
    sensor_name: str = Field(
        ..., description="Name of the sensor/thing", example="Station 01"
    )
    description: str = Field("", example="Main monitoring station at the river")
    device_type: str = Field("chirpstack_generic", example="chirpstack_generic")
    latitude: Optional[float] = Field(None, example=51.34)
    longitude: Optional[float] = Field(None, example=12.37)
    properties: Optional[List[SensorProperty]] = Field(
        None, description="List of properties with units"
    )
    parser_id: Optional[int] = Field(
        None, description="ID of the CSV Parser to associate"
    )
    mqtt_username: Optional[str] = Field(None, description="Custom MQTT Username")
    mqtt_password: Optional[str] = Field(None, description="Custom MQTT Password")
    mqtt_topic: Optional[str] = Field(None, description="Custom MQTT Topic")
    ingest_type: str = Field(
        "mqtt", description="Ingest type (mqtt, sftp, extapi, extsftp)"
    )
    external_sftp: Optional[ExternalSFTPConfig] = Field(
        None, description="External SFTP source configuration"
    )
    external_api: Optional[ExternalAPIConfig] = Field(
        None, description="External API source configuration"
    )

    @model_validator(mode="after")
    def require_group_or_project(self):
        if not self.group_id and not self.project_uuid:
            raise ValueError("Either group_id or project_uuid is required.")
        return self

    model_config = {
        "json_schema_extra": {
            "example": {
                "group_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
                "sensor_name": "Station 01",
                "description": "Main monitoring station at the river",
                "device_type": "chirpstack_generic",
                "latitude": 51.34,
                "longitude": 12.37,
                "properties": [
                    {
                        "name": "temperature",
                        "unit": "Celsius",
                        "symbol": "°C",
                        "label": "Air Temperature",
                    },
                    {
                        "name": "humidity",
                        "unit": "Percent",
                        "symbol": "%",
                        "label": "Relative Humidity",
                    },
                ],
            }
        }
    }


class SensorLocationUpdate(BaseModel):
    project_schema: str = Field(
        ..., description="Project database schema (e.g. 'user_water_dp')"
    )
    latitude: float
    longitude: float


class DatastreamRich(BaseModel):
    name: str
    unit: str
    label: str
    properties: Optional[Dict[str, Any]] = None


class SensorRich(BaseModel):
    uuid: str
    name: str
    description: Optional[str] = ""
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    properties: Optional[Dict[str, Any]] = None
    datastreams: List[DatastreamRich]


class DataPoint(BaseModel):
    timestamp: Any
    value: Any
    datastream: Optional[str] = None
    unit: Optional[str] = None


class SensorCreationResponse(BaseModel):
    id: Optional[str] = Field(None, description="FROST Thing ID")
    uuid: str = Field(..., description="Thing UUID")
    name: str
    project_id: Optional[Any] = None
    schema_name: Optional[str] = Field(None, alias="schema")
    mqtt: Optional[Dict[str, Any]] = None
    config_ids: Optional[Any] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    properties: Optional[Any] = None
    external_sftp: Optional[Dict[str, Any]] = None
    external_api: Optional[Dict[str, Any]] = None


class BulkSensorResult(BaseModel):
    row: int
    sensor_name: str
    status: str  # "created" | "failed"
    uuid: Optional[str] = None
    error: Optional[str] = None


class BulkSensorResponse(BaseModel):
    created: int
    failed: int
    results: List[BulkSensorResult]


class IngestionResponse(BaseModel):
    status: str
    bucket: str
    file: str


class MQTTPublishGeneric(BaseModel):
    username: str = Field(..., description="MQTT Username")
    password: str = Field(..., description="MQTT Password")
    topic: str = Field(..., description="MQTT Topic")
    data: Dict[str, Any] = Field(..., description="Payload data (object)")

    model_config = {
        "json_schema_extra": {
            "example": {
                "username": "u_z9fxpvh2",
                "password": "my_secret_password",
                "topic": "mqtt_ingest/u_z9fxpvh2/data",
                "data": {
                    "time": "2026-02-17T22:15:27Z",
                    "object": {"temperature": 22.5, "humidity": 45.0},
                },
            }
        }
    }


class MQTTPublishSensor(BaseModel):
    data: Dict[str, Any] = Field(..., description="Payload data (object)")
    topic_suffix: Optional[str] = Field(
        "data", description="Topic suffix (e.g. 'data')"
    )

    model_config = {
        "json_schema_extra": {
            "example": {
                "data": {
                    "time": "2026-02-17T22:15:27Z",
                    "object": {"temperature": 22.5, "humidity": 45.0},
                },
                "topic_suffix": "data",
            }
        }
    }
