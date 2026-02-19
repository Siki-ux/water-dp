"""
Sensor (Thing) schemas.
"""

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class SensorProperty(BaseModel):
    name: str = Field(..., description="Machine-readable name (e.g. 'temp')")
    unit: str = Field("Unknown", description="Unit of measurement (e.g. 'Celsius')")
    label: Optional[str] = Field(
        None, description="Human-readable label (e.g. 'Air Temperature')"
    )


class SensorCreate(BaseModel):
    project_uuid: str = Field(
        ...,
        description="Project UUID from water_dp-api",
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
    ingest_type: str = Field("mqtt", description="Ingest type (mqtt, sftp, etc.)")

    model_config = {
        "json_schema_extra": {
            "example": {
                "project_uuid": "1bfde64c-a785-416a-a513-6be718055ce1",
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
    topic_suffix: Optional[str] = Field("data", description="Topic suffix (e.g. 'data')")

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
