from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.api import deps
from app.core.exceptions import ResourceNotFoundException
from app.schemas.sms import CSVParserCreate, PaginatedResponse, ParserUpdate, SensorSMS
from app.services.sms_service import SMSService

router = APIRouter()


@router.get(
    "/sensors",
    response_model=PaginatedResponse,
    summary="List Sensors (Extended)",
    description="List all sensors with extended metadata (MQTT, Parser, etc.) across ALL projects.",
)
async def list_sensors_extended(
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    search: Optional[str] = Query(
        None, description="Search by name, UUID, project, or MQTT topic"
    ),
    ingest_type: Optional[str] = Query(
        None, description="Filter by ingest type (mqtt, sftp, extapi, extsftp)"
    ),
    user: dict = Depends(deps.get_current_user),
):
    """
    Fetch sensors with extended metadata, filtered by user's accessible projects.
    """
    result = await SMSService.get_all_sensors_extended(
        page=page,
        page_size=page_size,
        user=user,
        search=search,
        ingest_type=ingest_type,
    )

    return {
        "items": result["items"],
        "total": result["total"],
        "page": page,
        "page_size": page_size,
    }


@router.get(
    "/sensors/{uuid}",
    response_model=SensorSMS,
    summary="Get Sensor Details",
    description="Get full details for a single sensor by UUID (Project Agnostic).",
)
async def get_sensor_details(uuid: str):
    """
    Get sensor details.
    """
    result = await SMSService.get_sensor_details(uuid)
    if not result:
        raise ResourceNotFoundException(f"Sensor {uuid} not found")
    return result


@router.put(
    "/sensors/{uuid}",
    response_model=SensorSMS,
    summary="Update Sensor Details",
    description="Update sensor details (Name, Description, MQTT) in ConfigDB.",
)
async def update_sensor(
    uuid: str,
    update_data: Dict[str, Any],
    user: dict = Depends(deps.get_current_user),
):
    """
    Update sensor details.
    """
    result = await SMSService.update_sensor(uuid, update_data)
    if not result:
        raise ResourceNotFoundException(f"Sensor {uuid} not found")
    return result


@router.delete(
    "/sensors/{uuid}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete Sensor",
    description="Delete a sensor permanently from ConfigDB and optionally TimeIO source.",
)
async def delete_sensor(
    uuid: str,
    delete_from_source: bool = Query(False),
    user: dict = Depends(deps.get_current_user),
):
    """
    Delete a sensor.
    """
    success = await SMSService.delete_sensor(
        uuid, delete_from_source=delete_from_source
    )
    if not success:
        raise ResourceNotFoundException(
            f"Sensor {uuid} not found or could not be deleted"
        )
    return None


@router.get(
    "/attributes/device-types",
    summary="List MQTT Device Types",
    response_model=PaginatedResponse,
)
async def list_device_types(
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=500),
):
    """List all available MQTT device types."""
    result = SMSService.get_all_device_types(page=page, page_size=page_size)
    return {
        "items": result["items"],
        "total": result["total"],
        "page": page,
        "page_size": page_size,
    }


@router.get(
    "/attributes/device-types/{id}",
    summary="Get Device Type Details",
    response_model=Dict[str, Any],
)
async def get_device_type_details(id: str):
    """
    Get details of a specific MQTT device type, including parser code if available.
    """
    result = await SMSService.get_device_type_details(id)
    if not result:
        raise ResourceNotFoundException(f"Device Type {id} not found")
    return result


@router.delete("/attributes/device-types/{id}", status_code=204)
async def delete_device_type(
    id: str,
    user: dict = Depends(deps.get_current_user),
):
    """
    Delete a device type.
    """
    success = SMSService.delete_device_type(id)
    if not success:
        raise HTTPException(
            status_code=404, detail="Device type not found or could not be deleted"
        )
    return None


@router.get(
    "/attributes/parsers",
    summary="List Parsers",
    response_model=PaginatedResponse,
)
async def list_parsers(
    group_id: str = Query("default", description="Group ID context (optional for now)"),
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=500),
):
    """List all available parsers."""
    result = SMSService.get_all_parsers(
        group_id=group_id, page=page, page_size=page_size
    )
    return {
        "items": result["items"],
        "total": result["total"],
        "page": page,
        "page_size": page_size,
    }


@router.get(
    "/parsers/{uuid}",
    summary="Get Parser Details",
    description="Get details of a specific parser by UUID.",
)
async def get_parser(uuid: str):
    """Get parser details."""
    parser = SMSService.get_parser_details(uuid)
    if not parser:
        raise ResourceNotFoundException(f"Parser {uuid} not found")
    return parser


@router.put(
    "/parsers/{uuid}",
    summary="Update Parser",
    description="Update a parser's name or settings.",
)
async def update_parser(uuid: str, parser_update: ParserUpdate):
    """Update parser details."""
    updated = SMSService.update_parser(
        uuid, parser_update.model_dump(exclude_unset=True)
    )
    if not updated:
        raise ResourceNotFoundException(f"Parser {uuid} not found")
    return updated


@router.delete(
    "/parsers/{parser_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete Parser",
    description="Delete a parser. Fails if parser is assigned to sensors.",
)
async def delete_parser(
    parser_id: int,
    user: dict = Depends(deps.get_current_user),
):
    """Delete a parser by its integer ID. Checks for sensor linkage first."""
    result = SMSService.delete_parser(parser_id)
    if not result.get("success"):
        reason = result.get("reason", "Unknown error")
        linked = result.get("linked_sensors", [])
        if linked:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "message": reason,
                    "linked_sensors": linked,
                },
            )
        raise HTTPException(status_code=404, detail=reason)
    return None


@router.post(
    "/parsers/csv",
    summary="Create CSV Parser",
    description="Create a new CSV parser configuration.",
    status_code=status.HTTP_201_CREATED,
)
async def create_csv_parser(
    parser_in: CSVParserCreate,
    user: dict = Depends(deps.get_current_user),
):
    """
    Create a new CSV parser.
    """
    result = SMSService.create_csv_parser(
        name=parser_in.name,
        delimiter=parser_in.delimiter,
        timestamp_column=parser_in.timestamp_column,
        timestamp_format=parser_in.timestamp_format,
        header_line=parser_in.header_line,
        extra_params=parser_in.extra_params,
    )
    if not result:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create CSV parser",
        )
    return result


@router.get(
    "/attributes/ingest-types",
    summary="List Ingest Types",
    response_model=List[Dict[str, Any]],
)
async def list_ingest_types():
    """List all available ingest types."""
    return SMSService.get_all_ingest_types()
