import logging
import os
import sys
import time

import requests

# Allow importing from app/ (same pattern as seed_water_dp.py)
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Configure Logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("water-dp-seed")

# Configuration
API_URL = os.getenv("API_URL", "http://water-dp-api:8000/api/v1")
# Use admin-siki/admin-siki by default as requested
USERNAME = os.getenv("ADMIN_USERNAME", "admin-siki")
PASSWORD = os.getenv("ADMIN_PASSWORD", "admin-siki")

# Czech Republic Locations (Lakes/Rivers)
LOCATIONS_CZECH = [
    {"name": "Lipno Dam", "lat": 48.6333, "lon": 14.1667},
    {"name": "Orlik Dam", "lat": 49.6105, "lon": 14.1698},
    {"name": "Slapy Dam", "lat": 49.8219, "lon": 14.4286},
    {"name": "Vranov Dam", "lat": 48.9056, "lon": 15.8118},
    {"name": "Nove Mlyny - Upper", "lat": 48.8964, "lon": 16.6340},
    {"name": "Nove Mlyny - Middle", "lat": 48.8779, "lon": 16.6661},
    {"name": "Nove Mlyny - Lower", "lat": 48.8601, "lon": 16.7121},
    {"name": "Lake Macha", "lat": 50.5636, "lon": 14.6625},
    {"name": "Rozkos Dam", "lat": 50.3708, "lon": 16.0594},
    {"name": "Hracholusky Dam", "lat": 49.7915, "lon": 13.1784},
    {"name": "Sec Dam", "lat": 49.8327, "lon": 15.6516},
    {"name": "River Elbe - Melnik", "lat": 50.3541, "lon": 14.4743},
    {"name": "River Vltava - Prague", "lat": 50.0755, "lon": 14.4378},
    {"name": "River Morava - Olomouc", "lat": 49.5938, "lon": 17.2509},
    {"name": "River Odra - Ostrava", "lat": 49.8209, "lon": 18.2625},
]

# Morava River Locations
LOCATIONS_MORAVA = [
    {
        "name": "Morava - Trojmedzie SK/CZ/AT",
        "lat": 48.61678679157393,
        "lon": 16.940155043648446,
    },
    {
        "name": "Morava - Pohraničie so SK",
        "lat": 48.8782835118391,
        "lon": 17.202200887542453,
    },
    {
        "name": "Morava - Uherské Hradiště",
        "lat": 49.073066418801204,
        "lon": 17.458410026447893,
    },
    {"name": "Morava - Olomouc", "lat": 49.597293659473586, "lon": 17.267434853226355},
    {
        "name": "Morava - Hanušovice, Branná",
        "lat": 50.07668057933876,
        "lon": 16.93454987969328,
    },
    {"name": "Morava - Prameň", "lat": 50.20514843813213, "lon": 16.849219008675586},
    {
        "name": "Morava - Moravičanské jezero",
        "lat": 49.77603658549506,
        "lon": 16.968263374073388,
    },
    {"name": "Morava - Kroměříž ", "lat": 49.30344147051559, "lon": 17.39851656181459},
]

# --------------------------------------------------------------------------
# External Source test sensors
# --------------------------------------------------------------------------

# Custom MQTT parser script (uploaded as custom device type during seeding)
CUSTOM_WATER_LEVEL_PARSER_CODE = '''\
"""
Custom Water Level Parser
Parses JSON payloads from a simple water-level sensor.

Expected payload format:
    {
        "timestamp": "2026-01-15T10:30:00Z",
        "water_level_m": 3.42,
        "temperature_c": 12.5,
        "battery_v": 3.8
    }
"""
from datetime import datetime
from timeio.parser.mqtt_parser import MqttParser, Observation


class WaterLevelParser(MqttParser):
    def do_parse(self, rawdata, origin="", **kwargs):
        timestamp = rawdata.get("timestamp", datetime.utcnow().isoformat())
        observations = []
        position = 0
        for key, value in rawdata.items():
            if key == "timestamp":
                continue
            try:
                observations.append(
                    Observation(
                        timestamp=timestamp,
                        value=float(value),
                        position=position,
                        origin=origin,
                        header=key,
                    )
                )
                position += 1
            except (ValueError, TypeError):
                continue
        return observations
'''

# Open-Meteo syncer script (uploaded as custom API type)
OPEN_METEO_SYNCER_CODE = '''\
"""
Open-Meteo Weather API Syncer
Fetches hourly weather data for a station defined by latitude/longitude.
"""
import json
import requests
from datetime import datetime


class OpenMeteoSyncer(ExtApiSyncer):
    BASE_URL = "https://api.open-meteo.com/v1/forecast"

    def fetch_api_data(self, thing, content):
        settings = thing.ext_api.settings
        dt_from = datetime.strptime(content["datetime_from"], "%Y-%m-%d %H:%M:%S")
        dt_to = datetime.strptime(content["datetime_to"], "%Y-%m-%d %H:%M:%S")
        hourly_params = settings.get(
            "parameters",
            "temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation"
        )
        params = {
            "latitude": settings["latitude"],
            "longitude": settings["longitude"],
            "hourly": hourly_params,
            "start_date": dt_from.strftime("%Y-%m-%d"),
            "end_date": dt_to.strftime("%Y-%m-%d"),
            "timezone": "UTC",
        }
        response = requests.get(self.BASE_URL, params=params, timeout=(10, 60))
        response.raise_for_status()
        return {
            "data": response.json(),
            "latitude": settings["latitude"],
            "longitude": settings["longitude"],
        }

    def do_parse(self, api_response):
        data = api_response["data"]
        hourly = data.get("hourly", {})
        timestamps = hourly.get("time", [])
        source_meta = {
            "latitude": api_response["latitude"],
            "longitude": api_response["longitude"],
        }
        bodies = []
        param_names = [k for k in hourly.keys() if k != "time"]
        for i, timestamp in enumerate(timestamps):
            for param in param_names:
                values = hourly[param]
                if i < len(values) and values[i] is not None:
                    body = {
                        "result_time": timestamp,
                        "result_type": 0,
                        "result_number": float(values[i]),
                        "datastream_pos": param,
                        "parameters": json.dumps({
                            "origin": "open_meteo",
                            "column_header": source_meta,
                        }),
                    }
                    bodies.append(body)
        return {"observations": bodies}
'''

EXTERNAL_SOURCES_SENSORS = [
    {
        "name": "Berlin Weather (Open-Meteo API)",
        "description": "Hourly weather data from Open-Meteo free API for Berlin, Germany. "
        "Uses custom uploaded syncer script.",
        "lat": 52.52,
        "lon": 13.41,
        "ingest_type": "extapi",
        "device_type": "chirpstack_generic",
        "external_api": {
            "type": "open_meteo",
            "enabled": True,
            "sync_interval": 60,
            "settings": {
                "latitude": 52.52,
                "longitude": 13.41,
                "parameters": "temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation",
            },
        },
        "properties": [
            {"name": "temperature_2m", "unit": "°C", "label": "Temperature 2m"},
            {"name": "relative_humidity_2m", "unit": "%", "label": "Relative Humidity"},
            {"name": "wind_speed_10m", "unit": "km/h", "label": "Wind Speed 10m"},
            {"name": "precipitation", "unit": "mm", "label": "Precipitation"},
        ],
    },
    {
        "name": "Prague Weather (DWD/BrightSky)",
        "description": "Weather data for Prague-Libus via built-in DWD syncer (BrightSky API).",
        "lat": 50.0755,
        "lon": 14.4378,
        "ingest_type": "extapi",
        "device_type": "chirpstack_generic",
        "external_api": {
            "type": "dwd",
            "enabled": True,
            "sync_interval": 60,
            "settings": {
                "station_id": "01766",
            },
        },
        "properties": [
            {"name": "temperature", "unit": "°C", "label": "Temperature"},
            {"name": "wind_speed", "unit": "km/h", "label": "Wind Speed"},
            {"name": "precipitation", "unit": "mm", "label": "Precipitation"},
        ],
    },
    {
        "name": "Local Water Quality SFTP",
        "description": "Demo sensor pulling CSV water quality data from the local test SFTP server. "
        "Data is parsed with a CSV parser to extract pH, dissolved oxygen, temperature, "
        "and conductivity measurements.",
        "lat": 51.3397,
        "lon": 12.3731,
        "ingest_type": "extsftp",
        "device_type": "chirpstack_generic",
        "external_sftp": {
            "uri": "sftp://test-sftp-server:22",
            "path": "/data",
            "username": "testuser",
            "password": "testpass",
            "public_key": "",
            "private_key": "",
            "sync_interval": 2,
            "sync_enabled": True,
        },
        "properties": [
            {"name": "pH", "unit": "pH", "label": "pH"},
            {
                "name": "dissolved_oxygen_mg_l",
                "unit": "mg/L",
                "label": "Dissolved Oxygen",
            },
            {"name": "temperature_c", "unit": "°C", "label": "Water Temperature"},
            {"name": "conductivity_us_cm", "unit": "µS/cm", "label": "Conductivity"},
        ],
        "needs_parser": True,
    },
]

PROJECTS_CONFIG = [
    {
        "target_group_name": "UFZ-TSM:CzechHydro",
        "project_name": "Czech Water Analysis",
        "description": "Monitoring water quality in major Czech bodies of water.",
        "locations": LOCATIONS_CZECH,
        # creator becomes automatic owner; other members are added explicitly
        "creator": {"username": "alice", "password": "alice"},
        "members": [
            {"username": "carol", "role": "editor"},
            {"username": "dave", "role": "viewer"},
        ],
    },
    {
        "target_group_name": "UFZ-TSM:CzechHydro",
        "project_name": "Morava River Monitoring",
        "description": "Hydrological monitoring along the Morava river.",
        "locations": LOCATIONS_MORAVA,
        "creator": {"username": "bob", "password": "bob"},
        "members": [
            {"username": "grace", "role": "editor"},
        ],
    },
]

# The external source sensors will be added to this project/group
EXTERNAL_SOURCES_PROJECT = {
    "target_group_name": "UFZ-TSM:ExternalSources",
    "project_name": "External Sources Testing",
    "description": "Test sensors for external API and external SFTP data ingestion.",
    "creator": {"username": "eva", "password": "eva"},
    "members": [
        {"username": "dave", "role": "editor"},
        {"username": "bob", "role": "editor"},
    ],
}


def get_access_token(username=None, password=None, retries=10):
    """Authenticate as a given user (defaults to admin-siki), retrying to handle propagation delays."""
    username = username or USERNAME
    password = password or PASSWORD
    url = f"{API_URL}/auth/login"
    payload = {"username": username, "password": password}
    for attempt in range(retries):
        try:
            logging.info(
                f"Authenticating as {username} at {url} (attempt {attempt+1}/{retries})..."
            )
            response = requests.post(url, json=payload, timeout=10)
            if response.status_code == 200:
                return response.json()["access_token"]
            logger.warning(
                f"Auth attempt {attempt+1} failed ({response.status_code}): {response.text}"
            )
        except Exception as e:
            logger.warning(f"Auth attempt {attempt+1} error: {e}")
        time.sleep(5)
    logger.error(f"Could not authenticate as {username} after {retries} attempts.")
    sys.exit(1)


def get_headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def refresh_headers(headers):
    """Re-authenticate and update headers in-place with a fresh token."""
    logger.info("Token expired, re-authenticating...")
    token = get_access_token()
    headers["Authorization"] = f"Bearer {token}"


def wait_for_api():
    base_url = API_URL.replace("/api/v1", "").rstrip("/")
    health_url = f"{base_url}/health"

    logger.info(f"Waiting for API at {health_url}...")
    for _ in range(30):
        try:
            if requests.get(health_url, timeout=5).status_code == 200:
                logger.info("API is Up.")
                return
        except Exception:
            pass
        time.sleep(2)
    logger.warning("API unreachable, but proceeding anyway.")


def get_group_id_by_name(headers, name):
    try:
        res = requests.get(f"{API_URL}/groups", headers=headers)
        if res.status_code == 200:
            groups = res.json()
            for g in groups:
                if g.get("name") == name or g.get("path") == name:
                    logger.info(f"Found group '{name}' with ID: {g['id']}")
                    return g["id"]

            logger.warning(f"Group '{name}' not found in {len(groups)} groups.")
    except Exception as e:
        logger.error(f"Error fetching groups: {e}")

    return None


def seed_project_members(headers, project_id, members):
    """Add explicit project members after project creation. Idempotent."""
    for m in members:
        res = requests.post(
            f"{API_URL}/projects/{project_id}/members",
            headers=headers,
            json={"username": m["username"], "role": m["role"]},
        )
        if res.status_code in (200, 201):
            logger.info(
                f"  Added {m['username']} as {m['role']} to project {project_id}"
            )
        elif res.status_code == 409:
            logger.info(f"  {m['username']} already a member (skipped)")
        else:
            logger.warning(
                f"  Failed to add {m['username']}: {res.status_code} {res.text[:120]}"
            )


def create_project(headers, group_id, project_name, description):
    project_payload = {
        "name": project_name,
        "description": description,
        "authorization_provider_group_id": group_id,
    }

    # Try finding existing first to avoid duplicates
    try:
        res = requests.get(f"{API_URL}/projects", headers=headers)
        if res.status_code == 200:
            for p in res.json():
                if p["name"] == project_payload["name"]:
                    logger.info(f"Project '{project_payload['name']}' already exists.")
                    return p["id"]
    except Exception:
        pass

    try:
        logger.info(f"Creating project '{project_payload['name']}'...")
        res = requests.post(
            f"{API_URL}/projects", headers=headers, json=project_payload
        )
        if res.status_code in [200, 201]:
            pid = res.json()["id"]
            logger.info(f"Project created with ID: {pid}")
            return pid
        else:
            logger.error(f"Failed to create project: {res.text}")
            return None
    except Exception as e:
        logger.error(f"Failed to create project: {e}")
        return None


def create_simulated_sensor(headers, project_id, location_info, index):
    name = f"{location_info['name']} Sensor"

    payload = {
        "thing": {
            "project_uuid": project_id,
            "sensor_name": name,
            "description": f"Monitoring station at {location_info['name']}",
            "device_type": "chirpstack_generic",
            "latitude": location_info["lat"],
            "longitude": location_info["lon"],
            "properties": [
                {"name": "water_level", "unit": "m", "label": "Water Level"},
                {"name": "temperature", "unit": "°C", "label": "Temperature"},
            ],
        },
        "simulation": {
            "enabled": True,
            "datastreams": [
                {
                    "name": "water_level",
                    "range": {"min": 0, "max": 5},
                    "interval": "60s",
                    "type": "random",
                    "enabled": True,
                },
                {
                    "name": "temperature",
                    "range": {"min": 0, "max": 30},
                    "interval": "300s",
                    "type": "sine",
                    "enabled": True,
                },
            ],
        },
    }

    max_retries = 3
    for attempt in range(max_retries):
        try:
            res = requests.post(
                f"{API_URL}/projects/{project_id}/simulator/things",
                headers=headers,
                json=payload,
            )
            if res.status_code in [200, 201]:
                logger.info(f"Created sensor: {name}")
                return
            elif res.status_code == 409:
                logger.info(f"Sensor {name} likely already exists.")
                return
            elif res.status_code == 401:
                refresh_headers(headers)
                # don't count 401 as a retry attempt, just redo immediately
                continue
            else:
                logger.warning(
                    f"Attempt {attempt + 1}/{max_retries} failed for {name}: {res.status_code} - {res.text}"
                )
                if attempt < max_retries - 1:
                    time.sleep(5)
        except Exception as e:
            logger.error(
                f"Error on attempt {attempt + 1}/{max_retries} for {name}: {e}"
            )
            if attempt < max_retries - 1:
                time.sleep(5)

    logger.error(f"Failed to create sensor {name} after {max_retries} attempts.")


def register_custom_device_type(headers):
    """Upload the custom water-level parser as a custom device type."""
    logger.info("Registering 'water_level_generic' device type with parser script...")

    # Check if it already exists
    try:
        res = requests.get(
            f"{API_URL}/sms/attributes/device-types",
            headers=headers,
        )
        if res.status_code == 200:
            items = res.json().get("items", [])
            for dt in items:
                if dt.get("name") == "water_level_generic":
                    logger.info("Device type 'water_level_generic' already exists.")
                    return True
    except Exception:
        pass

    # Upload the parser script
    try:
        blob = CUSTOM_WATER_LEVEL_PARSER_CODE.encode("utf-8")
        files = {"file": ("water_level_generic.py", blob, "text/x-python")}
        data = {"device_type_name": "water_level_generic"}
        upload_headers = {"Authorization": headers["Authorization"]}

        res = requests.post(
            f"{API_URL}/custom-parsers/upload",
            headers=upload_headers,
            files=files,
            data=data,
        )
        if res.status_code in [200, 201]:
            logger.info("Registered 'water_level_generic' device type with parser script.")
            return True
        else:
            logger.warning(
                f"Failed to upload parser: {res.status_code} - {res.text}"
            )
            return False
    except Exception as e:
        logger.error(f"Error registering device type: {e}")
        return False


def register_open_meteo_api_type(headers):
    """Upload the Open-Meteo syncer script as a custom API type."""
    logger.info("Registering 'open_meteo' API type with syncer script...")

    # Check if it already exists
    try:
        res = requests.get(
            f"{API_URL}/external-sources/api-types/open_meteo",
            headers=headers,
        )
        if res.status_code == 200:
            logger.info("API type 'open_meteo' already exists.")
            return True
    except Exception:
        pass

    # Upload the syncer script
    try:
        blob = OPEN_METEO_SYNCER_CODE.encode("utf-8")
        files = {"file": ("open_meteo.py", blob, "text/x-python")}
        data = {"api_type_name": "open_meteo"}
        upload_headers = {"Authorization": headers["Authorization"]}

        res = requests.post(
            f"{API_URL}/external-sources/api-types/upload",
            headers=upload_headers,
            files=files,
            data=data,
        )
        if res.status_code in [200, 201]:
            logger.info("Registered 'open_meteo' API type with syncer script.")
            return True
        else:
            logger.warning(f"Failed to upload syncer: {res.status_code} - {res.text}")
            # Fall back to creating type without script
            res2 = requests.post(
                f"{API_URL}/external-sources/api-types?name=open_meteo",
                headers=headers,
            )
            if res2.status_code in [200, 201]:
                logger.info("Created 'open_meteo' API type (without syncer script).")
                return True
            logger.error(f"Failed to create API type: {res2.status_code} - {res2.text}")
            return False
    except Exception as e:
        logger.error(f"Error registering API type: {e}")
        return False


def create_csv_parser(
    headers,
    name,
    delimiter=",",
    timestamp_column=0,
    timestamp_format="%Y-%m-%d %H:%M:%S",
    header_line=0,
):
    """Create a CSV parser via the SMS API and return its ID."""
    payload = {
        "name": name,
        "delimiter": delimiter,
        "timestamp_column": timestamp_column,
        "timestamp_format": timestamp_format,
        "header_line": header_line,
    }
    try:
        res = requests.post(f"{API_URL}/sms/parsers/csv", headers=headers, json=payload)
        if res.status_code in [200, 201]:
            result = res.json()
            logger.info(f"Created CSV parser '{name}' (id={result.get('id')})")
            return result.get("id")
        elif res.status_code == 409:
            logger.info(f"Parser '{name}' already exists.")
            return None
        else:
            logger.error(
                f"Failed to create parser '{name}': {res.status_code} - {res.text}"
            )
            return None
    except Exception as e:
        logger.error(f"Error creating CSV parser '{name}': {e}")
        return None


def create_external_source_sensor(headers, project_id, sensor_config):
    """Create a sensor with external API or external SFTP configuration."""
    name = sensor_config["name"]
    logger.info(f"Creating external source sensor: {name}...")

    payload = {
        "project_uuid": project_id,
        "sensor_name": name,
        "description": sensor_config["description"],
        "device_type": sensor_config["device_type"],
        "latitude": sensor_config["lat"],
        "longitude": sensor_config["lon"],
        "ingest_type": sensor_config["ingest_type"],
        "properties": sensor_config.get("properties", []),
    }

    if "external_api" in sensor_config:
        payload["external_api"] = sensor_config["external_api"]
    if "external_sftp" in sensor_config:
        payload["external_sftp"] = sensor_config["external_sftp"]
    if sensor_config.get("parser_id"):
        payload["parser_id"] = sensor_config["parser_id"]

    max_retries = 3
    for attempt in range(max_retries):
        try:
            res = requests.post(
                f"{API_URL}/things/",
                headers=headers,
                json=payload,
            )
            if res.status_code in [200, 201]:
                result = res.json()
                logger.info(
                    f"Created external source sensor: {name} "
                    f"(uuid={result.get('thing_uuid', 'N/A')})"
                )
                return True
            elif res.status_code == 409:
                logger.info(f"Sensor '{name}' likely already exists.")
                return True
            elif res.status_code == 401:
                refresh_headers(headers)
                continue
            else:
                logger.warning(
                    f"Attempt {attempt + 1}/{max_retries} for '{name}': "
                    f"{res.status_code} - {res.text}"
                )
                if attempt < max_retries - 1:
                    time.sleep(5)
        except Exception as e:
            logger.error(
                f"Error on attempt {attempt + 1}/{max_retries} for '{name}': {e}"
            )
            if attempt < max_retries - 1:
                time.sleep(5)

    logger.error(f"Failed to create sensor '{name}' after {max_retries} attempts.")
    return False


def seed_external_sources(headers, admin_headers=None):
    """Set up the External Sources Testing project with ext_api and ext_sftp sensors."""
    logger.info("=" * 60)
    logger.info("Setting up External Sources test sensors...")
    logger.info("=" * 60)

    cfg = EXTERNAL_SOURCES_PROJECT
    # Use admin_headers for group lookup if provided (creator may only see their subgroup)
    lookup_headers = admin_headers if admin_headers else headers
    group_id = get_group_id_by_name(lookup_headers, cfg["target_group_name"])
    if not group_id:
        logger.error(
            f"Could not find group '{cfg['target_group_name']}'. Skipping external sources."
        )
        return

    project_id = create_project(
        headers, group_id, cfg["project_name"], cfg["description"]
    )
    if not project_id:
        logger.error("Could not create/find external sources project. Skipping.")
        return

    if cfg.get("members"):
        seed_project_members(headers, project_id, cfg["members"])

    # Step 1: Register custom types (requires realm admin)
    register_custom_device_type(admin_headers if admin_headers else headers)
    register_open_meteo_api_type(admin_headers if admin_headers else headers)

    # Step 2: Create CSV parser for SFTP sensor
    parser_id = create_csv_parser(
        headers,
        "Water Quality CSV",
        delimiter=",",
        timestamp_column=0,
        timestamp_format="%Y-%m-%d %H:%M:%S",
        header_line=0,
    )

    # Give TSM a moment to process
    logger.info("Waiting 5s for TSM orchestration...")
    time.sleep(5)

    # Step 3: Create the external source sensors
    for sensor_cfg in EXTERNAL_SOURCES_SENSORS:
        if sensor_cfg.get("needs_parser") and parser_id:
            sensor_cfg["parser_id"] = parser_id
        create_external_source_sensor(headers, project_id, sensor_cfg)
        time.sleep(3)  # Small delay between sensor creations for TSM processing

    logger.info("External Sources setup complete.")


def main():
    logger.info("Starting Water DP Seed Script...")
    wait_for_api()

    # --- Seed Keycloak users and groups first ---
    from seed_keycloak import seed_keycloak_users_and_groups

    seed_keycloak_users_and_groups()

    # admin-siki token — used for QA/QC seeding and as fallback
    try:
        admin_token = get_access_token()
        admin_headers = get_headers(admin_token)
    except Exception:
        logger.error("Could not authenticate as admin-siki. API is likely offline.")
        return

    # --- Simulated MQTT sensors ---
    for config in PROJECTS_CONFIG:
        target_group_name = config["target_group_name"]
        logger.info(
            f"Processing project: {config['project_name']} for group: {target_group_name}"
        )

        # Use the project creator's token so they become the explicit owner
        creator = config.get("creator", {})
        if creator:
            token = get_access_token(
                creator["username"], creator["password"], retries=5
            )
            headers = get_headers(token)
        else:
            headers = admin_headers

        # Use admin_headers for group lookup — creator may only see their subgroup
        group_id = get_group_id_by_name(admin_headers, target_group_name)

        if not group_id:
            logger.error(f"Could not find group '{target_group_name}'. Skipping.")
            continue

        project_id = create_project(
            headers, group_id, config["project_name"], config["description"]
        )

        if not project_id:
            logger.error(
                f"Could not create/find project for '{config['project_name']}'. Skipping."
            )
            continue

        if config.get("members"):
            seed_project_members(headers, project_id, config["members"])

        # Give TSM orchestration a moment to set up the schema/DB
        logger.info("Waiting 10s for TSM orchestration initialization...")
        time.sleep(10)

        logger.info(
            f"Creating {len(config['locations'])} Simulated Sensors for {config['project_name']}..."
        )
        for i, loc in enumerate(config["locations"]):
            create_simulated_sensor(headers, project_id, loc, i)

    # --- External API / SFTP test sensors ---
    # Use the external sources project creator (eva) for that project
    ext_creator = EXTERNAL_SOURCES_PROJECT.get("creator", {})
    if ext_creator:
        ext_token = get_access_token(
            ext_creator["username"], ext_creator["password"], retries=5
        )
        ext_headers = get_headers(ext_token)
    else:
        ext_headers = admin_headers
    seed_external_sources(ext_headers, admin_headers=admin_headers)

    # --- QA/QC configurations + custom SaQC functions ---
    logger.info("Seeding QA/QC configurations and custom SaQC functions...")
    try:
        from app.core.seeding import seed_qaqc_configs

        seed_qaqc_configs()
    except Exception as exc:
        logger.warning(f"QA/QC seeding failed (non-fatal): {exc}")

    logger.info("=" * 60)
    logger.info("Seed Complete.")
    logger.info("=" * 60)


if __name__ == "__main__":
    main()
