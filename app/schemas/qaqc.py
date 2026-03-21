"""
QA/QC schemas for SaQC configuration management.
"""

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class QcStream(BaseModel):
    """Reference to a specific datastream used as input for a QC test."""

    arg_name: str = Field(..., description="SaQC function argument name for this stream")
    sta_thing_id: Optional[int] = Field(None, description="FROST/STA Thing ID")
    sta_stream_id: Optional[int] = Field(None, description="FROST/STA Datastream ID")
    alias: str = Field(..., description="Internal alias used within the QC function")


# --- QAQCTest schemas ---

class QAQCTestBase(BaseModel):
    function: str = Field(..., description="SaQC function name (e.g. 'flagRange')")
    name: Optional[str] = Field(None, description="Human-readable label for this test")
    position: Optional[int] = Field(None, description="Execution order (ascending)")
    args: Optional[Dict[str, Any]] = Field(None, description="Function keyword arguments")
    streams: Optional[List[QcStream]] = Field(
        None, description="Datastream references (for multi-stream functions)"
    )


class QAQCTestCreate(QAQCTestBase):
    pass


class QAQCTestUpdate(BaseModel):
    function: Optional[str] = None
    name: Optional[str] = None
    position: Optional[int] = None
    args: Optional[Dict[str, Any]] = None
    streams: Optional[List[QcStream]] = None


class QAQCTestResponse(QAQCTestBase):
    id: int
    qaqc_id: int

    model_config = {"from_attributes": True}


# --- QAQCConfig schemas ---

class QAQCConfigBase(BaseModel):
    name: str = Field(..., description="Config name (must be unique within a project)")
    context_window: str = Field(
        ...,
        description="Historical context to load before the processing window. "
                    "Either a duration string (e.g. '5d', '2h') or an integer (observation count).",
    )
    is_default: bool = Field(
        False,
        description="If true, this config runs automatically on every new data upload for the project",
    )


class QAQCConfigCreate(QAQCConfigBase):
    pass


class QAQCConfigUpdate(BaseModel):
    name: Optional[str] = None
    context_window: Optional[str] = None
    is_default: Optional[bool] = None


class QAQCConfigResponse(QAQCConfigBase):
    id: int
    tsm_project_id: Optional[int] = Field(None, description="TSM ConfigDB project ID (null for per-sensor configs)")
    tests: List[QAQCTestResponse] = Field(default_factory=list)

    model_config = {"from_attributes": True}


# --- Trigger schema ---

class QAQCTriggerRequest(BaseModel):
    qaqc_name: str = Field(..., description="Name of the QC config to run")
    start_date: datetime = Field(..., description="Start of the time range to process")
    end_date: datetime = Field(..., description="End of the time range to process")
