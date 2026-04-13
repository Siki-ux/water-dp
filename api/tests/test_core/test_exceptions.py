"""
Additional tests for core exceptions and helper functions.
"""

from fastapi import status

from app.core.exceptions import (
    AppException,
    AuthenticationException,
    AuthorizationException,
    ConflictException,
    GeoServerException,
    RateLimitException,
    TimeSeriesException,
    create_http_exception,
    handle_database_error,
    handle_geoserver_error,
    handle_validation_error,
    handle_water_data_platform_exception,
)


class TestCreateHttpException:
    def test_conflict_exception(self):
        exc = ConflictException(message="Already exists")
        http = create_http_exception(exc)
        assert http.status_code == status.HTTP_409_CONFLICT
        assert http.detail == "Already exists"

    def test_authentication_exception(self):
        exc = AuthenticationException(message="Bad credentials")
        http = create_http_exception(exc)
        assert http.status_code == status.HTTP_401_UNAUTHORIZED

    def test_authorization_exception(self):
        exc = AuthorizationException(message="No access")
        http = create_http_exception(exc)
        assert http.status_code == status.HTTP_403_FORBIDDEN

    def test_rate_limit_exception(self):
        exc = RateLimitException(message="Too many requests")
        http = create_http_exception(exc)
        assert http.status_code == status.HTTP_429_TOO_MANY_REQUESTS

    def test_geoserver_exception(self):
        exc = GeoServerException(message="GeoServer error")
        http = create_http_exception(exc)
        assert http.status_code == status.HTTP_503_SERVICE_UNAVAILABLE

    def test_time_series_exception(self):
        exc = TimeSeriesException(message="TS error")
        http = create_http_exception(exc)
        assert http.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR

    def test_generic_app_exception_fallback(self):
        """Unrecognized AppException subclass returns 500."""

        class CustomException(AppException):
            pass

        exc = CustomException(message="Custom error")
        http = create_http_exception(exc)
        assert http.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR


class TestHandlerFunctions:
    def test_handle_water_data_platform_exception(self):
        exc = ConflictException(message="Conflict!")
        http = handle_water_data_platform_exception(exc)
        assert http.status_code == status.HTTP_409_CONFLICT

    def test_handle_validation_error(self):
        exc = ValueError("Bad input")
        http = handle_validation_error(exc)
        assert http.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
        assert "Bad input" in http.detail

    def test_handle_database_error(self):
        exc = Exception("DB down")
        http = handle_database_error(exc)
        assert http.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR

    def test_handle_geoserver_error(self):
        exc = Exception("GeoServer down")
        http = handle_geoserver_error(exc)
        assert http.status_code == status.HTTP_503_SERVICE_UNAVAILABLE
