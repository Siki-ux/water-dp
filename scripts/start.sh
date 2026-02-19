#!/bin/sh
set -e

# Skipping Alembic migrations - init_db() in main.py handles table creation
# with Base.metadata.create_all(checkfirst=True) which is idempotent
echo "Table creation handled by init_db() during app startup..."

echo "Running Keycloak setup..."
python scripts/setup_keycloak.py

echo "Initializing database schema (once)..."
python -c "from app.core.database import init_db; init_db()"

echo "Starting application with Gunicorn..."
# Increased workers from 4 to 8 for better concurrency with async endpoints
exec python -m gunicorn app.main:app -k uvicorn.workers.UvicornWorker -w 2 -b 0.0.0.0:8000 --timeout 120 --keep-alive 60 --graceful-timeout 30 --reload
