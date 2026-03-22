#!/bin/bash

# Ensure TSM Orchestration is running (Optional check, but helpful)
# We assume the user knows to run ./up.sh in tsm-orchestration first.

echo "Starting Water DP API in TSM Mode..."
echo "This will rebuild images and connect services to the TSM network."

# Run docker compose with both files
# Pass arguments to rebuild only specific services (e.g. ./run_with_tsm.sh api worker)
# If no arguments provided, it builds everything defined in the compose files.

BUILD_FLAG=""
BUILD_ONLY=false
SERVICES=""
PODMAN_MODE=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -b|--build)
            BUILD_FLAG="--build"
            shift
            ;;
        --build-only)
            BUILD_ONLY=true
            shift
            ;;
        --podman)
            PODMAN_MODE=true
            shift
            ;;
        *)
            SERVICES="$SERVICES $1"
            shift
            ;;
    esac
done

COMPOSE_CMD="docker compose"
COMPOSE_FILES="-f docker-compose.yml -f docker-compose.tsm.yml"

if [[ "$PODMAN_MODE" == "true" ]]; then
    echo "Podman mode: regenerating podman compose files and stripping postgres-app dependencies..."
    python3 strip_postgres.py $SERVICES
    COMPOSE_CMD="env UID=$(id -u) podman compose --in-pod false -p water-dp-api"
    export GID=$(id -g)
    COMPOSE_FILES="-f docker-compose.podman.yml -f docker-compose.tsm.podman.yml -f docker-compose.override.podman.yml"
    # Ensure external networks exist before compose tries to use them
    podman network exists water_shared_net || podman network create water_shared_net
fi

if [[ "$BUILD_ONLY" == "true" ]]; then
    if [ -z "$SERVICES" ]; then
        echo "Pulling and building ALL services..."
    else
        echo "Pulling and building services:$SERVICES"
    fi
    $COMPOSE_CMD $COMPOSE_FILES pull $SERVICES
    $COMPOSE_CMD $COMPOSE_FILES build $SERVICES
elif [ -z "$SERVICES" ]; then
    echo "Starting ALL services (use -b to force rebuild)..."
    $COMPOSE_CMD $COMPOSE_FILES up $BUILD_FLAG -d
    echo "Follow logs: podman ps -a  |  podman logs -f <container>"
else
    echo "Starting services:$SERVICES (use -b to force rebuild)"
    $COMPOSE_CMD $COMPOSE_FILES up $BUILD_FLAG -d $SERVICES
    echo "Follow logs: podman ps -a  |  podman logs -f <container>"
fi

echo ""
echo "Services started."
echo "App UI: http://localhost:3000"
echo "API Docs: http://localhost:8000/docs"
