"""
Unit tests for SimulatorService focusing on pure-logic methods and
mocked interactions to maximize coverage.
"""

import uuid
from unittest.mock import MagicMock, patch

import pytest

from app.core.exceptions import TimeSeriesException
from app.services.simulator_service import SimulatorService

# ===========================================================================
# _parse_interval_to_seconds
# ===========================================================================


class TestParseIntervalToSeconds:
    def test_integer_passthrough(self):
        assert SimulatorService._parse_interval_to_seconds(30) == 30

    def test_seconds_suffix(self):
        assert SimulatorService._parse_interval_to_seconds("30s") == 30

    def test_minutes_suffix(self):
        assert SimulatorService._parse_interval_to_seconds("2m") == 120

    def test_hours_suffix(self):
        assert SimulatorService._parse_interval_to_seconds("1h") == 3600

    def test_bare_number_string(self):
        assert SimulatorService._parse_interval_to_seconds("45") == 45

    def test_float_seconds(self):
        assert SimulatorService._parse_interval_to_seconds("1.5m") == 90

    def test_empty_string_returns_default(self):
        assert SimulatorService._parse_interval_to_seconds("") == 60

    def test_none_returns_default(self):
        assert SimulatorService._parse_interval_to_seconds(None) == 60

    def test_invalid_string_returns_default(self):
        assert SimulatorService._parse_interval_to_seconds("bad") == 60

    def test_uppercase_suffix_works(self):
        # Should still parse "10S" as seconds after lower()
        assert SimulatorService._parse_interval_to_seconds("10S") == 10

    def test_whitespace_handled(self):
        assert SimulatorService._parse_interval_to_seconds("  5m  ") == 300


# ===========================================================================
# _calculate_min_interval
# ===========================================================================


class TestCalculateMinInterval:
    def test_empty_list_returns_default(self):
        assert SimulatorService._calculate_min_interval([]) == 60

    def test_single_ds(self):
        result = SimulatorService._calculate_min_interval([{"interval": "10s"}])
        assert result == 10

    def test_multiple_ds_returns_minimum(self):
        result = SimulatorService._calculate_min_interval(
            [
                {"interval": "60s"},
                {"interval": "30s"},
                {"interval": "120s"},
            ]
        )
        assert result == 30

    def test_nested_config_key(self):
        result = SimulatorService._calculate_min_interval(
            [
                {"config": {"interval": "15s"}},
            ]
        )
        assert result == 15

    def test_missing_interval_uses_default(self):
        # "60s" is the default interval when key missing
        result = SimulatorService._calculate_min_interval([{"name": "temp"}])
        assert result == 60

    def test_minimum_is_at_least_one(self):
        result = SimulatorService._calculate_min_interval([{"interval": "0s"}])
        assert result == 1


# ===========================================================================
# _format_simulation_output
# ===========================================================================


class TestFormatSimulationOutput:
    def test_basic_output_no_sim(self):
        thing_data = {
            "uuid": "abc-123",
            "id": 1,
            "name": "Simulated Sensor",
            "description": "desc",
            "properties": {},
            "datastreams": [],
        }
        result = SimulatorService._format_simulation_output(
            thing_data=thing_data,
            sim_config=[{"name": "temp", "unit": "C", "interval": "60s"}],
            sim_id="sim-1",
            is_enabled=True,
        )
        assert result["thing_uuid"] == "abc-123"
        assert result["name"] == "Simulated Sensor"
        assert result["is_running"] is True
        assert result["simulation_id"] == "sim-1"

    def test_uses_sim_object_when_provided(self):
        thing_data = {"uuid": "x", "id": 2, "name": "X", "datastreams": []}
        sim = MagicMock()
        sim.config = [{"name": "ph", "unit": "pH"}]
        sim.id = "sim-99"
        sim.is_enabled = False

        result = SimulatorService._format_simulation_output(
            thing_data=thing_data, sim=sim
        )
        assert result["is_running"] is False
        assert result["simulation_id"] == "sim-99"

    def test_location_from_geojson_list(self):
        thing_data = {
            "uuid": "y",
            "datastreams": [],
            "location": {"coordinates": [13.4, 51.5]},
        }
        result = SimulatorService._format_simulation_output(
            thing_data=thing_data, is_enabled=True
        )
        assert result["location"]["lat"] == 51.5
        assert result["location"]["lon"] == 13.4

    def test_location_from_coordinates_dict(self):
        thing_data = {
            "uuid": "z",
            "datastreams": [],
            "location": {"coordinates": {"latitude": 52.0, "longitude": 14.0}},
        }
        result = SimulatorService._format_simulation_output(
            thing_data=thing_data, is_enabled=True
        )
        assert result["location"]["lat"] == 52.0

    def test_location_fallback_from_properties(self):
        thing_data = {
            "uuid": "w",
            "datastreams": [],
            "properties": {"latitude": 48.0, "longitude": 11.0},
        }
        result = SimulatorService._format_simulation_output(
            thing_data=thing_data, is_enabled=True
        )
        assert result["location"]["lat"] == 48.0

    def test_datastreams_merged_with_config(self):
        thing_data = {
            "uuid": "q",
            "datastreams": [
                {
                    "name": "temp",
                    "unit": "C",
                    "label": "Temperature",
                    "properties": None,
                }
            ],
        }
        config = [{"name": "temp", "type": "sine", "range": [0, 30], "interval": "60s"}]
        result = SimulatorService._format_simulation_output(
            thing_data=thing_data,
            sim_config=config,
            is_enabled=True,
        )
        ds = result["datastreams"][0]
        assert ds["name"] == "temp"
        assert ds["config"]["type"] == "sine"

    def test_datastreams_from_config_when_no_tsm(self):
        thing_data = {"uuid": "r", "datastreams": []}
        config = [{"name": "ph", "unit": "pH", "type": "random"}]
        result = SimulatorService._format_simulation_output(
            thing_data=thing_data,
            sim_config=config,
            is_enabled=True,
        )
        assert len(result["datastreams"]) == 1
        assert result["datastreams"][0]["name"] == "ph"


# ===========================================================================
# create_simulated_thing
# ===========================================================================


class TestCreateSimulatedThing:
    @patch("app.services.simulator_service.KeycloakService")
    def test_create_success(self, mock_kc):
        mock_kc.get_group.return_value = {"name": "UFZ-TSM:TestProject"}

        mock_orchestrator = MagicMock()
        thing_uuid = str(uuid.uuid4())
        mock_orchestrator.create_sensor.return_value = {
            "uuid": thing_uuid,
            "id": 1,
            "name": "Simulated: test",
            "datastreams": [],
        }
        SimulatorService.orchestrator = mock_orchestrator

        db = MagicMock()
        db.refresh.side_effect = lambda obj: setattr(obj, "id", "sim-id-1")

        result = SimulatorService.create_simulated_thing(
            db=db,
            sensor_name="test",
            project_group_id="group-1",
            datastreams_config=[{"name": "temp", "unit": "C", "interval": "60s"}],
        )

        assert result["thing_uuid"] == thing_uuid
        db.add.assert_called_once()
        db.commit.assert_called_once()

    @patch("app.services.simulator_service.KeycloakService")
    def test_create_without_keycloak_group(self, mock_kc):
        mock_kc.get_group.return_value = None  # Keycloak group not found

        mock_orchestrator = MagicMock()
        thing_uuid = str(uuid.uuid4())
        mock_orchestrator.create_sensor.return_value = {
            "uuid": thing_uuid,
            "id": 1,
            "name": "Simulated: sensor",
            "datastreams": [],
        }
        SimulatorService.orchestrator = mock_orchestrator

        db = MagicMock()
        db.refresh.side_effect = lambda obj: setattr(obj, "id", "sim-id-2")

        result = SimulatorService.create_simulated_thing(
            db=db,
            sensor_name="sensor",
            project_group_id="group-2",
            datastreams_config=[],
            project_name="fallback_project",
        )
        assert result["thing_uuid"] == thing_uuid

    @patch("app.services.simulator_service.KeycloakService")
    def test_create_raises_when_orchestrator_fails(self, mock_kc):
        mock_kc.get_group.return_value = {"name": "UFZ-TSM:Proj"}

        mock_orchestrator = MagicMock()
        mock_orchestrator.create_sensor.return_value = None  # Indicates failure
        SimulatorService.orchestrator = mock_orchestrator

        db = MagicMock()

        with pytest.raises(TimeSeriesException):
            SimulatorService.create_simulated_thing(
                db=db,
                sensor_name="failing",
                project_group_id="group-3",
                datastreams_config=[],
            )
        db.rollback.assert_called_once()

    @patch("app.services.simulator_service.KeycloakService")
    def test_create_with_thing_properties(self, mock_kc):
        mock_kc.get_group.return_value = {"name": "UFZ-TSM:P"}

        mock_orchestrator = MagicMock()
        thing_uuid = str(uuid.uuid4())
        mock_orchestrator.create_sensor.return_value = {
            "uuid": thing_uuid,
            "id": 5,
            "name": "Simulated: x",
            "datastreams": [],
        }
        SimulatorService.orchestrator = mock_orchestrator

        db = MagicMock()
        db.refresh.side_effect = lambda obj: setattr(obj, "id", "sim-3")

        result = SimulatorService.create_simulated_thing(
            db=db,
            sensor_name="x",
            project_group_id="g",
            datastreams_config=[],
            thing_properties=[{"name": "level", "unit": "m"}],
            location={"lat": 51.0, "lon": 12.0},
            project_schema="user_proj",
        )
        assert result["thing_uuid"] == thing_uuid


# ===========================================================================
# get_all_simulated_things
# ===========================================================================


class TestGetAllSimulatedThings:
    def test_returns_empty_when_no_linked_sensors(self):
        db = MagicMock()
        db.execute.return_value.scalars.return_value.all.return_value = []

        result = SimulatorService.get_all_simulated_things("proj-1", db, "token")
        assert result == []

    def test_returns_empty_when_no_simulations(self):
        db = MagicMock()
        db.execute.return_value.scalars.return_value.all.return_value = ["uuid-1"]
        db.query.return_value.filter.return_value.all.return_value = []  # no sims

        result = SimulatorService.get_all_simulated_things("proj-1", db, "token")
        assert result == []


# ===========================================================================
# delete_simulated_thing
# ===========================================================================


class TestDeleteSimulatedThing:
    def test_delete_success_when_sim_found(self):
        """Delete works when local sim record exists."""
        mock_sim = MagicMock()
        mock_sim.thing_uuid = "thing-uuid-1"

        mock_project = MagicMock()
        mock_project.schema_name = "user_proj"

        db = MagicMock()
        db.query.return_value.filter.return_value.first.side_effect = [
            mock_sim,  # sim lookup
            mock_project,  # project lookup
        ]

        mock_orchestrator = MagicMock()
        mock_orchestrator.delete_sensor.return_value = True
        SimulatorService.orchestrator = mock_orchestrator

        result = SimulatorService.delete_simulated_thing(
            "proj-1", "thing-uuid-1", db, "token"
        )
        assert result is True
        db.delete.assert_called_once_with(mock_sim)
        db.commit.assert_called_once()

    def test_delete_returns_true_when_no_sim(self):
        """Even if no local sim, TSM deletion is attempted."""
        db = MagicMock()
        # sim=None, project=None
        db.query.return_value.filter.return_value.first.return_value = None

        mock_orchestrator = MagicMock()
        mock_orchestrator.delete_sensor.return_value = True
        SimulatorService.orchestrator = mock_orchestrator

        result = SimulatorService.delete_simulated_thing(
            "proj-1", "thing-1", db, "token"
        )
        assert result is True

    def test_delete_returns_false_on_exception(self):
        db = MagicMock()
        db.query.side_effect = Exception("DB failure")

        result = SimulatorService.delete_simulated_thing(
            "proj-1", "bad-id", db, "token"
        )
        assert result is False
