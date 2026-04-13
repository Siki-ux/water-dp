# Load Testing

The Water Data Platform includes a [Locust](https://locust.io/) load testing setup to benchmark API performance and validate system requirements.

## Quick Start

### Local (with Web UI)

```bash
pip install locust
cd api/tests/load
locust -f locustfile.py --host http://localhost:8000
```

Open http://localhost:8089 to configure and start tests.

### Headless (CI)

```bash
locust -f api/tests/load/locustfile.py \
    --host http://localhost:8000 \
    --headless -u 50 -r 5 --run-time 2m
```

### Docker (distributed)

```bash
# Start with 2 workers (default)
docker compose -f docker-compose.loadtest.yml up

# Scale to 4 workers for heavier loads
docker compose -f docker-compose.loadtest.yml up --scale worker=4
```

Web UI at http://localhost:8089.

## Configuration

| Environment Variable   | Default              | Description                     |
|------------------------|----------------------|---------------------------------|
| `LOAD_TEST_TARGET`     | `http://water-dp-api:8000` | API base URL              |
| `LOAD_TEST_USERNAME`   | `admin`              | Keycloak test user              |
| `LOAD_TEST_PASSWORD`   | `admin`              | Keycloak test password          |
| `API_PREFIX`           | `/api/v1`            | API path prefix                 |

## Test Scenarios

| Task                  | Weight | Endpoint                           |
|-----------------------|--------|------------------------------------|
| List Projects         | 10     | `GET /projects/`                   |
| Get Project Detail    | 5      | `GET /projects/{id}`               |
| Get Project Sensors   | 5      | `GET /projects/{id}/sensors`       |
| List Things           | 4      | `GET /projects/{id}/things`        |
| List SMS Sensors      | 3      | `GET /sms/sensors`                 |
| Health Check          | 3      | `GET /health`                      |
| Check Session         | 2      | `GET /auth/me`                     |
| List Layers           | 2      | `GET /geospatial/layers`           |
| List Alerts           | 2      | `GET /alerts/{id}`                 |

## Pass/Fail Criteria

The test exits with code 1 if:
- **Failure rate** exceeds 5%
- **Average response time** exceeds 2 seconds

## Recommended Test Profiles

| Profile        | Users | Spawn Rate | Duration | Purpose                    |
|---------------|-------|------------|----------|----------------------------|
| Smoke         | 5     | 1/s        | 1m       | Verify setup works         |
| Normal        | 50    | 5/s        | 5m       | Typical production load    |
| Stress        | 200   | 10/s       | 10m      | Find breaking points       |
| Soak          | 50    | 5/s        | 30m      | Memory leak detection      |

## Benchmark Results (2026-04-02)

Environment: Docker Desktop on Windows, single-node, all services on one host.
Stack: FastAPI + Uvicorn, PostgreSQL/PostGIS 16, FROST Server 2.5.3, Nginx reverse proxy.

### Single-User Latency (sequential, no contention)

| Endpoint                                  | avg    | p50    | p95    | max    |
|-------------------------------------------|--------|--------|--------|--------|
| `GET /auth/me`                            | 107ms  | 9ms    | 554ms  | 554ms  |
| `GET /projects/`                          | 10ms   | 7ms    | 37ms   | 37ms   |
| `GET /projects/{id}`                      | 4ms    | 4ms    | 6ms    | 6ms    |
| `GET /projects/{id}/sensors`              | 97ms   | 86ms   | 241ms  | 241ms  |
| `GET /projects/{id}/available-sensors`    | 13ms   | 12ms   | 14ms   | 14ms   |
| `GET /sms/sensors?page=1&page_size=20`    | 80ms   | 81ms   | 200ms  | 200ms  |
| `GET /geospatial/layers`                  | 112ms  | 74ms   | 464ms  | 464ms  |

### 20 Concurrent Users (100 requests total)

| Endpoint                                  | avg    | p50    | p95    | max    | errors |
|-------------------------------------------|--------|--------|--------|--------|--------|
| `GET /projects/`                          | 221ms  | 219ms  | 392ms  | 392ms  | 0%     |
| `GET /projects/{id}`                      | 209ms  | 220ms  | 389ms  | 389ms  | 0%     |
| `GET /projects/{id}/sensors`              | 269ms  | 279ms  | 518ms  | 518ms  | 0%     |
| `GET /sms/sensors`                        | 234ms  | 240ms  | 432ms  | 432ms  | 0%     |
| `GET /geospatial/layers`                  | 191ms  | 190ms  | 287ms  | 287ms  | 0%     |
| `GET /auth/me`                            | 116ms  | 120ms  | 250ms  | 250ms  | 0%     |

**Throughput: 91.8 req/s — Errors: 0/100 (0%)**

### 50 Concurrent Users (500 requests total)

| Endpoint                                  | avg    | p50    | p95    | max    | errors |
|-------------------------------------------|--------|--------|--------|--------|--------|
| `GET /projects/`                          | 460ms  | 457ms  | 627ms  | 898ms  | 0%     |
| `GET /projects/{id}`                      | 457ms  | 455ms  | 626ms  | 784ms  | 0%     |
| `GET /projects/{id}/sensors`              | 566ms  | 546ms  | 835ms  | 1216ms | 0%     |
| `GET /sms/sensors`                        | 518ms  | 479ms  | 900ms  | 1208ms | 0%     |
| `GET /geospatial/layers`                  | 495ms  | 475ms  | 698ms  | 903ms  | 0%     |
| `GET /auth/me`                            | 318ms  | 311ms  | 433ms  | 610ms  | 0%     |

**Throughput: 103.5 req/s — Errors: 0/500 (0%)**

### Key Observations

- **Zero errors** at all concurrency levels.
- All p95 latencies stay **under 1 second** at 50 concurrent users.
- FROST-dependent endpoints (`/sensors`, `/sms/sensors`) are the slowest due to upstream HTTP calls to the FROST STA server.
- Pure DB endpoints (`/projects/`, `/projects/{id}`) respond in **4–10ms** under no contention.
- Throughput scales from 91 to 103 req/s between 20 and 50 users, indicating the server is not saturated.
- N+1 optimizations (batch `$filter`, `resolve_batch`) keep FROST-dependent endpoints viable under load.
