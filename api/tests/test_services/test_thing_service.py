"""
Unit tests for ThingService.
Mocks frost_client and TimeIODatabase to test service logic.
"""

from unittest.mock import MagicMock, patch

import pytest

from app.core.exceptions import ResourceNotFoundException


# Patch at module level to avoid real connections when importing ThingService
@pytest.fixture
def thing_service():
    """Return a ThingService with mocked deps."""
    with (
        patch("app.services.thing_service.TimeIODatabase"),
        patch(
            "app.services.thing_service.get_cached_frost_client"
        ) as mock_frost_factory,
        patch("app.services.thing_service.settings") as mock_settings,
    ):
        mock_settings.frost_url = "http://frost:8080"
        mock_settings.frost_version = "v1.1"
        mock_settings.frost_server = "frost"

        mock_frost_client = MagicMock()
        mock_frost_factory.return_value = mock_frost_client

        from app.services.thing_service import ThingService

        svc = ThingService("user_testproject")
        svc.frost_client = mock_frost_client
        svc.timeio_db = MagicMock()
        return svc


class TestThingServiceInit:
    def test_schema_name_set(self, thing_service):
        assert thing_service.schema_name == "user_testproject"

    def test_mqtt_client_lazy(self, thing_service):
        """mqtt property should create client on first access."""
        with patch("app.services.thing_service.MQTTClient") as MockMQTT:
            client = thing_service.mqtt
            assert client is MockMQTT.return_value
            # Second access returns same instance
            assert thing_service.mqtt is MockMQTT.return_value


class TestGetThingIdFromUuid:
    def test_delegates_to_timeio_db(self, thing_service):
        thing_service.timeio_db.get_thing_id_from_uuid.return_value = "42"
        assert thing_service.get_thing_id_from_uuid("some-uuid") == "42"


class TestGetThing:
    def test_raises_when_thing_not_found_in_db(self, thing_service):
        thing_service.timeio_db.get_thing_id_from_uuid.return_value = None

        with pytest.raises(ResourceNotFoundException):
            thing_service.get_thing("missing-uuid")

    def test_returns_none_when_frost_returns_nothing(self, thing_service):
        thing_service.timeio_db.get_thing_id_from_uuid.return_value = "1"
        thing_service.frost_client.get_thing.return_value = None

        result = thing_service.get_thing("some-uuid")
        assert result is None

    def test_returns_thing_on_success(self, thing_service):
        thing_service.timeio_db.get_thing_id_from_uuid.return_value = "1"
        frost_data = {
            "@iot.id": 1,
            "name": "Sensor1",
            "Locations": [],
            "Datastreams": [],
        }
        thing_service.frost_client.get_thing.return_value = frost_data

        from app.schemas.frost.thing import Thing

        with patch.object(
            Thing, "from_frost", return_value=MagicMock()
        ) as mock_from_frost:
            thing_service.get_thing("abc")
            mock_from_frost.assert_called_once_with(frost_data)


class TestGetThings:
    def test_returns_empty_list_when_no_things(self, thing_service):
        thing_service.frost_client.get_things.return_value = []

        result = thing_service.get_things()
        assert result == []

    def test_converts_frost_data(self, thing_service):
        frost_data = [{"@iot.id": 1, "name": "S1", "Locations": [], "Datastreams": []}]
        thing_service.frost_client.get_things.return_value = frost_data

        from app.schemas.frost.thing import Thing

        mock_thing = MagicMock()
        with patch.object(Thing, "from_frost", return_value=mock_thing):
            result = thing_service.get_things()
            assert len(result) == 1


class TestGetAllThingsStatic:
    def test_returns_empty_when_no_data(self):
        with (
            patch("app.services.thing_service.get_cached_frost_client") as mock_factory,
            patch("app.services.thing_service.settings") as mock_settings,
        ):
            mock_settings.frost_url = "http://frost:8080"
            mock_settings.frost_version = "v1.1"
            mock_settings.frost_server = "frost"

            mock_fc = MagicMock()
            mock_fc.get_things.return_value = []
            mock_factory.return_value = mock_fc

            from app.services.thing_service import ThingService

            result = ThingService.get_all_things("user_proj")
            assert result == []


class TestGetDatastreams:
    def test_returns_empty_when_none(self, thing_service):
        thing_service.frost_client.get_datastreams.return_value = []

        result = thing_service.get_datastreams()
        assert result == []

    def test_converts_frost_datastreams(self, thing_service):
        frost_ds = [
            {"@iot.id": 1, "name": "Temperature", "unitOfMeasurement": {"name": "C"}}
        ]
        thing_service.frost_client.get_datastreams.return_value = frost_ds

        from app.schemas.frost.datastream import Datastream

        with patch.object(Datastream, "from_frost", return_value=MagicMock()):
            result = thing_service.get_datastreams()
            assert len(result) == 1


class TestGetSensorDatastreams:
    def test_raises_when_thing_not_found(self, thing_service):
        thing_service.timeio_db.get_thing_id_from_uuid.return_value = None

        with pytest.raises(ResourceNotFoundException):
            thing_service.get_sensor_datastreams("missing")

    def test_returns_empty_list_when_no_datastreams(self, thing_service):
        thing_service.timeio_db.get_thing_id_from_uuid.return_value = "5"
        thing_service.frost_client.list_datastreams.return_value = []

        result = thing_service.get_sensor_datastreams("uuid-1")
        assert result == []


class TestGetSensorDatastream:
    def test_raises_when_thing_not_found(self, thing_service):
        thing_service.timeio_db.get_thing_id_from_uuid.return_value = None

        with pytest.raises(ResourceNotFoundException):
            thing_service.get_sensor_datastream("missing", "Temperature")

    def test_returns_none_when_no_datastreams(self, thing_service):
        thing_service.timeio_db.get_thing_id_from_uuid.return_value = "5"
        thing_service.frost_client.list_datastreams.return_value = []

        result = thing_service.get_sensor_datastream("uuid-1", "Temp")
        assert result is None

    def test_returns_none_when_name_not_found(self, thing_service):
        thing_service.timeio_db.get_thing_id_from_uuid.return_value = "5"
        thing_service.frost_client.list_datastreams.return_value = [
            {"name": "pH", "@iot.id": 1, "unitOfMeasurement": {"name": "pH"}}
        ]

        result = thing_service.get_sensor_datastream("uuid-1", "Temperature")
        assert result is None

    def test_returns_datastream_when_found(self, thing_service):
        thing_service.timeio_db.get_thing_id_from_uuid.return_value = "5"
        frost_ds = {
            "name": "Temperature",
            "@iot.id": 2,
            "unitOfMeasurement": {"name": "C"},
        }
        thing_service.frost_client.list_datastreams.return_value = [frost_ds]

        from app.schemas.frost.datastream import Datastream

        mock_ds = MagicMock()
        with patch.object(Datastream, "from_frost", return_value=mock_ds):
            result = thing_service.get_sensor_datastream("uuid-1", "Temperature")
            assert result is mock_ds


class TestGetObservations:
    def test_returns_empty_list_when_none(self, thing_service):
        thing_service.frost_client.get_observations.return_value = []

        result = thing_service.get_observations("ds-uuid")
        assert result == []

    def test_converts_observations(self, thing_service):
        frost_obs = [{"phenomenonTime": "2024-01-01T00:00:00Z", "result": 20.5}]
        thing_service.frost_client.get_observations.return_value = frost_obs

        from app.schemas.frost.datastream import Observation

        with patch.object(Observation, "from_frost", return_value=MagicMock()):
            result = thing_service.get_observations("ds-uuid")
            assert len(result) == 1


class TestGetObservationsByName:
    def test_returns_empty_when_no_datastreams(self, thing_service):
        thing_service.timeio_db.get_thing_id_from_uuid.return_value = "1"
        thing_service.frost_client.list_datastreams.return_value = []

        result = thing_service.get_observations_by_name_from_sensor_uuid(
            "uuid-1", "Temperature"
        )
        assert result == []

    def test_returns_empty_when_name_not_matched(self, thing_service):
        thing_service.timeio_db.get_thing_id_from_uuid.return_value = "1"
        thing_service.frost_client.list_datastreams.return_value = [
            {"name": "pH", "@iot.id": 1, "unitOfMeasurement": {"name": "pH"}}
        ]

        from app.schemas.frost.datastream import Datastream

        mock_ds = MagicMock()
        mock_ds.name = "pH"
        with patch.object(Datastream, "from_frost", return_value=mock_ds):
            result = thing_service.get_observations_by_name_from_sensor_uuid(
                "uuid-1", "Temperature"
            )
            assert result == []


class TestGetLocations:
    def test_returns_empty_when_no_locations(self, thing_service):
        thing_service.frost_client.get_locations.return_value = []

        result = thing_service.get_locations()
        assert result == []

    def test_converts_locations(self, thing_service):
        frost_locs = [
            {
                "@iot.id": 1,
                "name": "Station1",
                "location": {"type": "Point", "coordinates": [13.4, 51.5]},
            }
        ]
        thing_service.frost_client.get_locations.return_value = frost_locs

        from app.schemas.frost.thing import Location

        with patch.object(Location, "from_frost", return_value=MagicMock()):
            result = thing_service.get_locations()
            assert len(result) == 1
