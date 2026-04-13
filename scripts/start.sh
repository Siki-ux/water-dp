#!/bin/sh
set -e

# Skipping Alembic migrations - init_db() in main.py handles table creation
# with Base.metadata.create_all(checkfirst=True) which is idempotent
echo "Table creation handled by init_db() during app startup..."

echo "Running Keycloak setup (retrying until Keycloak is ready)..."
for i in $(seq 1 20); do
    python scripts/setup_keycloak.py && break
    echo "Keycloak not ready yet (attempt $i/20), retrying in 5s..."
    sleep 5
done

echo "Initializing database schema (once)..."
python -c "from app.core.database import init_db; init_db()"

echo "Starting application with Gunicorn (${WEB_CONCURRENCY:-4} workers)..."
exec python -m gunicorn app.main:app -k uvicorn.workers.UvicornWorker -w ${WEB_CONCURRENCY:-4} -b 0.0.0.0:8000 --timeout 120 --keep-alive 60 --graceful-timeout 30 --reload
