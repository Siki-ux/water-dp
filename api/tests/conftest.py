from unittest.mock import MagicMock, PropertyMock, patch

import pytest
from sqlalchemy.orm import Session

from app.core.config import Settings, settings


@pytest.fixture
def mock_db_session():
    """Fixture for mocking SQLAlchemy session."""
    session = MagicMock(spec=Session)
    return session


@pytest.fixture
def mock_settings(monkeypatch):
    """Fixture for mocking application settings."""
    # Create a mock settings object
    mock_env = MagicMock(spec=Settings)
    type(mock_env).geoserver_url = PropertyMock(return_value="http://mock-geoserver")
    type(mock_env).geoserver_username = PropertyMock(return_value="admin")
    type(mock_env).geoserver_password = PropertyMock(return_value="geoserver")
    type(mock_env).geoserver_workspace = PropertyMock(return_value="test_workspace")

    # Patch the global settings object in app.services.geoserver_service
    # We might need to patch it where it is used, or patch the instance itself if possible.
    # Since settings is instantiated in app.core.config, usually tests might override it.
    # However, simple monkeypatching of attribute values on the existing 'settings' object is often easier.

    monkeypatch.setattr(settings, "geoserver_url", "http://mock-geoserver")
    monkeypatch.setattr(settings, "geoserver_username", "admin")
    monkeypatch.setattr(settings, "geoserver_password", "geoserver")
    monkeypatch.setattr(settings, "geoserver_workspace", "test_workspace")

    return settings


@pytest.fixture(autouse=True)
def disable_seeding(monkeypatch):
    """Disable automatic seeding during tests to prevent slow startup."""
    monkeypatch.setattr(settings, "seeding", False)


def pytest_configure(config):
    """Register custom markers."""
    config.addinivalue_line("markers", "api: Mark tests as API tests")
    config.addinivalue_line("markers", "core: Mark tests as Core tests")
    config.addinivalue_line("markers", "services: Mark tests as Service tests")
    config.addinivalue_line("markers", "v1: Mark tests as V1 API tests")


def pytest_collection_modifyitems(items):
    """Add markers based on directory structure."""
    for item in items:
        # Get the test file path
        path = str(item.fspath)

        if "test_api" in path:
            item.add_marker("api")
            item.add_marker("v1")

        if "test_core" in path:
            item.add_marker("core")

        if "test_services" in path:
            item.add_marker("services")


@pytest.fixture
def client(mock_db_session):
    """
    Test client with dependency overrides.
    - Mocks DB session
    - Mocks Authentication (returns admin user)
    - Mocks Authorization (allows all roles)
    """
    from fastapi.testclient import TestClient

    from app.api.deps import get_current_user
    from app.core.database import get_db
    from app.main import app

    # Mock User
    mock_user = {
        "sub": "test-user-id",
        "realm_access": {"roles": ["admin", "default-roles-timeio"]},
    }

    def override_get_db():
        try:
            yield mock_db_session
        finally:
            pass

    def override_get_current_user():
        return mock_user

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = override_get_current_user
    # We need to override the *result* of has_role factory, which is the dependency callable.
    # However, has_role returns a callable. FastAPI uses the result of has_role(role) as the dependency.
    # So we can't easily override the factory itself in dependency_overrides key (which expects the callable).
    # BUT: `has_role("admin")` returns a specific function object.
    # A cleaner way for tests is to mock the `has_role` dependency usage if possible, or since we are mocking `get_current_user`
    # and populating it with "admin" role, the REAL `has_role` implementation should actually work fine!

    # Let's try NOT overriding has_role first, because our mock user HAS the admin role.
    # If the real has_role logic runs:
    # 1. It calls get_current_user (which we overrode).
    # 2. It checks roles.
    # 3. "admin" is in ["admin", ...].
    # So it should pass!

    with patch("app.main.init_db"), TestClient(app) as test_client:
        yield test_client

    app.dependency_overrides.clear()
