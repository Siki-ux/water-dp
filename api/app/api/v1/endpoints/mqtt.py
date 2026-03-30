import logging

from fastapi import APIRouter, Depends, HTTPException, status

from app.api import deps
from app.schemas.sensor import MQTTPublishGeneric, MQTTPublishSensor
from app.services.timeio.mqtt_client import MQTTClient
from app.services.timeio.timeio_db import TimeIODatabase

logger = logging.getLogger(__name__)

router = APIRouter()
mqtt_client = MQTTClient()
timeio_db = TimeIODatabase()


@router.post(
    "/publish",
    status_code=status.HTTP_200_OK,
    summary="Publish MQTT Message (Generic)",
    description="Publish a generic MQTT message with explicit credentials.",
)
async def publish_generic(
    payload: MQTTPublishGeneric,
    user: dict = Depends(deps.get_current_active_superuser),
):
    """
    Publish a generic MQTT message.
    """
    success = mqtt_client.publish_message(
        topic=payload.topic,
        payload=payload.data,
        username=payload.username,
        password=payload.password,
    )

    if not success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to publish MQTT message",
        )

    return {"status": "success", "topic": payload.topic}


@router.post(
    "/things/{sensor_uuid}/publish",
    status_code=status.HTTP_200_OK,
    summary="Publish MQTT Message (Sensor-specific)",
    description="Publish an MQTT message for a specific sensor. Credentials are automatically retrieved from ConfigDB.",
)
async def publish_sensor(
    sensor_uuid: str,
    payload: MQTTPublishSensor,
    user: dict = Depends(deps.get_current_user),
):
    """
    Publish an MQTT message for a specific sensor.
    """
    # 1. Fetch credentials from ConfigDB
    configs = timeio_db.get_thing_configs_by_uuids([sensor_uuid])
    config = configs.get(sensor_uuid)

    if not config:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"MQTT credentials for sensor {sensor_uuid} not found",
        )

    mqtt_user = config.get("mqtt_user")
    mqtt_pass = config.get("mqtt_pass")

    # 2. Publish using observation format
    success = mqtt_client.publish_observation(
        mqtt_username=mqtt_user,
        mqtt_password=mqtt_pass,
        data=payload.data,
        topic_suffix=payload.topic_suffix,
    )

    if not success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to publish MQTT message",
        )

    return {
        "status": "success",
        "sensor_uuid": sensor_uuid,
        "mqtt_user": mqtt_user,
    }
