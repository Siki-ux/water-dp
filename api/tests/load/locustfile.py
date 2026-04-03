"""
Load Testing for Water Data Platform API using Locust.

Usage:
    # Local (web UI):
    locust -f locustfile.py --host http://localhost:8000

    # Headless (CI):
    locust -f locustfile.py --host http://localhost:8000 \
        --headless -u 50 -r 5 --run-time 2m

    # Docker:
    docker compose -f docker-compose.loadtest.yml up --scale worker=4

Environment variables:
    LOAD_TEST_USERNAME  - Keycloak username (default: admin)
    LOAD_TEST_PASSWORD  - Keycloak password (default: admin)
    API_PREFIX          - API path prefix (default: /api/v1)
"""

import logging
import os

from locust import HttpUser, between, events, task

logger = logging.getLogger(__name__)

API_PREFIX = os.getenv("API_PREFIX", "/api/v1")
USERNAME = os.getenv("LOAD_TEST_USERNAME", "admin")
PASSWORD = os.getenv("LOAD_TEST_PASSWORD", "admin")


class WaterDPUser(HttpUser):
    """
    Simulates an authenticated user interacting with the Water DP API.
    Each virtual user authenticates once, then performs weighted tasks.
    """

    wait_time = between(1, 3)
    access_token: str = ""
    project_ids: list = []

    def on_start(self):
        """Authenticate via Keycloak OAuth2 password grant."""
        resp = self.client.post(
            f"{API_PREFIX}/auth/login",
            json={"username": USERNAME, "password": PASSWORD},
            name="/auth/login",
        )
        if resp.status_code == 200:
            data = resp.json()
            self.access_token = data.get("access_token", "")
        else:
            logger.error(f"Authentication failed: {resp.status_code} {resp.text}")
            self.access_token = ""

    @property
    def auth_headers(self):
        return {"Authorization": f"Bearer {self.access_token}"}

    # ── Projects ──────────────────────────────────────────────────────

    @task(10)
    def list_projects(self):
        """Most common operation — list user's projects."""
        with self.client.get(
            f"{API_PREFIX}/projects/",
            headers=self.auth_headers,
            name="/projects/ [LIST]",
            catch_response=True,
        ) as resp:
            if resp.status_code == 200:
                projects = resp.json()
                # Cache project IDs for subsequent requests
                self.project_ids = [p["id"] for p in projects[:10]]
                resp.success()
            elif resp.status_code == 401:
                resp.failure("Auth expired")
                self.on_start()  # Re-authenticate
            else:
                resp.failure(f"Status {resp.status_code}")

    @task(5)
    def get_project_detail(self):
        """Fetch a single project's details."""
        if not self.project_ids:
            return
        pid = self.project_ids[0]
        self.client.get(
            f"{API_PREFIX}/projects/{pid}",
            headers=self.auth_headers,
            name="/projects/{id} [GET]",
        )

    @task(5)
    def get_project_sensors(self):
        """Fetch sensors linked to a project (tests the N+1 fix)."""
        if not self.project_ids:
            return
        pid = self.project_ids[0]
        self.client.get(
            f"{API_PREFIX}/projects/{pid}/sensors",
            headers=self.auth_headers,
            name="/projects/{id}/sensors [GET]",
        )

    # ── Auth ──────────────────────────────────────────────────────────

    @task(2)
    def check_session(self):
        """Verify token validity."""
        self.client.get(
            f"{API_PREFIX}/auth/me",
            headers=self.auth_headers,
            name="/auth/me [GET]",
        )

    # ── Health ────────────────────────────────────────────────────────

    @task(3)
    def health_check(self):
        """Lightweight health endpoint."""
        self.client.get(
            f"{API_PREFIX}/health",
            name="/health [GET]",
        )

    # ── Things / Sensors ──────────────────────────────────────────────

    @task(4)
    def list_things(self):
        """List sensors for the first project's schema."""
        if not self.project_ids:
            return
        pid = self.project_ids[0]
        self.client.get(
            f"{API_PREFIX}/projects/{pid}/things",
            headers=self.auth_headers,
            name="/projects/{id}/things [LIST]",
        )

    # ── Geospatial ────────────────────────────────────────────────────

    @task(2)
    def list_layers(self):
        """List geospatial layers."""
        self.client.get(
            f"{API_PREFIX}/geospatial/layers",
            headers=self.auth_headers,
            name="/geospatial/layers [LIST]",
        )

    # ── Alerts ────────────────────────────────────────────────────────

    @task(2)
    def list_alerts(self):
        """List alert definitions for a project."""
        if not self.project_ids:
            return
        pid = self.project_ids[0]
        self.client.get(
            f"{API_PREFIX}/alerts/{pid}",
            headers=self.auth_headers,
            name="/alerts/{id} [LIST]",
        )

    # ── SMS (Sensor Management System) ────────────────────────────────

    @task(3)
    def list_sms_sensors(self):
        """List SMS sensors — tests the batch FROST enrichment fix."""
        self.client.get(
            f"{API_PREFIX}/sms/sensors?page=1&page_size=20",
            headers=self.auth_headers,
            name="/sms/sensors [LIST]",
        )


# ── Event Hooks ──────────────────────────────────────────────────────


@events.quitting.add_listener
def on_quitting(environment, **kwargs):
    """Check failure rate and set exit code."""
    stats = environment.stats
    if stats.total.fail_ratio > 0.05:
        logger.error(f"Failure rate {stats.total.fail_ratio:.1%} exceeds 5% threshold")
        environment.process_exit_code = 1
    if stats.total.avg_response_time > 2000:
        logger.error(
            f"Avg response time {stats.total.avg_response_time:.0f}ms exceeds 2s threshold"
        )
        environment.process_exit_code = 1
