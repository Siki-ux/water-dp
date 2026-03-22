# Water Data Platform

The **Water Data Platform** is a comprehensive Python backend for managing environmental sensor data, geospatial layers, and time series analytics. It serves as the **Core Intelligence Layer** bridging TSM (Time Series Management), GeoServer, and a modern web frontend.

## 🔗 Repository Structure

| Component | Location | Description |
|-----------|----------|-------------|
| **API Backend** | `./api/` | FastAPI application, Alembic migrations, tests |
| **Frontend Portal** | `./frontend/` | Next.js dashboard |
| **GeoServer Config** | `./geoserver/` | Layer seeding and configuration |
| **Scripts** | `./scripts/` | Container startup and operational scripts |
| **Examples** | `./examples/` | Sample payloads and data files |
| **Deploy** | `./deploy/` | Production and Podman compose variants |
| **TSM Orchestration** | `../tsm-orchestration/` | Time series infrastructure |

---

## 🏗️ System Architecture

The platform integrates with TSM Orchestration to provide a complete sensor data management solution.

```mermaid
graph TB
    subgraph "User Layer"
        Browser[Web Browser]
    end

    subgraph "water-dp Repository"
        subgraph "Frontend Container"
            Portal[Hydro Portal<br/>Next.js :3000]
        end

        subgraph "Backend Containers"
            API[Water DP API<br/>FastAPI :8000]
            Worker[Celery Worker]
            AppDB[(water-dp-postgres<br/>PostgreSQL+PostGIS :5433)]
            Redis[(Redis)]
            GeoServer[GeoServer :8079]
        end
    end

    subgraph "TSM Orchestration (tsm-orchestration)"
        FROST[FROST Server<br/>SensorThings API :8080]
        TimeDB[(database<br/>PostgreSQL+TimescaleDB :5432)]
        MQTT[MQTT Broker :1883]
        Keycloak[Keycloak :8081]
        MinIO[MinIO :9001]
        ThingMgmt[thing-management-api]
    end

    Browser --> Portal
    Portal --> API
    Portal --> GeoServer
    API --> AppDB
    API --> Redis
    API --> Worker
    API --> FROST
    API --> GeoServer
    API --> TimeDB
    API --> MQTT
    API --> ThingMgmt
    Worker --> TimeDB
    GeoServer --> TimeDB
    Portal -.-> Keycloak
    API -.-> Keycloak
```

---

## 🔄 Data Flow

### Sensor Data Ingestion Flow

```mermaid
sequenceDiagram
    participant User as User/Device
    participant API as Water DP API
    participant MQTT as MQTT Broker
    participant TSM as TSM Workers
    participant DB as TimeIO Database
    participant FROST as FROST API

    User->>API: Create Simulated Sensor
    API->>MQTT: Publish Thing Event
    MQTT->>TSM: Thing Setup Worker
    TSM->>DB: Create Schema & Tables
    
    loop Data Simulation
        API->>DB: Insert Observations
    end
    
    User->>API: Query Sensor Data
    API->>FROST: GET /Things/{id}/Datastreams
    FROST->>DB: Query Observations
    FROST-->>API: Return Data
    API-->>User: JSON Response
```

### Project-Sensor Linking Flow

```mermaid
flowchart LR
    subgraph "Water DP Database"
        Project[projects]
        PS[project_sensors]
    end
    
    subgraph "TimeIO Database"
        Thing[thing table]
        DS[datastream table]
        Obs[observation table]
    end
    
    Project --> PS
    PS -->|thing_uuid| Thing
    Thing --> DS
    DS --> Obs
```

---

## ✨ Features

### Core Capabilities
- **🔌 Sensor Management**: CRUD operations via FROST SensorThings API
- **📊 Time Series Data**: High-performance queries on TimescaleDB
- **🗺️ Geospatial**: PostGIS layers served via GeoServer WMS/WFS
- **📁 Project Organization**: Group sensors into user projects
- **🔔 Alerting**: Threshold-based monitoring with notifications
- **⚙️ Computations**: Background Python/R script execution via Celery
- **🤖 Simulation**: Generate fake sensor data for testing

### API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/v1/things/` | List all sensors from FROST |
| `POST /api/v1/things/simulated` | Create simulated sensor |
| `GET /api/v1/projects/` | List user projects |
| `POST /api/v1/projects/{id}/sensors` | Link sensor to project |
| `GET /api/v1/datasets/` | Export time series data |
| `GET /api/v1/geospatial/layers` | List GeoServer layers |
| `GET /api/v1/groups/` | Browse TSM groups |
| `POST /api/v1/alerts/` | Create alert definition |
| `POST /api/v1/computations/` | Submit computation job |

---

## 🚀 Quick Start

### Prerequisites

- Docker & Docker Compose v2+
- Git
- 8GB+ RAM recommended

### Option A: Run with TSM (Full Stack)

Use the integrated script that starts TSM first, then Water DP:

```bash
# 1. Clone both repositories
git clone https://github.com/Siki-ux/water-dp.git
git clone https://github.com/Siki-ux/tsm-orchestration.git

# 2. Setup environment
cd water-dp
cp .env.example .env

# 3. Create shared network
docker network create water_shared_net

# 4. Start full stack
./run_with_tsm.sh
```

### Option B: Run Standalone (API + GeoServer only)

```bash
# 1. Setup environment
cp .env.example .env

# 2. Start services
docker compose up -d --build
```

> **Note**: Without TSM, sensor features (`/things/`) won't work.

### Access Points

| Service | URL | Credentials |
|---------|-----|-------------|
| **API Docs** | http://localhost:8000/api/v1/docs | - |
| **Frontend** | http://localhost:3000 | via Keycloak |
| **GeoServer** | http://localhost:8079/geoserver | `admin` / `geoserver` |
| **FROST API** | http://localhost/sta/v1.1 | - |
| **Keycloak** | http://localhost:8081 | `admin` / `admin` |
| **TSM Portal** | http://localhost | - |

---

## 🛠️ Development

### Project Structure

```
water-dp/
├── api/                      # FastAPI backend (self-contained Python project)
│   ├── app/
│   │   ├── api/v1/endpoints/ # FastAPI route handlers
│   │   ├── models/           # SQLAlchemy ORM models
│   │   ├── schemas/          # Pydantic request/response models
│   │   ├── services/
│   │   │   ├── timeio/       # TSM integration clients (FROST, MQTT, DB)
│   │   │   └── ...           # Alert, GeoServer, QA/QC, SMS services
│   │   ├── core/             # Config, database, middleware
│   │   └── main.py           # FastAPI app entry
│   ├── alembic/              # Database migrations
│   ├── tests/                # Pytest test suite
│   ├── Dockerfile
│   └── pyproject.toml
├── frontend/                 # Next.js dashboard
├── geoserver/                # GeoServer config & seed data
├── scripts/                  # Container startup and operational scripts
├── examples/                 # Sample payloads and data files
├── deploy/                   # Production and Podman compose variants
└── docker-compose.yml        # Main development compose
```

### Local Development

```bash
# Install dependencies (from within api/)
cd api && poetry install

# Run with hot reload (requires Docker services running)
poetry run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Run tests
poetry run pytest

# Run linting
poetry run ruff check app/
```

### Seeding Test Data

```bash
# Create simulated sensors with fake data
docker compose --profile seed run --rm water-dp-seed
```

---

## 📦 Database Schema

### Water DP Database (`water_dp` schema)

Stores application state, user projects, and alerts.

```mermaid
erDiagram
    projects ||--o{ project_members : has
    projects ||--o{ project_sensors : contains
    projects ||--o{ alert_definitions : monitors
    projects ||--o{ dashboards : displays
    projects ||--o{ computation_scripts : runs
    projects ||--o{ datasources : connects
    
    alert_definitions ||--o{ alerts : triggers
    computation_scripts ||--o{ computation_jobs : executes

    projects {
        uuid id PK
        string name
        string owner_id
        string schema_name
        jsonb properties
    }
    
    project_sensors {
        uuid project_id FK
        uuid thing_uuid FK
        timestamp added_at
    }
    
    alert_definitions {
        uuid id PK
        string name
        uuid project_id FK
        jsonb conditions
        boolean is_active
    }
```

### TimeIO Database (per-schema)

Each TSM project/thing gets its own schema with:

| Table | Description |
|-------|-------------|
| `thing` | Sensor metadata (name, UUID, properties) |
| `datastream` | Data channels (temperature, humidity, etc.) |
| `observation` | Time series measurements |
| `location` | Sensor locations |

---

## ⚙️ Configuration

### Key Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | Water DP PostgreSQL connection | `postgresql://postgres:postgres@postgres-app:5432/water_app` |
| `FROST_URL` | FROST SensorThings API | `http://frost:8080` |
| `GEOSERVER_URL` | GeoServer REST API | `http://water-dp-geoserver:8080/geoserver` |
| `KEYCLOAK_URL` | Keycloak auth server | `http://keycloak:8081/keycloak` |
| `TIMEIO_DB_HOST` | TimeIO database host | `database` |
| `MQTT_BROKER_HOST` | MQTT broker for thing events | `mqtt-broker` |
| `FERNET_ENCRYPTION_SECRET` | Encryption key for credentials | Required |
| `SECRET_KEY` | JWT signing key | Required |

### Docker Networks

| Network | Purpose |
|---------|---------|
| `water_shared_net` | Cross-stack communication (created manually) |
| `tsm-orchestration_default` | TSM internal network (auto-created) |

---

## 🧪 Testing

```bash
# Unit tests
poetry run pytest tests/test_api/ -v

# Integration tests (requires Docker)
poetry run pytest -m integration

# Coverage report
poetry run pytest --cov=app --cov-report=html
```

---

## 🐛 Troubleshooting

### Common Issues

**API returns 503 on startup**
- Wait 1-2 minutes for health checks to pass
- Check logs: `docker compose logs api`

**Sensors not appearing**
- Verify TSM is running: `docker compose -f ../tsm-orchestration/docker-compose.yml ps`
- Check MQTT connectivity: `docker compose logs worker`

**GeoServer layers missing**
- Re-run init: `docker compose restart geoserver-init`
- Check logs: `docker compose logs geoserver-init`

**Database connection errors**
- Verify network: `docker network inspect water_shared_net`
- Check credentials in `.env`

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feat/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feat/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.
