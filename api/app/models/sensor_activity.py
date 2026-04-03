import uuid

from sqlalchemy import Boolean, Column, ForeignKey, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.types import DateTime

from app.core.database import Base
from app.models.base import BaseModel


class SensorActivityConfig(Base, BaseModel):
    """Per-sensor configuration for activity tracking.

    Created automatically when a sensor is registered or first encountered.
    Updated on each data_parsed MQTT event to record last_seen_at.
    """

    __tablename__ = "sensor_activity_configs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)

    # The TimeIO thing UUID this config belongs to
    thing_uuid = Column(UUID(as_uuid=True), nullable=False, unique=True, index=True)

    project_id = Column(
        UUID(as_uuid=True),
        ForeignKey("water_dp.projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Whether inactivity should be tracked and alerted for this sensor.
    # Default True for all types except sftp/extsftp (default False).
    track_activity = Column(Boolean, default=True, nullable=False)

    # Hours of silence before an inactivity alert is raised.
    inactivity_threshold_hours = Column(Integer, default=24, nullable=False)

    # Set to UTC now() on each data_parsed MQTT event. NULL = never seen.
    last_seen_at = Column(DateTime(timezone=True), nullable=True)
