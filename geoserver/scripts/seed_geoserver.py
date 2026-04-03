import logging
import os
import sys
import time

# Minimal dependencies check

try:
    import requests
except ImportError:
    print("Requests module not found. Installing...")
    os.system("pip install requests")
    import requests

try:
    import psycopg2
except ImportError:
    print("psycopg2 module not found. Installing...")
    os.system("pip install psycopg2-binary")
    import psycopg2

import glob
import json

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("GeoServerInit")

GS_URL = os.getenv("GEOSERVER_URL", "http://geoserver:8080/geoserver")
GS_USER = os.getenv("GEOSERVER_USER", "admin")
GS_PASS = os.getenv("GEOSERVER_PASSWORD", "geoserver")


def wait_for_geoserver():
    logger.info(f"Waiting for GeoServer at {GS_URL}...")
    auth = (GS_USER, GS_PASS)
    for i in range(30):
        try:
            r = requests.get(f"{GS_URL}/rest/workspaces", auth=auth)
            if r.status_code == 200:
                logger.info("GeoServer is Ready.")
                return True
        except Exception:
            pass
        time.sleep(2)
    return False


def init_geoserver():
    if not wait_for_geoserver():
        logger.error("Timeout waiting for GeoServer.")
        sys.exit(1)

    auth = (GS_USER, GS_PASS)
    headers = {"Content-Type": "application/json", "Accept": "application/json"}

    # 1. Create Workspace 'water_data'
    ws_name = "water_data"
    r = requests.get(f"{GS_URL}/rest/workspaces/{ws_name}", auth=auth)
    if r.status_code == 404:
        logger.info(f"Creating workspace '{ws_name}'...")
        payload = {"workspace": {"name": ws_name}}
        requests.post(
            f"{GS_URL}/rest/workspaces", json=payload, auth=auth, headers=headers
        )
    else:
        logger.info(f"Workspace '{ws_name}' exists.")

    # 2. Create/Update DataStore 'water_data_store'
    store_name = "water_data_store"
    logger.info(f"Checking DataStore '{store_name}'...")

    db_host = os.getenv("DB_HOST", "geoserver-postgres")
    db_port = os.getenv("DB_PORT", "5432")
    db_name = os.getenv("DB_NAME", "geoserver_db")
    db_user = os.getenv("DB_USER", "geoserver")
    db_pass = os.getenv("DB_PASSWORD", "geoserver_pass")
    db_schema = os.getenv("DB_SCHEMA", "public")

    ds_payload = {
        "dataStore": {
            "name": store_name,
            "type": "postgis",
            "enabled": True,
            "connectionParameters": {
                "host": db_host,
                "port": db_port,
                "database": db_name,
                "user": db_user,
                "passwd": db_pass,
                "dbtype": "postgis",
                "schema": db_schema,
                "Evictor run periodicity": 300,
                "Max open prepared statements": 50,
                "encode functions": True,
                "Batch insert size": 1,
                "preparedStatements": True,
                "fetch size": 1000,
                "min connections": 1,
                "validate connections": True,
                "max connections": 10,
                "Connection timeout": 20,
            },
        }
    }

    # Check existence
    r = requests.get(
        f"{GS_URL}/rest/workspaces/{ws_name}/datastores/{store_name}", auth=auth
    )
    if r.status_code == 200:
        logger.info(f"DataStore '{store_name}' exists. Updating...")
        requests.put(
            f"{GS_URL}/rest/workspaces/{ws_name}/datastores/{store_name}",
            json=ds_payload,
            auth=auth,
            headers=headers,
        )
    else:
        logger.info(f"Creating DataStore '{store_name}'...")
        r = requests.post(
            f"{GS_URL}/rest/workspaces/{ws_name}/datastores",
            json=ds_payload,
            auth=auth,
            headers=headers,
        )
        if r.status_code != 201:
            logger.error(f"Failed to create DataStore: {r.text}")

    # 3. Seed Layers from /app/data
    seed_layers(auth, headers, db_schema)

    logger.info("GeoServer Initialization Complete.")


def get_db_connection():
    try:
        conn = psycopg2.connect(
            host=os.getenv("DB_HOST", "geoserver-postgres"),
            port=os.getenv("DB_PORT", "5432"),
            database=os.getenv("DB_NAME", "geoserver_db"),
            user=os.getenv("DB_USER", "geoserver"),
            password=os.getenv("DB_PASSWORD", "geoserver_pass"),
        )
        return conn
    except Exception as e:
        logger.error(f"DB Connection failed: {e}")
        return None


def seed_layers(auth, headers, db_schema="public"):
    data_dir = "/app/data"
    if not os.path.exists(data_dir):
        logger.warning(f"Data directory {data_dir} not found. Skipping data seeding.")
        return

    json_files = glob.glob(os.path.join(data_dir, "*.geojson")) + glob.glob(
        os.path.join(data_dir, "*.json")
    )

    if not json_files:
        logger.info("No GeoJSON files found to seed.")
        return

    conn = get_db_connection()
    if not conn:
        logger.error("Skipping data seeding due to DB connection failure.")
        return

    for file_path in json_files:
        filename = os.path.splitext(os.path.basename(file_path))[0]
        # Sanitize table name
        table_name = filename.lower().replace("-", "_").replace(" ", "_")

        logger.info(f"Processing {filename} -> Table {table_name}...")

        try:
            with open(file_path, "r", encoding="utf-8") as f:
                data = json.load(f)

            features = data.get("features", [])
            if not features:
                if data.get("type") == "Feature":
                    features = [data]

            if not features:
                logger.warning(f"No features found in {filename}.")
                continue

            # Creating Table
            # simple schema: id, geom, properties (jsonb)
            with conn.cursor() as cur:
                # Ensure PostGIS extension and Schema
                cur.execute("CREATE EXTENSION IF NOT EXISTS postgis;")
                cur.execute(f"CREATE SCHEMA IF NOT EXISTS {db_schema};")

                # Check if table exists? We might want to overwrite or skip
                # For now, drop and recreate ensures clean state
                cur.execute(f"DROP TABLE IF EXISTS {db_schema}.{table_name} CASCADE;")
                cur.execute(
                    f"""
                    CREATE TABLE {db_schema}.{table_name} (
                        id SERIAL PRIMARY KEY,
                        geom GEOMETRY(Geometry, 4326),
                        properties JSONB
                    );
                """
                )

                for feat in features:
                    props = json.dumps(feat.get("properties", {}))
                    geom_json = json.dumps(feat.get("geometry"))

                    # ST_GeomFromGeoJSON
                    cur.execute(
                        f"""
                        INSERT INTO {db_schema}.{table_name} (geom, properties)
                        VALUES (ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326), %s);
                    """,
                        (geom_json, props),
                    )

                conn.commit()
                logger.info(f"Table {db_schema}.{table_name} populated.")

            # Publish Layer in GeoServer
            # 1. FeatureType
            ws_name = "water_data"
            store_name = "water_data_store"

            ft_payload = {
                "featureType": {
                    "name": table_name,
                    "nativeName": table_name,
                    "title": filename.replace("_", " ").title(),
                    "srs": "EPSG:4326",
                    "enabled": True,
                }
            }

            # Check if layer exists
            r = requests.get(
                f"{GS_URL}/rest/workspaces/{ws_name}/datastores/{store_name}/featuretypes/{table_name}",
                auth=auth,
            )

            # Recalculate parameters
            params = {"recalculate": "nativebbox,latlonbbox"}

            if r.status_code == 200:
                logger.info(f"Layer {table_name} already exists. Updating...")
                # We can PUT to update and force recalculate
                requests.put(
                    f"{GS_URL}/rest/workspaces/{ws_name}/datastores/{store_name}/featuretypes/{table_name}",
                    json=ft_payload,
                    auth=auth,
                    headers=headers,
                    params=params,
                )
            else:
                logger.info(f"Publishing Layer {table_name}...")
                r = requests.post(
                    f"{GS_URL}/rest/workspaces/{ws_name}/datastores/{store_name}/featuretypes",
                    json=ft_payload,
                    auth=auth,
                    headers=headers,
                    params=params,
                )
                if r.status_code == 201:
                    logger.info(f"Layer {table_name} published successfully.")
                    # Force recalculate bounds after publish
                    import time
                    time.sleep(1)
                    requests.put(
                        f"{GS_URL}/rest/workspaces/{ws_name}/datastores/{store_name}/featuretypes/{table_name}",
                        json=ft_payload,
                        auth=auth,
                        headers=headers,
                        params=params,
                    )
                    logger.info(f"Bounds recalculated for {table_name}.")
                else:
                    logger.error(f"Failed to publish layer {table_name}: {r.text}")

        except Exception as e:
            conn.rollback()
            logger.error(f"Failed to seed {filename}: {e}")

    conn.close()


if __name__ == "__main__":
    init_geoserver()
