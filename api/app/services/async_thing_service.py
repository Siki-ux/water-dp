"""
Async Thing Service

Provides async access to FROST Things/Sensors via the async FROST client.
Wraps synchronous database calls with asyncio.to_thread() to prevent blocking.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Dict, List, Optional

from app.core.config import settings
from app.core.exceptions import ResourceNotFoundException
from app.schemas.frost.datastream import Datastream, Observation
from app.schemas.frost.thing import Location, Thing
from app.services.timeio.async_frost_client import (
    AsyncFrostClient,
    get_async_frost_client,
)
from app.services.timeio.timeio_db import TimeIODatabase

logger = logging.getLogger(__name__)


class AsyncThingService:
    """
    Async service for FROST Thing operations.

    Uses AsyncFrostClient for non-blocking HTTP calls and wraps
    synchronous database lookups with asyncio.to_thread().
    """

    def __init__(self, schema_name: str):
        self.schema_name = schema_name
        self._timeio_db = TimeIODatabase()
        self._frost_client: Optional[AsyncFrostClient] = None

    @property
    def frost_client(self) -> AsyncFrostClient:
        """Lazy-load the async FROST client."""
        if self._frost_client is None:
            self._frost_client = get_async_frost_client(
                base_url=settings.frost_url,
                project_name=self.schema_name,
                version=settings.frost_version,
                frost_server=settings.frost_server,
                timeout=settings.frost_timeout,
            )
        return self._frost_client

    # ─────────────────────────────────────────────────────────────────────
    # Async Database Wrappers (wraps sync psycopg2 calls)
    # ─────────────────────────────────────────────────────────────────────

    async def get_thing_id_from_uuid(self, sensor_uuid: str) -> Optional[str]:
        """Get Thing ID from UUID (async wrapper)."""
        return await asyncio.to_thread(
            self._timeio_db.get_thing_id_from_uuid, sensor_uuid
        )

    @staticmethod
    async def get_schema_from_uuid(sensor_uuid: str) -> Optional[str]:
        """Get schema name from Thing UUID (async wrapper)."""
        db = TimeIODatabase()
        return await asyncio.to_thread(db.get_schema_from_uuid, sensor_uuid)

    # ─────────────────────────────────────────────────────────────────────
    # Thing Operations
    # ─────────────────────────────────────────────────────────────────────

    async def get_thing(
        self, sensor_uuid: str, expand: List[str] = None
    ) -> Optional[Thing]:
        """
        Fetch a sensor with full details.

        Args:
            sensor_uuid: Thing UUID
            expand: FROST expand options (default: Locations, Datastreams)
        """
        if expand is None:
            expand = ["Locations", "Datastreams"]

        thing_id = await self.get_thing_id_from_uuid(sensor_uuid)
        if thing_id is None:
            raise ResourceNotFoundException("Thing not found")

        thing_data = await self.frost_client.get_thing(
            thing_id, expand=",".join(expand)
        )
        if not thing_data:
            return None

        return Thing.from_frost(thing_data)

    async def get_things(
        self,
        expand: List[str] = None,
        filter_expr: str = None,
        top: int = None,
        max_total: int = None,
    ) -> List[Thing]:
        """
        Fetch all sensors for this schema with optional filtering.
        Paginates via @iot.nextLink up to max_total items.
        """
        if expand is None:
            expand = ["Locations", "Datastreams"]
        if max_total is None:
            max_total = settings.max_sensors_per_project

        logger.info(
            f"Fetching things for {self.schema_name} with expand={expand}, filter={filter_expr}"
        )

        things_data = await self.frost_client.get_things(
            expand=",".join(expand), filter=filter_expr, top=top, max_total=max_total
        )

        logger.info(f"Fetched {len(things_data)} things for {self.schema_name}")

        if not things_data:
            return []

        return [Thing.from_frost(t) for t in things_data]

    async def get_things_paginated(
        self,
        expand: List[str] = None,
        filter: str = None,
        skip: int = 0,
        top: int = 20,
    ) -> Dict[str, Any]:
        """
        Fetch sensors with pagination.
        Returns: {"items": List[Thing], "total": int}
        """
        if expand is None:
            expand = ["Locations", "Datastreams"]

        data = await self.frost_client.get_things_paginated(
            expand=",".join(expand), filter=filter, skip=skip, top=top
        )

        things = [Thing.from_frost(t) for t in data.get("value", [])]
        total = data.get("@iot.count", 0)

        return {"items": things, "total": total}

    @staticmethod
    async def get_all_things(
        schema_name: str,
        expand: List[str] = None,
        filter: str = None,
        top: int = None,
    ) -> List[Thing]:
        """
        Static method to fetch all things for a given schema.
        """
        service = AsyncThingService(schema_name)
        return await service.get_things(expand=expand, filter_expr=filter, top=top)

    # ─────────────────────────────────────────────────────────────────────
    # Datastream Operations
    # ─────────────────────────────────────────────────────────────────────

    async def get_sensor_datastreams(self, sensor_uuid: str) -> List[Datastream]:
        """Get all datastreams for a sensor."""
        thing_id = await self.get_thing_id_from_uuid(sensor_uuid)
        if thing_id is None:
            raise ResourceNotFoundException("Thing not found")

        datastreams = await self.frost_client.list_datastreams(thing_id=thing_id)
        if not datastreams:
            return []

        return [Datastream.from_frost(ds) for ds in datastreams]

    async def get_sensor_datastream(
        self, sensor_uuid: str, datastream_name: str
    ) -> Optional[Datastream]:
        """Get a specific datastream for a sensor by name."""
        thing_id = await self.get_thing_id_from_uuid(sensor_uuid)
        if thing_id is None:
            raise ResourceNotFoundException("Thing not found")

        datastreams = await self.frost_client.list_datastreams(thing_id=thing_id)
        if not datastreams:
            return None

        for ds in datastreams:
            if ds.get("name") == datastream_name:
                return Datastream.from_frost(ds)

        return None

    async def update_datastream(
        self, sensor_uuid: str, datastream_name: str, payload: Dict[str, Any]
    ) -> bool:
        """Update a datastream details (Name, Desc, Units) in TimeIO DB."""
        datastream = await self.get_sensor_datastream(sensor_uuid, datastream_name)
        if not datastream:
            return False

        # Extract fields from payload (which might have camelCase from things.py preparation)
        name = payload.get("name")
        description = payload.get("description")
        uom = payload.get("unitOfMeasurement")  # things.py puts it here

        try:
            ds_id = int(datastream.datastream_id)
        except ValueError:
            logger.error(f"Invalid datastream ID: {datastream.datastream_id}")
            return False

        # We update directly in DB because FROST PATCH is not reliable/supported
        return await asyncio.to_thread(
            self._timeio_db.update_datastream_metadata,
            schema=self.schema_name,
            datastream_id=ds_id,
            name=name,
            description=description,
            unit_of_measurement=uom,
        )

    async def update_datastream_by_id(
        self, datastream_id: int, payload: Dict[str, Any]
    ) -> bool:
        """Update a datastream details (Name, Desc, Units) in TimeIO DB by ID."""
        # Extract fields from payload
        name = payload.get("name")
        description = payload.get("description")
        uom = payload.get("unitOfMeasurement")

        return await asyncio.to_thread(
            self._timeio_db.update_datastream_metadata,
            schema=self.schema_name,
            datastream_id=datastream_id,
            name=name,
            description=description,
            unit_of_measurement=uom,
        )

    # ─────────────────────────────────────────────────────────────────────
    # Observation Operations
    # ─────────────────────────────────────────────────────────────────────

    async def get_observations(
        self,
        datastream_id: Any,
        start_time: str = None,
        end_time: str = None,
        limit: int = 1000,
        order_by: str = "phenomenonTime desc",
        select: str = "phenomenonTime,result,resultTime",
    ) -> List[Observation]:
        """Get observations for a specific datastream ID."""
        observations = await self.frost_client.get_observations(
            datastream_id=datastream_id,
            start_time=start_time,
            end_time=end_time,
            limit=limit,
            order_by=order_by,
            select=select,
        )

        if not observations:
            return []

        return [Observation.from_frost(obs) for obs in observations]

    async def get_observations_by_name_from_sensor_uuid(
        self,
        sensor_uuid: str,
        datastream_name: str,
        start_time: str = None,
        end_time: str = None,
        limit: int = 1000,
        order_by: str = "phenomenonTime desc",
        select: str = "phenomenonTime,result,resultTime",
    ) -> List[Observation]:
        """
        Get observations for a specific datastream by name from a sensor.
        """
        datastreams = await self.get_sensor_datastreams(sensor_uuid)
        if not datastreams:
            return []

        for datastream in datastreams:
            if datastream.name == datastream_name:
                return await self.get_observations(
                    datastream_id=datastream.datastream_id,
                    start_time=start_time,
                    end_time=end_time,
                    limit=limit,
                    order_by=order_by,
                    select=select,
                )

        return []

    # ─────────────────────────────────────────────────────────────────────
    # Location Operations
    # ─────────────────────────────────────────────────────────────────────

    async def get_locations(self) -> List[Location]:
        """Get all locations for this schema."""
        locations = await self.frost_client.get_locations()
        if not locations:
            return []
        return [Location.from_frost(loc) for loc in locations]
