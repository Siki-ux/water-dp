import logging
import os
import random
import sys
import time

import requests

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
KEYCLOAK_URL = os.getenv("KEYCLOAK_URL", "http://keycloak:8080")
REALM = "timeio"

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
    {"name": "Morava - Trojmedzie SK/CZ/AT", "lat": 48.61678679157393, "lon": 16.940155043648446},
    {"name": "Morava - Pohraničie so SK", "lat": 48.8782835118391, "lon": 17.202200887542453},
    {"name": "Morava - Uherské Hradiště", "lat": 49.073066418801204, "lon": 17.458410026447893},
    {"name": "Morava - Olomouc", "lat": 49.597293659473586, "lon": 17.267434853226355},
    {"name": "Morava - Hanušovice, Branná", "lat": 50.07668057933876, "lon": 16.93454987969328},
    {"name": "Morava - Prameň", "lat": 50.20514843813213, "lon": 16.849219008675586},
    {"name": "Morava - Moravičanské jezero","lat": 49.77603658549506, "lon": 16.968263374073388},
    {"name": "Morava - Kroměříž ","lat": 49.30344147051559, "lon": 17.39851656181459}
]

PROJECTS_CONFIG = [
    {
        "target_group_name": "UFZ-TSM:MyProject",
        "project_name": "Czech Water Analysis",
        "description": "Monitoring water quality in major Czech bodies of water.",
        "locations": LOCATIONS_CZECH,
    },
    {
        "target_group_name": "UFZ-TSM:MyProject2",
        "project_name": "Morava River Monitoring",
        "description": "Hydrological monitoring along the Morava river.",
        "locations": LOCATIONS_MORAVA,
    },
]


def get_access_token():
    url = f"{API_URL}/auth/login"
    payload = {
        "username": USERNAME,
        "password": PASSWORD,
    }
    try:
        logging.info(f"Authenticating as {USERNAME} at {url}...")
        response = requests.post(url, json=payload)

        if response.status_code != 200:
            logger.error(f"Auth failed: {response.text}")
            response.raise_for_status()

        return response.json()["access_token"]
    except Exception as e:
        logger.error(f"Failed to get access token: {e}")
        sys.exit(1)


def get_headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def wait_for_api():
    base_url = API_URL.replace("/api/v1", "").rstrip("/")
    health_url = f"{base_url}/health"

    logger.info(f"Waiting for API at {health_url}...")
    for _ in range(30): # Reduced wait time for development context if needed
        try:
            if requests.get(health_url, timeout=5).status_code == 200:
                logger.info("API is Up.")
                return
        except Exception:
            pass
        time.sleep(2)
    logger.warning("API unreachable, but proceeding with script generation as requested (offline mode simulation).")


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

    # Add retries for the first sensor (or all) because TSM setup can take a moment
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
            else:
                logger.warning(
                    f"Attempt {attempt + 1}/{max_retries} failed for {name}: {res.status_code} - {res.text}"
                )
                if attempt < max_retries - 1:
                    time.sleep(5)
        except Exception as e:
            logger.error(f"Error on attempt {attempt + 1}/{max_retries} for {name}: {e}")
            if attempt < max_retries - 1:
                time.sleep(5)
    
    logger.error(f"Failed to create sensor {name} after {max_retries} attempts.")


def main():
    logger.info("Starting Water DP Simulation Script...")
    wait_for_api()

    # The following steps require the API to be up. 
    # Since the user requested "don't try connecting to application it is turned off",
    # I have refactored the logic so it can be executed when the API is back.
    
    try:
        token = get_access_token()
        headers = get_headers(token)
    except Exception:
        logger.error("Could not authenticate. API is likely offline.")
        return

    for config in PROJECTS_CONFIG:
        target_group_name = config["target_group_name"]
        logger.info(f"Processing project: {config['project_name']} for group: {target_group_name}")
        
        group_id = get_group_id_by_name(headers, target_group_name)

        if not group_id:
            logger.error(f"Could not find group '{target_group_name}'. Skipping.")
            continue

        project_id = create_project(headers, group_id, config["project_name"], config["description"])
        
        if not project_id:
            logger.error(f"Could not create/find project for '{config['project_name']}'. Skipping.")
            continue

        # Give TSM orchestration a moment to set up the schema/DB
        logger.info("Waiting 10s for TSM orchestration initialization...")
        time.sleep(10)

        logger.info(f"Creating {len(config['locations'])} Simulated Sensors for {config['project_name']}...")
        for i, loc in enumerate(config["locations"]):
            create_simulated_sensor(headers, project_id, loc, i)

    logger.info("Simulation Setup Complete.")


if __name__ == "__main__":
    main()
