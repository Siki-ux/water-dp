# What Changed and Why

This document covers the major architectural additions made to `water_dp-api`. The README covers configuration and running the service; this document explains the *motivation and design* behind each significant new subsystem.

---

## 1. QA/QC System

### What it is

A quality assurance / quality control subsystem for sensor time series data, allowing users to configure and trigger QA/QC tests through the API and frontend.

### Components

| File | Role |
|---|---|
| `app/services/qaqc_service.py` (509 lines) | CRUD for QA/QC configurations stored in TSM's `config_db` schema |
| `app/api/v1/endpoints/qaqc.py` (662 lines) | REST endpoints: `/sms/qaqc` and `/api/v1/projects/{id}/qaqc` |
| `app/schemas/qaqc.py` | Pydantic models: `QAQCConfig`, `QAQCTest` |
| `frontend/app/sms/qa-qc/` | Frontend QA/QC dashboard |
| `frontend/app/projects/[id]/qaqc/` | Per-project QA/QC view |

### How it works

QA/QC configurations define rules (e.g. range checks, spike detection) that the TSM `worker-run-qaqc` container applies to incoming observations. `water_dp-api` manages these config records directly in TSM's `config_db` schema — it does **not** run the QC computation itself. A manual run can be triggered by publishing to the `data_parsed` MQTT topic, which signals the TSM worker to process the queue immediately.

### Why

Centralising QA/QC config management in the API allows the frontend to expose a QA/QC dashboard without users needing direct database access. Triggering via MQTT keeps the execution model consistent with how TSM already processes data.

---

## 2. SMS Service (Sensor Management System)

### What it is

An aggregation layer that presents a unified sensor CRUD interface by coordinating FROST, TSM's ConfigDB, and the `water_dp` database.

### Components

| File | Role |
|---|---|
| `app/services/sms_service.py` (553 lines) | Orchestrates `AsyncThingService` (FROST) and `TimeIODatabase` (ConfigDB) |
| `app/api/v1/endpoints/sms.py` | Routes under `/sms/` |
| `frontend/app/sms/` | Sensors, parsers, device types, QA/QC pages |

### Authorization

Sensors are filtered by the user's Keycloak groups. Each group name corresponds to a `schema_name` in the `water_dp.projects` table. Realm admins bypass filtering and see all schemas.

### Why

The upstream UFZ SMS service was not available in this deployment. This local SMS layer provides the same interface (sensor list, parser management, device types) backed by direct FROST and ConfigDB access. The surface area mirrors the upstream API intentionally, so it can be replaced with minimal frontend changes when the upstream service becomes available.

---

## 3. TimeIO Database Service (`app/services/timeio/timeio_db.py`)

### What it is

Direct `psycopg2` access to the TSM PostgreSQL database — not via FROST or any REST layer.

### Why it exists

Some operations required by the SMS, QA/QC, and monitoring systems are not expressible through the FROST SensorThings API:
- Bulk sensor listing across multiple per-thing schemas (`user_*`)
- Reading and writing `config_db` tables (parser configs, MQTT device types, QA/QC rules)
- Checking last observation timestamps for activity monitoring

All such raw database access is centralized in this one service rather than scattered across multiple services.

### Used by

`SMSService`, `QAQCService`, `MonitoringService`.

---

## 4. Monitoring Service (`app/services/monitoring_service.py`)

### What it is

A Celery periodic task that automatically detects inactive MQTT-ingesting sensors.

### How it works

1. Queries TimeIO DB for all MQTT-configured things.
2. For each thing, reads the last observation timestamp from its per-thing schema.
3. If no data has arrived in the last 24 hours, creates an `Alert` record in `water_dp.alerts` and updates the thing's status in FROST.
4. Resolves the alert automatically when data resumes.

### Why

Without automated monitoring, an inactive sensor is invisible until a user manually queries it. This service provides continuous observability and populates the alert dashboard in the frontend.

---

## 5. Layer Assignment System (`app/models/layer_assignment.py`)

### What it is

A join table `layer_project_assignments` that links GeoServer layer names to project IDs.

### Why

The GeoServer layer list is global — it contains all layers published to the GeoServer instance. Projects need a way to declare which layers belong to them so the frontend map view and layer management UI can be scoped per-project. The assignment is many-to-many: one layer can be associated with multiple projects.

### Frontend integration

`frontend/app/layers/` allows project owners to add and remove layer assignments. The `/api/v1/geospatial/layers` endpoint filters by these assignments when a project context is provided.

---

## 6. New API Endpoints

The following endpoint prefixes were added. Previously existing endpoints (`/things/`, `/projects/`, `/alerts/`, `/computations/`, `/geospatial/`, `/groups/`, `/dashboards/`) are unchanged in their contracts.

| Endpoint prefix | What it does |
|---|---|
| `/sms/sensors` | Cross-project sensor list with ConfigDB metadata (MQTT config, parser, device type) |
| `/sms/qaqc` | QA/QC config CRUD + manual trigger for sensor-scoped QC |
| `/external-sources/` | Manage external API data source configurations |
| `/mqtt/` | Inspect and update MQTT thing configurations |
| `/custom-parsers/` | Upload and manage custom parser scripts |
| `/datasets/` | Export time series data (CSV, JSON) |

---

## 7. Alembic Replaces Manual SQL Migrations

### What changed

Schema evolution for the `water_dp` database is now managed by Alembic (`alembic/` directory) instead of manually applied SQL scripts.

### How to apply migrations

```bash
# Apply all pending migrations
docker compose exec api alembic upgrade head

# Check current revision
docker compose exec api alembic current
```

### Why

Manual SQL required coordinating who ran what and when, with no record of current state. Alembic provides a migration history, makes incremental application safe, and allows rollback when needed.

---

## 8. Docker Compose: Multiple Deployment Profiles

### Files added

| File | Purpose |
|---|---|
| `docker-compose.tsm.yml` | Connects `water_dp-api` to an existing `tsm-orchestration` stack via `water_shared_net` |
| `docker-compose.prod.yml` | Production overlay: no bind-mount volumes, `restart: always`, secrets via env |
| `docker-compose.podman.yml` / `docker-compose.tsm.podman.yml` | Generated at runtime by `run_with_tsm.sh` for Podman deployments |

### Usage

```bash
# Standalone development
docker compose up -d

# Integrated with TSM (standard)
./run_with_tsm.sh

# Production
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

`run_with_tsm.sh` is the recommended entry point for the integrated deployment — it assembles the correct compose files and passes `--podman` through to Podman if needed.

---

## 9. GitHub Actions CI/CD

| Workflow | Trigger | What it does |
|---|---|---|
| `.github/workflows/ci.yml` | Every push / PR | `ruff` lint, `mypy` type check, `pytest` |
| `.github/workflows/deploy.yml` | Merge to `main` | Build Docker image and push to registry |

These replace the GitLab CI that was removed from `tsm-orchestration`. Lint and tests must pass before merge; the image is published automatically on merge.

---

## 10. Frontend: SMS Module, QA/QC Dashboard, Localization

### Pages added

| Route | Purpose |
|---|---|
| `/sms/sensors` | Cross-project sensor browser with parser and device info |
| `/sms/parsers` | Manage CSV and custom parsers per thing |
| `/sms/device-types` | View available MQTT device types |
| `/sms/qa-qc` | QA/QC config management and manual trigger |
| `/layers` | Assign and remove GeoServer layers per project |
| `/register` | User self-registration flow |

### Localization

Three locales are supported: Czech (`locales/cs.ts`), English (`locales/en.ts`), Slovak (`locales/sk.ts`). The default locale is English. This reflects the primary user community (Czech and Slovak water sector organizations).

---

## 11. Keycloak Group-Based Authorization

### What changed

Authentication continues to be delegated to Keycloak (OIDC). Authorization was extended: Keycloak group memberships now directly control project access inside `water_dp-api`.

### How it works

1. User authenticates via Keycloak; the access token includes group memberships.
2. `deps.get_current_user()` extracts groups from the token on every request.
3. `ProjectService._is_admin()` grants full access to Keycloak realm admins.
4. All other users see only projects whose `authorization_provider_group_id` matches one of their groups.
5. `SMSService` uses the same group list to filter accessible ConfigDB schemas.

### Why

Row-level access control via Keycloak groups avoids per-user permission tables in the application database and keeps all authorization state in a single place (Keycloak). Adding a user to a project is a Keycloak group operation, not a database operation.

---

## 12. Celery for Async Computations and Monitoring

### Why Celery was added

The FastAPI request lifecycle is unsuitable for two categories of work:
1. **User computation jobs** — Python and R scripts submitted by users can run for minutes. They must execute in the background and report status asynchronously.
2. **Periodic monitoring** — `MonitoringService.check_inactive_mqtt_things()` needs to run on a schedule (not triggered by a request).

Celery with Redis as the broker handles both. The worker process runs alongside the API in the `docker-compose.tsm.yml` configuration.

### Task types

| Task | Schedule / Trigger |
|---|---|
| Run user computation script | On-demand, triggered via `/computations/` endpoint |
| `MonitoringService.check_inactive_mqtt_things` | Periodic (configured in `celery_app.py` beat schedule) |
