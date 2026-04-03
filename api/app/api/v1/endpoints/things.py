import csv
import io
import json
import logging
import re
import uuid as uuid_pkg
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel as PydanticBaseModel
from sqlalchemy.orm import Session

from app.api import deps
from app.api.deps import get_db
from app.core.exceptions import (
    ResourceNotFoundException,
)
from app.models.sensor_activity import SensorActivityConfig
from app.models.user_context import Project
from app.schemas.frost.datastream import Datastream, DatastreamUpdate, Observation
from app.schemas.frost.thing import Thing
from app.schemas.sensor import (
    BulkSensorResponse,
    BulkSensorResult,
    ExternalAPIConfig,
    ExternalSFTPConfig,
    IngestionResponse,
    SensorCreate,
    SensorCreationResponse,
)

# Use async service for non-blocking FROST calls
from app.services.async_thing_service import AsyncThingService
from app.services.keycloak_service import KeycloakService
from app.services.timeio.orchestrator import TimeIOOrchestrator

# ---- Pydantic schemas for activity config endpoints ----


class ActivityConfigResponse(PydanticBaseModel):
    thing_uuid: str
    track_activity: bool
    inactivity_threshold_hours: int
    last_seen_at: Optional[datetime]

    model_config = {"from_attributes": True}


class ActivityConfigUpdate(PydanticBaseModel):
    track_activity: Optional[bool] = None
    inactivity_threshold_hours: Optional[int] = None


# ---- Ingest types that default to tracking OFF ----
_SFTP_INGEST_TYPES = {"sftp", "extsftp"}

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
            display_name = display_name[len(prefix) :]
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
            KeycloakService.set_group_attributes(group_id, {"schema_name": schema_name})
        except Exception as e:
            logger.warning(f"Could not store schema on Keycloak group: {e}")

    return {
        "group_id": group_id,
        "name": display_name,
        "raw_name": raw_name,
        "schema_name": schema_name,
    }


BULK_CSV_COLUMNS = [
    "sensor_name",
    "group_id",
    "description",
    "device_type",
    "latitude",
    "longitude",
    "ingest_type",
    "parser_id",
    "mqtt_username",
    "mqtt_password",
    "mqtt_topic",
    "ext_sftp_uri",
    "ext_sftp_path",
    "ext_sftp_username",
    "ext_sftp_password",
    "ext_sftp_sync_interval",
    "ext_api_type",
    "ext_api_sync_interval",
    "ext_api_settings",
]

BULK_CSV_EXAMPLE = {
    "sensor_name": "River A - gauge",
    "group_id": "<keycloak-group-uuid>",
    "description": "Water gauge at the bridge",
    "device_type": "chirpstack_generic",
    "latitude": "50.0755",
    "longitude": "14.4378",
    "ingest_type": "mqtt",
    "parser_id": "",
    "mqtt_username": "",
    "mqtt_password": "",
    "mqtt_topic": "",
    "ext_sftp_uri": "",
    "ext_sftp_path": "",
    "ext_sftp_username": "",
    "ext_sftp_password": "",
    "ext_sftp_sync_interval": "",
    "ext_api_type": "",
    "ext_api_sync_interval": "",
    "ext_api_settings": "",
}


def _row_to_sensor_create(row: Dict[str, str]) -> SensorCreate:
    """Convert a CSV row dict to a SensorCreate schema, coercing types and ignoring blank values."""

    def _float(v: str) -> Optional[float]:
        return float(v) if v.strip() else None

    def _int(v: str) -> Optional[int]:
        return int(v) if v.strip() else None

    external_sftp = None
    if row.get("ext_sftp_uri", "").strip():
        external_sftp = ExternalSFTPConfig(
            uri=row["ext_sftp_uri"],
            path=row.get("ext_sftp_path", ""),
            username=row.get("ext_sftp_username", ""),
            password=row.get("ext_sftp_password") or None,
            sync_interval=_int(row.get("ext_sftp_sync_interval", "")) or 60,
        )

    external_api = None
    if row.get("ext_api_type", "").strip():
        settings: Dict[str, Any] = {}
        raw_settings = row.get("ext_api_settings", "").strip()
        if raw_settings:
            try:
                settings = json.loads(raw_settings)
            except json.JSONDecodeError:
                pass
        external_api = ExternalAPIConfig(
            type=row["ext_api_type"],
            sync_interval=_int(row.get("ext_api_sync_interval", "")) or 60,
            settings=settings,
        )

    return SensorCreate(
        group_id=row.get("group_id", "").strip() or None,
        sensor_name=row["sensor_name"].strip(),
        description=row.get("description", "").strip(),
        device_type=row.get("device_type", "").strip() or "chirpstack_generic",
        latitude=_float(row.get("latitude", "")),
        longitude=_float(row.get("longitude", "")),
        ingest_type=row.get("ingest_type", "").strip() or "mqtt",
        parser_id=_int(row.get("parser_id", "")),
        mqtt_username=row.get("mqtt_username", "").strip() or None,
        mqtt_password=row.get("mqtt_password", "").strip() or None,
        mqtt_topic=row.get("mqtt_topic", "").strip() or None,
        external_sftp=external_sftp,
        external_api=external_api,
    )


async def _create_one_sensor(
    sensor: SensorCreate,
    database: Session,
    user: dict,
) -> dict:
    """Core sensor creation logic shared by single and bulk endpoints."""
    location = None
    if sensor.latitude is not None and sensor.longitude is not None:
        location = {
            "type": "Point",
            "coordinates": [sensor.longitude, sensor.latitude],
        }

    project = None

    if sensor.project_uuid:
        project = (
            database.query(Project).filter(Project.id == sensor.project_uuid).first()
        )
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        if project.authorization_provider_group_id:
            try:
                group_info = _resolve_group_info(
                    project.authorization_provider_group_id
                )
                group_name = group_info["name"]
            except Exception:
                group_name = project.name
        else:
            group_name = project.name
        schema_name = project.schema_name
    else:
        group_info = _resolve_group_info(sensor.group_id)
        group_name = group_info["name"]
        schema_name = group_info["schema_name"]

        project = (
            database.query(Project)
            .filter(Project.authorization_provider_group_id == sensor.group_id)
            .first()
        )

    result = orchestrator.create_sensor(
        project_group=group_name,
        sensor_name=sensor.sensor_name,
        description=sensor.description,
        mqtt_device_type=sensor.device_type,
        geometry=location,
        properties=(
            [prop.dict() for prop in sensor.properties] if sensor.properties else None
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

    resolved_schema = result.get("schema")
    if project and resolved_schema and not project.schema_name:
        project.schema_name = resolved_schema
        database.commit()
        if project.authorization_provider_group_id:
            try:
                KeycloakService.set_group_attributes(
                    project.authorization_provider_group_id,
                    {"schema_name": resolved_schema},
                )
            except Exception as e:
                logger.warning(f"Could not back-fill schema on Keycloak group: {e}")

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

    if result.get("id"):
        result["id"] = str(result["id"])

    if project:
        try:
            _ensure_activity_config(
                database,
                thing_uuid=result["uuid"],
                project_id=project.id,
                ingest_type=sensor.ingest_type,
            )
        except Exception as error:
            logger.warning(f"Failed to create activity config for sensor: {error}")

    return result


@router.get(
    "/bulk/template",
    summary="Download Bulk Import CSV Template",
    description="Returns a CSV template file for bulk sensor import.",
)
async def bulk_import_template(
    _user: dict = Depends(deps.get_current_user),
):
    header = ",".join(BULK_CSV_COLUMNS)
    example = ",".join(str(BULK_CSV_EXAMPLE.get(col, "")) for col in BULK_CSV_COLUMNS)
    content = f"{header}\n{example}\n"
    return StreamingResponse(
        io.BytesIO(content.encode("utf-8")),
        media_type="text/csv",
        headers={
            "Content-Disposition": 'attachment; filename="sensor_bulk_template.csv"'
        },
    )


@router.post(
    "/bulk",
    response_model=BulkSensorResponse,
    status_code=status.HTTP_200_OK,
    summary="Bulk Create Sensors from CSV",
    description="Upload a CSV file to create multiple sensors at once. Rows that fail are skipped; a summary is returned.",
)
async def bulk_create_sensors(
    file: UploadFile = File(...),
    database: Session = Depends(get_db),
    user: dict = Depends(deps.get_current_user),
):
    content = await file.read()
    try:
        text = content.decode("utf-8-sig")  # utf-8-sig strips BOM from Excel exports
    except UnicodeDecodeError:
        text = content.decode("latin-1")

    reader = csv.DictReader(io.StringIO(text))
    results: List[BulkSensorResult] = []

    for row_num, row in enumerate(reader, start=2):  # start=2: row 1 is header
        sensor_name = row.get("sensor_name", "").strip()
        if not sensor_name:
            results.append(
                BulkSensorResult(
                    row=row_num,
                    sensor_name="(blank)",
                    status="failed",
                    error="sensor_name is required",
                )
            )
            continue

        if not row.get("group_id", "").strip():
            results.append(
                BulkSensorResult(
                    row=row_num,
                    sensor_name=sensor_name,
                    status="failed",
                    error="group_id is required",
                )
            )
            continue

        try:
            sensor = _row_to_sensor_create(row)
            created = await _create_one_sensor(sensor, database, user)
            results.append(
                BulkSensorResult(
                    row=row_num,
                    sensor_name=sensor_name,
                    status="created",
                    uuid=created.get("uuid"),
                )
            )
        except Exception as exc:
            detail = str(exc)
            if hasattr(exc, "detail"):
                detail = exc.detail
            results.append(
                BulkSensorResult(
                    row=row_num,
                    sensor_name=sensor_name,
                    status="failed",
                    error=detail,
                )
            )

    created_count = sum(1 for r in results if r.status == "created")
    failed_count = sum(1 for r in results if r.status == "failed")
    return BulkSensorResponse(
        created=created_count, failed=failed_count, results=results
    )


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
        return await _create_one_sensor(sensor, database, user)
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
    if payload.unit_of_measurement:
        uom = payload.unit_of_measurement
        unit_label = uom.label or ""
        unit_symbol = uom.symbol or ""

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
        raise HTTPException(
            status_code=404, detail="Datastream not found or update failed"
        )

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

    success = await thing_service.update_datastream(
        sensor_uuid, datastream_name, payload
    )
    if not success:
        raise HTTPException(
            status_code=404, detail="Datastream not found or update failed"
        )

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


def _ensure_activity_config(
    db: Session,
    thing_uuid: str,
    project_id,
    ingest_type: str,
) -> SensorActivityConfig:
    """Create a SensorActivityConfig for a sensor if one doesn't already exist."""
    thing_uuid_obj = uuid_pkg.UUID(thing_uuid)
    existing = (
        db.query(SensorActivityConfig)
        .filter(SensorActivityConfig.thing_uuid == thing_uuid_obj)
        .first()
    )
    if existing:
        return existing
    config = SensorActivityConfig(
        thing_uuid=thing_uuid_obj,
        project_id=project_id,
        track_activity=ingest_type not in _SFTP_INGEST_TYPES,
        inactivity_threshold_hours=24,
        last_seen_at=None,
    )
    db.add(config)
    db.commit()
    db.refresh(config)
    return config


@router.get(
    "/{sensor_uuid}/activity-config",
    response_model=ActivityConfigResponse,
    summary="Get sensor activity config",
    description="Returns the activity tracking configuration for a sensor.",
)
def get_activity_config(
    sensor_uuid: str,
    database: Session = Depends(get_db),
):
    try:
        thing_uuid_obj = uuid_pkg.UUID(sensor_uuid)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid sensor UUID")

    config = (
        database.query(SensorActivityConfig)
        .filter(SensorActivityConfig.thing_uuid == thing_uuid_obj)
        .first()
    )
    if not config:
        # Auto-create with defaults (lazy init for existing sensors)
        from app.services.monitoring_service import MonitoringService

        ms = MonitoringService(database)
        config = ms._get_or_create_activity_config(sensor_uuid)
        if not config:
            raise HTTPException(
                status_code=404, detail="Sensor not found or project unknown"
            )

    return ActivityConfigResponse(
        thing_uuid=str(config.thing_uuid),
        track_activity=config.track_activity,
        inactivity_threshold_hours=config.inactivity_threshold_hours,
        last_seen_at=config.last_seen_at,
    )


@router.patch(
    "/{sensor_uuid}/activity-config",
    response_model=ActivityConfigResponse,
    summary="Update sensor activity config",
    description="Update activity tracking settings for a sensor (track_activity, inactivity_threshold_hours).",
)
def update_activity_config(
    sensor_uuid: str,
    update: ActivityConfigUpdate,
    database: Session = Depends(get_db),
):
    try:
        thing_uuid_obj = uuid_pkg.UUID(sensor_uuid)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid sensor UUID")

    config = (
        database.query(SensorActivityConfig)
        .filter(SensorActivityConfig.thing_uuid == thing_uuid_obj)
        .first()
    )
    if not config:
        from app.services.monitoring_service import MonitoringService

        ms = MonitoringService(database)
        config = ms._get_or_create_activity_config(sensor_uuid)
        if not config:
            raise HTTPException(
                status_code=404, detail="Sensor not found or project unknown"
            )

    if update.track_activity is not None:
        config.track_activity = update.track_activity
    if update.inactivity_threshold_hours is not None:
        if update.inactivity_threshold_hours < 1:
            raise HTTPException(
                status_code=400, detail="inactivity_threshold_hours must be at least 1"
            )
        config.inactivity_threshold_hours = update.inactivity_threshold_hours

    database.commit()
    database.refresh(config)

    return ActivityConfigResponse(
        thing_uuid=str(config.thing_uuid),
        track_activity=config.track_activity,
        inactivity_threshold_hours=config.inactivity_threshold_hours,
        last_seen_at=config.last_seen_at,
    )


@router.post(
    "/{thing_uuid}/observations/qaqc",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Store QA/QC quality flags",
    description="Called by tsm-orchestration after a SaQC run to persist result_quality flags on observations.",
)
async def store_qaqc_results(
    thing_uuid: str,
    payload: dict,
):
    """
    Accepts qaqc_labels from tsm-orchestration and updates result_quality on observations.

    Payload format:
        {"qaqc_labels": [{"datastream_id": int, "result_quality": {...}, "result_time": "ISO"}]}
    """
    import json

    import psycopg2
    from psycopg2 import sql as pgsql

    from app.core.config import settings

    labels = payload.get("qaqc_labels", [])
    if not labels:
        return

    schema_name = await AsyncThingService.get_schema_from_uuid(thing_uuid)
    if not schema_name:
        raise HTTPException(
            status_code=404, detail=f"Schema not found for thing {thing_uuid}"
        )

    try:
        conn = psycopg2.connect(
            host=settings.timeio_db_host,
            port=settings.timeio_db_port,
            dbname=settings.timeio_db_name,
            user=settings.timeio_db_user,
            password=settings.timeio_db_password,
        )
        schema_id = pgsql.Identifier(schema_name)
        updated = 0
        with conn:
            with conn.cursor() as cur:
                for label in labels:
                    ds_id = label.get("datastream_id")
                    rq = label.get("result_quality")
                    rt = label.get("result_time")
                    if ds_id is None or rq is None or rt is None:
                        continue
                    cur.execute(
                        pgsql.SQL(
                            "UPDATE {schema}.observation SET result_quality = %s "
                            "WHERE datastream_id = %s AND result_time = %s"
                        ).format(schema=schema_id),
                        (json.dumps(rq), ds_id, rt),
                    )
                    updated += cur.rowcount
        conn.close()
        logger.info(
            f"[qaqc] Updated result_quality on {updated} observations for thing {thing_uuid}"
        )
    except Exception as exc:
        logger.error(f"[qaqc] Failed to store QC results for {thing_uuid}: {exc}")
        raise HTTPException(status_code=500, detail=str(exc))
