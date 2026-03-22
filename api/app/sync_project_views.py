#!/usr/bin/env python3
import sys
import logging
from app.services.timeio.orchestrator import TimeIOOrchestrator
from app.services.timeio.timeio_db import TimeIODatabase

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("sync_project")

def sync_project(schema_name: str):
    db = TimeIODatabase()
    orchestrator = TimeIOOrchestrator()
    
    # 1. Get all things in this schema
    query = f"SELECT uuid FROM {schema_name}.thing"
    connection = db._get_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute(query)
            rows = cursor.fetchall()
            uuids = [row[0] for row in rows]
            
        logger.info(f"Found {len(uuids)} sensors in schema {schema_name}")
        
        # 2. Trigger sync for each
        count = 0
        for thing_uuid in uuids:
            if orchestrator.sync_sensor(thing_uuid):
                count += 1
                logger.info(f"Triggered sync for {thing_uuid}")
            else:
                logger.error(f"Failed to trigger sync for {thing_uuid}")
                
        logger.info(f"Successfully triggered sync for {count}/{len(uuids)} sensors.")
        
    except Exception as e:
        logger.error(f"Error syncing project {schema_name}: {e}")
    finally:
        connection.close()

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 sync_project_views.py <schema_name>")
        sys.exit(1)
    
    sync_project(sys.argv[1])
