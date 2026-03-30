"""
Async FROST Client
Async wrapper for OGC SensorThings API interactions using httpx.
"""

import logging
from typing import Any, Dict, List, Optional

import httpx

logger = logging.getLogger(__name__)


class AsyncFrostClient:
    """Async client for interacting with a specific Project's FROST endpoint."""

    def __init__(
        self,
        base_url: str,
        project_name: str,
        version: str,
        frost_server: str,
        timeout: int = 30,
    ):
        """
        Initialize async FROST client.

        Args:
            base_url: The root URL for the project's FROST instance (e.g. http://frost:8080)
            project_name: The name of the project schema (e.g. project_x)
            version: The version of the FROST API (e.g. v1.1)
            frost_server: The FROST server (e.g. sta)
            timeout: Request timeout in seconds
        """
        self.base_url = base_url.rstrip("/")
        self.project_name = project_name
        self.version = version
        self.frost_server = frost_server
        self.timeout = timeout
        self._client: Optional[httpx.AsyncClient] = None

    async def _get_client(self) -> httpx.AsyncClient:
        """Get or create the async HTTP client."""
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                timeout=httpx.Timeout(self.timeout),
                limits=httpx.Limits(max_connections=100, max_keepalive_connections=20),
            )
        return self._client

    def _url(self, path: str) -> str:
        return f"{self.base_url}/{self.project_name}/{self.version}/{path.lstrip('/')}"

    async def _request(self, method: str, path: str, params: Dict = None) -> Any:
        """Make an async HTTP request to FROST."""
        url = self._url(path)
        client = await self._get_client()
        try:
            logger.debug(f"FROST async request: {method} {url} with params {params}")
            resp = await client.request(method, url, params=params)
            logger.debug(f"FROST response: {resp.status_code}")

            if resp.status_code == 404:
                return None

            resp.raise_for_status()
            return resp.json()
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 404:
                return None
            logger.error(f"FROST request failed: {method} {url} - {e}")
            raise
        except Exception as e:
            logger.error(f"FROST request error: {method} {url} - {e}")
            raise

    async def _patch(self, path: str, payload: Dict[str, Any]) -> bool:
        """Make an async PATCH request."""
        url = self._url(path)
        client = await self._get_client()
        try:
            logger.debug(f"FROST async PATCH: {url} with payload {payload}")
            resp = await client.patch(url, json=payload)
            logger.debug(f"FROST response: {resp.status_code}")
            try:
                resp.raise_for_status()
            except httpx.HTTPStatusError as e:
                logger.error(f"FROST PATCH error body: {e.response.text}")
                raise e
            return True
        except Exception as e:
            logger.error(f"Failed to PATCH {url}: {e}")
            raise

    async def close(self):
        """Close the HTTP client."""
        if self._client and not self._client.is_closed:
            await self._client.aclose()
            self._client = None

    # ─────────────────────────────────────────────────────────────────────
    # FROST Entity Methods
    # ─────────────────────────────────────────────────────────────────────

    async def get_thing(self, thing_id: Any, expand: str = None) -> Optional[Dict]:
        """Get Thing details."""
        params = {"$expand": expand} if expand else None
        path = f"Things({thing_id})"
        return await self._request("GET", path, params=params)

    async def get_things(
        self, expand: str = None, filter: str = None, top: int = None
    ) -> List[Dict[str, Any]]:
        """Get all things with optional filtering and expansion."""
        path = "Things"
        params = {}
        if expand:
            params["$expand"] = expand
        if filter:
            params["$filter"] = filter
        if top:
            params["$top"] = top

        data = await self._request("GET", path, params=params)
        if not data:
            return []
        return data.get("value", [])

    async def get_things_paginated(
        self,
        expand: str = None,
        filter: str = None,
        skip: int = 0,
        top: int = 20,
    ) -> Dict[str, Any]:
        """
        Get things with pagination info.
        Returns: {"value": [...], "@iot.count": int}
        """
        path = "Things"
        params = {
            "$count": "true",
            "$skip": skip,
            "$top": top,
        }
        if expand:
            params["$expand"] = expand
        if filter:
            params["$filter"] = filter

        data = await self._request("GET", path, params=params)
        return data or {"value": [], "@iot.count": 0}

    async def update_thing(self, thing_id: Any, payload: Dict[str, Any]) -> bool:
        """Update Thing details via PATCH."""
        path = f"Things({thing_id})"
        return await self._patch(path, payload)

    async def list_datastreams(
        self, thing_id: Any, expand: str = "Thing"
    ) -> List[Dict]:
        """List Datastreams for a specific Thing."""
        path = f"Things({thing_id})/Datastreams"
        params = {"$expand": expand} if expand else None
        data = await self._request("GET", path, params=params)
        if not data:
            return []
        return data.get("value", [])

    async def get_datastream(
        self, datastream_id: Any, expand: str = "Thing"
    ) -> Optional[Dict]:
        """Get Datastream details."""
        path = f"Datastreams({datastream_id})"
        params = {"$expand": expand} if expand else None
        data = await self._request("GET", path, params=params)
        if not data:
            return None
        # Return the datastream directly, not from "value"
        return data if "@iot.id" in data else data.get("value", [])

    async def update_datastream(
        self, datastream_id: Any, payload: Dict[str, Any]
    ) -> bool:
        """Update Datastream details via PATCH."""
        path = f"Datastreams({datastream_id})"
        return await self._patch(path, payload)

    async def get_observations(
        self,
        datastream_id: Any,
        start_time: str = None,
        end_time: str = None,
        limit: int = 1000,
        order_by: str = "phenomenonTime desc",
        select: str = "phenomenonTime,result,resultTime",
    ) -> List[Dict]:
        """
        Get Observations for a Datastream.

        Args:
            datastream_id: ID of the Datastream
            start_time: ISO timestamp string
            end_time: ISO timestamp string
            limit: Max records
            order_by: Order by
            select: Select fields
        """
        path = f"Datastreams({datastream_id})/Observations"
        params = {
            "$top": limit,
            "$orderby": order_by,
            "$select": select,
        }

        # Time filter
        if start_time or end_time:
            criteria = []
            if start_time:
                criteria.append(f"resultTime ge {start_time}")
            if end_time:
                criteria.append(f"resultTime le {end_time}")

            if criteria:
                params["$filter"] = " and ".join(criteria)

        data = await self._request("GET", path, params=params)
        if not data:
            return []

        return data.get("value", [])

    async def get_locations(self, expand: str = None) -> List[Dict[str, Any]]:
        """Get all locations."""
        path = "Locations"
        params = {"$expand": expand} if expand else None
        data = await self._request("GET", path, params=params)
        if not data:
            return []
        return data.get("value", [])


# ─────────────────────────────────────────────────────────────────────────────
# Client Factory / Cache
# ─────────────────────────────────────────────────────────────────────────────

# Module-level cache for clients (per project)
_async_frost_clients: Dict[str, AsyncFrostClient] = {}


def get_async_frost_client(
    base_url: str,
    project_name: str,
    version: str,
    frost_server: str,
    timeout: int = 30,
) -> AsyncFrostClient:
    """
    Returns a cached instance of AsyncFrostClient.
    Creates new client if not cached.
    """
    cache_key = f"{base_url}|{project_name}|{version}"

    if cache_key not in _async_frost_clients:
        logger.info(f"Creating new AsyncFrostClient for {project_name} at {base_url}")
        _async_frost_clients[cache_key] = AsyncFrostClient(
            base_url=base_url,
            project_name=project_name,
            version=version,
            frost_server=frost_server,
            timeout=timeout,
        )

    return _async_frost_clients[cache_key]
