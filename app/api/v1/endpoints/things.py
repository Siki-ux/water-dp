import logging
import re
from typing import List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.api import deps
from app.api.deps import get_db
from app.core.exceptions import (
    ResourceNotFoundException,
)
from app.models.user_context import Project
from app.schemas.frost.datastream import Datastream, Observation, DatastreamUpdate
from app.schemas.frost.thing import Thing
from app.schemas.sensor import (
    IngestionResponse,
    SensorCreate,
    SensorCreationResponse,
)

# Use async service for non-blocking FROST calls
from app.services.async_thing_service import AsyncThingService
from app.services.keycloak_service import KeycloakService
from app.services.timeio.orchestrator import TimeIOOrchestrator

logger = logging.getLogger(__name__)


router = APIRouter()



orchestrator = TimeIOOrchestrator()


def _resolve_group_info(group_id: str) -> dict:
    """
    Resolve a Keycloak group ID to {name, schema_name}.
    Does NOT create any Project record.
    """
    group_data = KeycloakService.get_group(group_id)
    if not group_data:
        raise HTTPException(
            status_code=404,
            detail=f"Keycloak group '{group_id}' not found",
        )

    raw_name = group_data.get("name", group_id)

    # Strip prefix for display
    display_name = raw_name
    for prefix in ("UFZ-TSM:", "ufz-tsm:"):
        if display_name.startswith(prefix):
            display_name = display_name[len(prefix):]
            break

    # Resolve or derive schema name
    schema_name = KeycloakService.get_group_schema_name(group_id)
    if not schema_name:
        clean = display_name.lower().strip()
        clean = re.sub(r"[^a-z0-9_]", "_", clean)
        clean = re.sub(r"_+", "_", clean).strip("_")
        schema_name = f"user_{clean}"

        # Store on group for future lookups
        try:
            KeycloakService.set_group_attributes(
                group_id, {"schema_name": schema_name}
            )
        except Exception as e:
            logger.warning(f"Could not store schema on Keycloak group: {e}")

    return {
        "group_id": group_id,
        "name": display_name,
        "raw_name": raw_name,
        "schema_name": schema_name,
    }


@router.get(
    "/{schema_name}/all",
    response_model=List[Thing],
    summary="List Sensors",
    description="Returns all sensors for a project.",
)
async def list_sensors(
    schema_name: str, expand: list[str] = ["Locations", "Datastreams"]
):
    """
    Fetch all sensors for a project (async).
    """
    things = await AsyncThingService.get_all_things(schema_name, expand)

    if things is None:
        return []
    return things


@router.get(
    "/{sensor_uuid}",
    response_model=Thing,
    summary="Get Sensor Details",
    description="Fetch Sensor details from via FROST.",
)
async def get_thing_details(
    sensor_uuid: str, expand: list[str] = ["Locations", "Datastreams"]
):
    """
    Get Sensor details from via FROST (async).
    """
    schema_name = await AsyncThingService.get_schema_from_uuid(sensor_uuid)
    if schema_name is None:
        raise ResourceNotFoundException("Schema not found")
    thing_service = AsyncThingService(schema_name)
    thing = await thing_service.get_thing(sensor_uuid, expand)
    if not thing:
        raise ResourceNotFoundException("Thing not found")
    return thing


@router.post(
    "/",
    response_model=SensorCreationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create Sensor (Autonomous v3)",
    description="Registers a new sensor. Accepts either a Keycloak group_id (preferred) or a legacy project_uuid.",
)
async def create_sensor(
    sensor: SensorCreate,
    database: Session = Depends(get_db),
    user: dict = Depends(deps.get_current_user),
):
    """
    Create a new sensor autonomously (v3).

    Accepts either:
    - group_id: Keycloak group ID (preferred, Keycloak-centric)
    - project_uuid: Legacy project ID (backward-compatible)
    """
    try:
        location = None
        if sensor.latitude is not None and sensor.longitude is not None:
            location = {
                "type": "Point",
                "coordinates": [sensor.longitude, sensor.latitude],
            }

        # --- Resolve context ---
        project = None  # may remain None for group_id path

        if sensor.project_uuid:
            # Legacy path: lookup by project ID
            project = (
                database.query(Project)
                .filter(Project.id == sensor.project_uuid)
                .first()
            )
            if not project:
                raise HTTPException(status_code=404, detail="Project not found")
            if project.authorization_provider_group_id:
                try:
                    # Resolve clean name from group ID (strips prefix etc.)
                    group_info = _resolve_group_info(project.authorization_provider_group_id)
                    group_name = group_info["name"]
                except Exception:
                    group_name = project.name
            else:
                group_name = project.name
            schema_name = project.schema_name
        else:
            # Keycloak-centric path: resolve from group_id, no project needed
            group_info = _resolve_group_info(sensor.group_id)
            group_name = group_info["name"]
            schema_name = group_info["schema_name"]

            # If a project already exists for this group, use it for linking
            project = (
                database.query(Project)
                .filter(Project.authorization_provider_group_id == sensor.group_id)
                .first()
            )

        # --- Create sensor via orchestrator ---
        result = orchestrator.create_sensor(
            project_group=group_name,
            sensor_name=sensor.sensor_name,
            description=sensor.description,
            mqtt_device_type=sensor.device_type,
            geometry=location,
            properties=(
                [prop.dict() for prop in sensor.properties]
                if sensor.properties
                else None
            ),
            project_schema=schema_name,
            mqtt_username=sensor.mqtt_username,
            mqtt_password=sensor.mqtt_password,
            mqtt_topic=sensor.mqtt_topic,
            ingest_type=sensor.ingest_type,
            parser_id=sensor.parser_id,
            external_sftp=sensor.external_sftp.dict() if sensor.external_sftp else None,
            external_api=sensor.external_api.dict() if sensor.external_api else None,
        )

        # Back-fill schema on project + Keycloak group if project exists but had no schema
        resolved_schema = result.get("schema")
        if project and resolved_schema and not project.schema_name:
            project.schema_name = resolved_schema
            database.commit()
            logger.info(f"Back-filled schema_name '{resolved_schema}' on project {project.id}")
            if project.authorization_provider_group_id:
                try:
                    KeycloakService.set_group_attributes(
                        project.authorization_provider_group_id,
                        {"schema_name": resolved_schema},
                    )
                except Exception as e:
                    logger.warning(f"Could not back-fill schema on Keycloak group: {e}")

        # Link sensor to project (only if a project exists)
        if project:
            try:
                from app.services.project_service import ProjectService
                ProjectService.add_sensor(
                    database,
                    project_id=project.id,
                    thing_uuid=result["uuid"],
                    user=user,
                )
            except Exception as error:
                logger.warning(f"Failed to auto-link sensor to project: {error}")

        if location:
            result["latitude"] = location["coordinates"][1]
            result["longitude"] = location["coordinates"][0]

        # Ensure ID is string for Pydantic response model
        if result.get("id"):
            result["id"] = str(result["id"])

        return result
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create sensor: {str(error)}",
        )


@router.get(
    "/{sensor_uuid}/datastreams",
    response_model=List[Datastream],
    summary="Get Sensor Datastreams (FROST)",
    description="Get datastreams for a sensor via FROST.",
)
async def get_sensor_datastreams(
    sensor_uuid: str,
):
    """
    Get datastreams for a sensor via FROST (async).
    """
    schema_name = await AsyncThingService.get_schema_from_uuid(sensor_uuid)
    if schema_name is None:
        raise ResourceNotFoundException("Schema not found")
    thing_service = AsyncThingService(schema_name)
    datastreams = await thing_service.get_sensor_datastreams(sensor_uuid)
    if not datastreams:
        return []
    return datastreams


@router.post(
    "/{sensor_uuid}/datastreams",
    status_code=status.HTTP_201_CREATED,
    summary="Create Datastream",
    description="Create a new datastream for a sensor in the project database.",
)
async def create_sensor_datastream(
    sensor_uuid: str,
    payload: DatastreamUpdate,
):
    """
    Create a new datastream for a sensor.
    """
    from app.services.timeio.timeio_db import TimeIODatabase

    name = payload.name
    if not name:
        raise HTTPException(status_code=400, detail="Datastream name is required")

    db = TimeIODatabase()
    schema = db.get_thing_schema(sensor_uuid)
    if not schema:
        raise ResourceNotFoundException("Schema not found for sensor")

    # Build property dict
    unit_label = ""
    unit_symbol = ""
    unit_definition = ""
    if payload.unit_of_measurement:
        uom = payload.unit_of_measurement
        unit_label = uom.label or ""
        unit_symbol = uom.symbol or ""
        unit_definition = uom.definition or ""

    prop = {
        "name": name,
        "unit": unit_label or unit_symbol or "Unknown",
        "label": unit_label or name,
    }

    success = db.ensure_datastreams_in_project_db(schema, sensor_uuid, [prop])
    if not success:
        raise HTTPException(status_code=500, detail="Failed to create datastream")

    # Also register SMS metadata for unit display
    try:
        db.register_sensor_metadata(sensor_uuid, [prop])
    except Exception as e:
        logger.warning(f"Failed to register SMS metadata for new datastream: {e}")

    return {"name": name, "status": "created"}


@router.put(
    "/{sensor_uuid}/datastreams/id/{datastream_id}",
    response_model=bool,
    summary="Update Sensor Datastream by ID",
    description="Update a datastream's properties (name, units, description) using its ID.",
)
async def update_sensor_datastream_by_id(
    sensor_uuid: str,
    datastream_id: int,
    update: DatastreamUpdate,
):
    """
    Update a datastream by ID.
    """
    schema_name = await AsyncThingService.get_schema_from_uuid(sensor_uuid)
    if schema_name is None:
        raise ResourceNotFoundException("Schema not found")

    thing_service = AsyncThingService(schema_name)
    
    # Prepare payload -> convert snake_case to camelCase for FROST
    payload = {}
    if update.name:
        payload["name"] = update.name
    if update.description:
        payload["description"] = update.description
    if update.unit_of_measurement:
        uom = update.dict()["unit_of_measurement"]
        # Map 'label' to 'name' for FROST
        if "label" in uom:
            uom["name"] = uom.pop("label")
        payload["unitOfMeasurement"] = uom

    if not payload:
        return False

    success = await thing_service.update_datastream_by_id(datastream_id, payload)
    if not success:
         raise HTTPException(status_code=404, detail="Datastream not found or update failed")
    
    return True


@router.put(
    "/{sensor_uuid}/datastreams/{datastream_name:path}",
    response_model=bool,
    summary="Update Sensor Datastream",
    description="Update a datastream's properties (units, description).",
)
async def update_sensor_datastream(
    sensor_uuid: str,
    datastream_name: str,
    update: DatastreamUpdate,
):
    """
    Update a datastream.
    """
    schema_name = await AsyncThingService.get_schema_from_uuid(sensor_uuid)
    if schema_name is None:
        raise ResourceNotFoundException("Schema not found")

    thing_service = AsyncThingService(schema_name)
    
    # Prepare payload -> convert snake_case to camelCase for FROST
    payload = {}
    if update.name:
        payload["name"] = update.name
    if update.description:
        payload["description"] = update.description
    if update.unit_of_measurement:
        uom = update.dict()["unit_of_measurement"]
        # Map 'label' to 'name' for FROST
        if "label" in uom:
            uom["name"] = uom.pop("label")
        payload["unitOfMeasurement"] = uom

    if not payload:
        return False

    success = await thing_service.update_datastream(sensor_uuid, datastream_name, payload)
    if not success:
         raise HTTPException(status_code=404, detail="Datastream not found or update failed")
    
    return True


@router.get(
    "/{sensor_uuid}/datastreams/{datastream_name:path}",
    response_model=Datastream,
    summary="Get Sensor Datastream (FROST)",
    description="Get datastream for a sensor via FROST.",
)
async def get_sensor_datastream(
    sensor_uuid: str,
    datastream_name: str,
):
    """
    Get datastream for a sensor via FROST (async).
    """
    schema_name = await AsyncThingService.get_schema_from_uuid(sensor_uuid)
    if schema_name is None:
        raise ResourceNotFoundException("Schema not found")
    thing_service = AsyncThingService(schema_name)
    datastream = await thing_service.get_sensor_datastream(sensor_uuid, datastream_name)
    if not datastream:
        raise ResourceNotFoundException("Datastream not found")
    if not datastream:
        raise ResourceNotFoundException("Datastream not found")
    return datastream


@router.get(
    "/{sensor_uuid}/datastream/{datastream_name:path}/observations",
    response_model=List[Observation],
    summary="Get Sensor Data (FROST)",
    description="Get generic time-series data for a sensor via FROST. Optionally filter by datastream name.",
)
async def get_sensor_observations(
    sensor_uuid: str,
    datastream_name: str,
    limit: int = 100,
    start_time: str = None,
    end_time: str = None,
    order_by: str = "resultTime desc",
    select: str = "@iot.id,phenomenonTime,result,resultTime",
):
    """
    Get generic time-series data for a sensor via FROST (async).
    """
    schema_name = await AsyncThingService.get_schema_from_uuid(sensor_uuid)
    if schema_name is None:
        raise ResourceNotFoundException("Schema not found")
    thing_service = AsyncThingService(schema_name)
    observations = await thing_service.get_observations_by_name_from_sensor_uuid(
        sensor_uuid, datastream_name, start_time, end_time, limit, order_by, select
    )
    if not observations:
        return []
    return observations


@router.post(
    "/{uuid}/ingest/csv",
    response_model=IngestionResponse,
    summary="Ingest CSV Data",
    description="Upload a CSV file to the Thing's S3 bucket for ingestion.",
)
async def ingest_csv(
    uuid: str,
    file: UploadFile = File(...),
    database: Session = Depends(get_db),
    # user: dict = Depends(deps.get_current_user) # Optional auth check
):
    """
    Upload CSV for ingestion.
    """
    from app.services.ingestion_service import IngestionService

    return await IngestionService.upload_csv(uuid, file)
