from unittest.mock import MagicMock, patch

from app.core.exceptions import DatabaseException, ResourceNotFoundException


def test_create_geo_layer(client):
    from datetime import datetime

    data = {
        "layer_name": "NewLayer",
        "title": "NL",
        "store_name": "S",
        "workspace": "W",
        "layer_type": "vector",
        "geometry_type": "polygon",
        "srs": "EPSG:4326",
    }

    mock_layer = MagicMock(
        id=1,
        layer_name="NewLayer",
        title="NL",
        store_name="S",
        workspace="W",
        layer_type="vector",
        geometry_type="polygon",
        srs="EPSG:4326",
        is_published=True,
        is_public=False,
        properties=None,
        style_config=None,
        data_source=None,
        data_format=None,
        style_name=None,
        description=None,
        created_at=datetime.now(),
        updated_at=datetime.now(),
    )

    with patch("app.api.v1.endpoints.geospatial.DatabaseService") as MockService:
        MockService.return_value.create_geo_layer.return_value = mock_layer

        # Override admin requirement
        from app.api.deps import has_role
        from app.main import app

        app.dependency_overrides[has_role("admin")] = lambda: {"sub": "admin"}

        response = client.post("/api/v1/geospatial/layers", json=data)

        # Cleanup override
        app.dependency_overrides.pop(has_role("admin"), None)

        assert response.status_code == 201
        assert response.json()["layer_name"] == "NewLayer"


def test_get_geo_layers(client):
    """Test that get_geo_layers returns layers from DB + GeoServer merge."""
    from app.api.deps import get_db
    from app.main import app

    # Mock DB session that returns no layers
    mock_db = MagicMock()
    mock_db.query.return_value.filter.return_value.all.return_value = []
    mock_db.query.return_value.all.return_value = []

    app.dependency_overrides[get_db] = lambda: mock_db

    with patch("app.api.v1.endpoints.geospatial.GeoServerService") as MockGeoService:
        MockGeoService.return_value.get_layers.return_value = []

        response = client.get("/api/v1/geospatial/layers")
        assert response.status_code == 200
        assert response.json()["total"] == 0

    app.dependency_overrides.pop(get_db, None)


def test_get_geo_layer_not_found(client):
    with patch("app.api.v1.endpoints.geospatial.DatabaseService") as MockService:
        MockService.return_value.get_geo_layer.side_effect = ResourceNotFoundException(
            "Not found"
        )

        response = client.get("/api/v1/geospatial/layers/MISSING")
        assert response.status_code == 404


def test_create_geo_feature_error(client):
    data = {
        "feature_id": "F1",
        "layer_id": "L1",
        "feature_type": "V",
        "geometry": {"type": "Point", "coordinates": [0, 0]},
        "properties": {},
    }
    with patch("app.api.v1.endpoints.geospatial.DatabaseService") as MockService:
        MockService.return_value.create_geo_feature.side_effect = DatabaseException(
            "DB Fail"
        )

        from app.api.deps import get_current_user
        from app.main import app

        app.dependency_overrides[get_current_user] = lambda: {"sub": "user-1"}

        response = client.post("/api/v1/geospatial/features", json=data)

        app.dependency_overrides.pop(get_current_user, None)

        assert response.status_code == 500
        assert response.json()["error"]["message"] == "DB Fail"
