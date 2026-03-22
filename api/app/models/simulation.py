import uuid as uuid_lib

from sqlalchemy import Boolean, Column, DateTime, Integer
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.sql import func

from app.core.database import Base


class Simulation(Base):
    __tablename__ = "simulations"
    __table_args__ = {"schema": "water_dp"}

    # Use UUID type to match water_dp schema DDL
    id = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid_lib.uuid4, index=True
    )
    thing_uuid = Column(
        UUID(as_uuid=True), unique=True, index=True, nullable=False
    )  # Refers to TimeIO thing.uuid

    # Configuration: datastreams, patterns, limits
    # [ {name, pattern: "sine", min, max, period}, ... ]
    config = Column(JSONB, nullable=False)

    is_enabled = Column(Boolean, default=True, nullable=False)

    # Execution Tracking
    last_run = Column(DateTime(timezone=True), nullable=True)
    interval_seconds = Column(Integer, default=60, nullable=False)

    created_at = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
