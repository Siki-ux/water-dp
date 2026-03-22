from unittest.mock import MagicMock, patch

import pytest
import requests

from app.core.exceptions import DatabaseException, GeoServerException
from app.schemas.geospatial import (
    GeoFeatureCreate,
    GeoFeatureUpdate,
    GeoLayerCreate,
    GeoLayerUpdate,
)
from app.services.database_service import DatabaseService
from app.services.geoserver_service import GeoServerService


class TestDatabaseServiceCoverage:
    @pytest.fixture
    def service(self, mock_db_session):
        return DatabaseService(mock_db_session)

    # --- GeoLayer Coverage ---
    def test_create_geo_layer_exception(self, service):
        """Test exception handling during layer creation (rollback)."""
        service.db.commit.side_effect = Exception("DB Error")

        with pytest.raises(DatabaseException) as exc:
            service.create_geo_layer(
                GeoLayerCreate(
                    layer_name="L1",
                    title="T1",
                    store_name="S1",
                    workspace="W1",
                    layer_type="vector",
                    geometry_type="polygon",
                    srs="EPSG:4326",
                )
            )
        assert "Failed to create geo layer" in str(exc.value)
        service.db.rollback.assert_called_once()

    def test_update_geo_layer_exception(self, service):
        """Test exception handling during layer update."""
        # Setup existing layer
        mock_layer = MagicMock()
        service.db.query.return_value.filter.return_value.first.return_value = (
            mock_layer
        )
        service.db.commit.side_effect = Exception("DB Error")

        with pytest.raises(DatabaseException):
            service.update_geo_layer("L1", GeoLayerUpdate(title="New"))
        service.db.rollback.assert_called_once()

    def test_delete_geo_layer_exception(self, service):
        """Test exception handling during layer deletion."""
        mock_layer = MagicMock()
        service.db.query.return_value.filter.return_value.first.return_value = (
            mock_layer
        )
        service.db.commit.side_effect = Exception("DB Error")

        with pytest.raises(DatabaseException):
            service.delete_geo_layer("L1")
        service.db.rollback.assert_called_once()

    # --- GeoFeature Coverage ---
    def test_create_geo_feature_exception(self, service):
        """Test exception handling during feature creation."""
        service.db.commit.side_effect = Exception("DB Error")
        with pytest.raises(DatabaseException):
            service.create_geo_feature(
                GeoFeatureCreate(
                    feature_id="F1",
                    layer_id="L1",
                    feature_type="V",
                    geometry={"type": "Point", "coordinates": [0, 0]},
                    properties={},
                )
            )
        service.db.rollback.assert_called_once()

    def test_update_geo_feature_exception(self, service):
        """Test exception handling during feature update."""
        mock_feature = MagicMock()
        service.db.query.return_value.filter.return_value.first.return_value = (
            mock_feature
        )
        service.db.commit.side_effect = Exception("DB Error")

        with pytest.raises(DatabaseException):
            service.update_geo_feature(
                "F1", "L1", GeoFeatureUpdate(properties={"a": 1})
            )
        service.db.rollback.assert_called_once()

    def test_delete_geo_feature_exception(self, service):
        """Test exception handling during feature deletion."""
        mock_feature = MagicMock()
        service.db.query.return_value.filter.return_value.first.return_value = (
            mock_feature
        )
        service.db.commit.side_effect = Exception("DB Error")

        with pytest.raises(DatabaseException):
            service.delete_geo_feature("F1", "L1")
        service.db.rollback.assert_called_once()

    def test_get_geo_features_bbox_error(self, service):
        """Test invalid BBOX handling (logs warning, doesn't crash)."""
        # Should just return base query if bbox fails
        # Mock query
        service.db.query.return_value.filter.return_value.offset.return_value.limit.return_value.all.return_value = (
            []
        )

        # Invalid BBOX (3 coords)
        res = service.get_geo_features("L1", bbox="10,20,30")
        assert res == []


class TestGeoServerServiceCoverage:
    @pytest.fixture
    def service(self):
        return GeoServerService()

    def test_test_connection_fail(self, service):
        """Test connection failure."""
        with patch("app.services.geoserver_service.requests.request") as mock_req:
            mock_req.side_effect = requests.exceptions.RequestException("Conn Fail")
            assert service.test_connection() is False

    def test_create_workspace_status_paths(self, service):
        """Test different status codes for create_workspace."""
        with patch("app.services.geoserver_service.requests.request") as mock_req:
            # Case: 500 error
            mock_req.return_value.status_code = 500
            mock_req.return_value.raise_for_status.side_effect = (
                requests.exceptions.HTTPError()
            )

            with pytest.raises(GeoServerException):
                service.create_workspace("W2")

    def test_create_datastore_exists(self, service):
        """Test create_datastore when already exists (True return)."""
        with patch("app.services.geoserver_service.requests.request") as mock_req:
            mock_req.return_value.status_code = 200
            assert service.create_datastore("DS1") is True

    def test_create_datastore_fail_status(self, service):
        """Test create_datastore non-200/404."""
        with patch("app.services.geoserver_service.requests.request") as mock_req:
            mock_req.return_value.status_code = 500
            mock_req.return_value.raise_for_status.side_effect = (
                requests.exceptions.HTTPError()
            )

            with pytest.raises(GeoServerException):
                service.create_datastore("DS1")

    def test_publish_sql_view_exists(self, service):
        """Test publish_sql_view when already exists."""
        with patch("app.services.geoserver_service.requests.request") as mock_req:
            mock_req.return_value.status_code = 200
            assert service.publish_sql_view("L1", "S1", "SELECT 1") is True

    def test_publish_sql_view_exception(self, service):
        """Test publish_sql_view exception."""
        with patch("app.services.geoserver_service.requests.request") as mock_req:
            mock_req.side_effect = Exception("Boom")
            with pytest.raises(GeoServerException):
                service.publish_sql_view("L1", "S1", "SELECT 1")

    def test_get_layer_info_fail(self, service):
        """Test get_layer_info failure."""
        with patch("app.services.geoserver_service.requests.request") as mock_req:
            mock_req.side_effect = Exception("Boom")
            with pytest.raises(GeoServerException):
                service.get_layer_info("L1")

    def test_get_layer_capabilities_fail(self, service):
        """Test get_layer_capabilities failure logic (returns dict with wms_available=False)."""
        with patch("app.services.geoserver_service.requests.get") as mock_req:
            mock_req.side_effect = Exception("Boom")
            cap = service.get_layer_capabilities("L1")
            assert cap["wms_available"] is False

    def test_sync_layer_with_database_fail(self, service):
        """Test failure in sync_layer_with_database."""
        with patch.object(
            service, "create_datastore", side_effect=Exception("DB Fail")
        ):
            with pytest.raises(Exception):  # Assuming it re-raises
                service.sync_layer_with_database("L1", "T1")
