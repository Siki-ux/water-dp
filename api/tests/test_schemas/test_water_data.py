"""Tests for water data schema models."""

from datetime import datetime, timedelta

import pytest
from pydantic import ValidationError

from app.schemas.water_data import (
    BulkDataPointCreate,
    DataPointListResponse,
    DataPointQuery,
    ParameterType,
    QualityFlag,
    StationListResponse,
    StationQuery,
    StationStatistics,
    StationStatus,
    StationType,
    WaterDataPointBase,
    WaterDataPointCreate,
    WaterDataPointResponse,
    WaterDataPointUpdate,
    WaterQualityBase,
    WaterQualityCreate,
    WaterQualityResponse,
    WaterQualityUpdate,
    WaterStationBase,
    WaterStationCreate,
    WaterStationResponse,
    WaterStationUpdate,
)

NOW = datetime(2025, 6, 1, 12, 0, 0)
LATER = NOW + timedelta(hours=1)


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------


class TestEnums:
    def test_station_type_values(self):
        assert StationType.RIVER == "river"
        assert StationType.LAKE == "lake"
        assert StationType.GROUNDWATER == "groundwater"
        assert StationType.RESERVOIR == "reservoir"
        assert StationType.WELL == "well"
        assert StationType.SPRING == "spring"
        assert StationType.DATASET == "dataset"
        assert StationType.UNKNOWN == "unknown"

    def test_station_status_values(self):
        assert StationStatus.ACTIVE == "active"
        assert StationStatus.INACTIVE == "inactive"
        assert StationStatus.MAINTENANCE == "maintenance"
        assert StationStatus.DECOMMISSIONED == "decommissioned"
        assert StationStatus.UNKNOWN == "unknown"

    def test_parameter_type_values(self):
        assert ParameterType.WATER_LEVEL == "water_level"
        assert ParameterType.FLOW_RATE == "flow_rate"
        assert ParameterType.TEMPERATURE == "temperature"
        assert ParameterType.PH == "ph"
        assert ParameterType.DISSOLVED_OXYGEN == "dissolved_oxygen"
        assert ParameterType.TURBIDITY == "turbidity"
        assert ParameterType.CONDUCTIVITY == "conductivity"
        assert ParameterType.PRECIPITATION == "precipitation"
        assert ParameterType.EVAPORATION == "evaporation"

    def test_quality_flag_values(self):
        assert QualityFlag.GOOD == "good"
        assert QualityFlag.QUESTIONABLE == "questionable"
        assert QualityFlag.BAD == "bad"
        assert QualityFlag.MISSING == "missing"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _station_kwargs(**overrides):
    defaults = dict(
        id="frost-1",
        name="Test Station",
        station_type=StationType.RIVER,
    )
    defaults.update(overrides)
    return defaults


def _data_point_kwargs(**overrides):
    defaults = dict(
        timestamp=NOW,
        parameter=ParameterType.WATER_LEVEL,
        value=3.5,
        unit="m",
    )
    defaults.update(overrides)
    return defaults


def _quality_kwargs(**overrides):
    defaults = dict(timestamp=NOW)
    defaults.update(overrides)
    return defaults


# ---------------------------------------------------------------------------
# WaterStation models
# ---------------------------------------------------------------------------


class TestWaterStationBase:
    def test_minimal(self):
        obj = WaterStationBase(**_station_kwargs())
        assert obj.status == StationStatus.ACTIVE
        assert obj.description is None
        assert obj.latitude is None
        assert obj.longitude is None
        assert obj.elevation is None
        assert obj.organization is None
        assert obj.properties is None

    def test_all_fields(self):
        obj = WaterStationBase(
            **_station_kwargs(
                description="desc",
                latitude=60.0,
                longitude=10.0,
                elevation=50.0,
                status=StationStatus.MAINTENANCE,
                organization="org",
                properties={"k": "v"},
            )
        )
        assert obj.latitude == 60.0
        assert obj.organization == "org"

    def test_latitude_bounds(self):
        WaterStationBase(**_station_kwargs(latitude=-90.0))
        WaterStationBase(**_station_kwargs(latitude=90.0))
        with pytest.raises(ValidationError):
            WaterStationBase(**_station_kwargs(latitude=-90.1))
        with pytest.raises(ValidationError):
            WaterStationBase(**_station_kwargs(latitude=90.1))

    def test_longitude_bounds(self):
        WaterStationBase(**_station_kwargs(longitude=-180.0))
        WaterStationBase(**_station_kwargs(longitude=180.0))
        with pytest.raises(ValidationError):
            WaterStationBase(**_station_kwargs(longitude=-180.1))
        with pytest.raises(ValidationError):
            WaterStationBase(**_station_kwargs(longitude=180.1))


class TestWaterStationCreate:
    def test_inherits(self):
        obj = WaterStationCreate(**_station_kwargs())
        assert obj.name == "Test Station"


class TestWaterStationUpdate:
    def test_all_none(self):
        obj = WaterStationUpdate()
        assert obj.name is None
        assert obj.latitude is None
        assert obj.station_type is None
        assert obj.status is None

    def test_partial(self):
        obj = WaterStationUpdate(name="new", status=StationStatus.INACTIVE)
        assert obj.name == "new"

    def test_latitude_bounds_on_update(self):
        WaterStationUpdate(latitude=90.0)
        with pytest.raises(ValidationError):
            WaterStationUpdate(latitude=91.0)

    def test_longitude_bounds_on_update(self):
        WaterStationUpdate(longitude=180.0)
        with pytest.raises(ValidationError):
            WaterStationUpdate(longitude=181.0)


class TestWaterStationResponse:
    def test_valid(self):
        obj = WaterStationResponse(**_station_kwargs(), created_at=NOW, updated_at=NOW)
        assert obj.created_at == NOW


# ---------------------------------------------------------------------------
# WaterDataPoint models
# ---------------------------------------------------------------------------


class TestWaterDataPointBase:
    def test_minimal(self):
        obj = WaterDataPointBase(**_data_point_kwargs())
        assert obj.quality_flag == QualityFlag.GOOD
        assert obj.uncertainty is None
        assert obj.measurement_method is None
        assert obj.properties is None

    def test_all_fields(self):
        obj = WaterDataPointBase(
            **_data_point_kwargs(
                quality_flag=QualityFlag.QUESTIONABLE,
                uncertainty=0.05,
                measurement_method="sensor",
                properties={"calibrated": True},
            )
        )
        assert obj.uncertainty == 0.05
        assert obj.measurement_method == "sensor"


class TestWaterDataPointCreate:
    def test_inherits(self):
        obj = WaterDataPointCreate(**_data_point_kwargs())
        assert obj.value == 3.5


class TestWaterDataPointUpdate:
    def test_all_none(self):
        obj = WaterDataPointUpdate()
        assert obj.value is None
        assert obj.quality_flag is None

    def test_partial(self):
        obj = WaterDataPointUpdate(value=4.0, quality_flag=QualityFlag.BAD)
        assert obj.value == 4.0


class TestWaterDataPointResponse:
    def test_valid(self):
        obj = WaterDataPointResponse(
            **_data_point_kwargs(), id="dp1", created_at=NOW, updated_at=NOW
        )
        assert obj.id == "dp1"


# ---------------------------------------------------------------------------
# WaterQuality models
# ---------------------------------------------------------------------------


class TestWaterQualityBase:
    def test_minimal(self):
        obj = WaterQualityBase(**_quality_kwargs())
        assert obj.temperature is None
        assert obj.ph is None
        assert obj.dissolved_oxygen is None
        assert obj.turbidity is None
        assert obj.conductivity is None
        assert obj.total_dissolved_solids is None
        assert obj.nitrates is None
        assert obj.phosphates is None
        assert obj.bacteria_count is None
        assert obj.overall_quality is None
        assert obj.quality_notes is None

    def test_all_fields(self):
        obj = WaterQualityBase(
            **_quality_kwargs(
                temperature=15.0,
                ph=7.0,
                dissolved_oxygen=8.0,
                turbidity=2.0,
                conductivity=300.0,
                total_dissolved_solids=200.0,
                nitrates=1.0,
                phosphates=0.5,
                bacteria_count=10.0,
                overall_quality="good",
                quality_notes="clear water",
            )
        )
        assert obj.ph == 7.0

    def test_ph_bounds(self):
        WaterQualityBase(**_quality_kwargs(ph=0.0))
        WaterQualityBase(**_quality_kwargs(ph=14.0))
        with pytest.raises(ValidationError):
            WaterQualityBase(**_quality_kwargs(ph=-0.1))
        with pytest.raises(ValidationError):
            WaterQualityBase(**_quality_kwargs(ph=14.1))

    def test_dissolved_oxygen_ge_zero(self):
        WaterQualityBase(**_quality_kwargs(dissolved_oxygen=0.0))
        with pytest.raises(ValidationError):
            WaterQualityBase(**_quality_kwargs(dissolved_oxygen=-1.0))

    def test_turbidity_ge_zero(self):
        WaterQualityBase(**_quality_kwargs(turbidity=0.0))
        with pytest.raises(ValidationError):
            WaterQualityBase(**_quality_kwargs(turbidity=-1.0))

    def test_conductivity_ge_zero(self):
        WaterQualityBase(**_quality_kwargs(conductivity=0.0))
        with pytest.raises(ValidationError):
            WaterQualityBase(**_quality_kwargs(conductivity=-1.0))

    def test_tds_ge_zero(self):
        with pytest.raises(ValidationError):
            WaterQualityBase(**_quality_kwargs(total_dissolved_solids=-1.0))

    def test_nitrates_ge_zero(self):
        with pytest.raises(ValidationError):
            WaterQualityBase(**_quality_kwargs(nitrates=-1.0))

    def test_phosphates_ge_zero(self):
        with pytest.raises(ValidationError):
            WaterQualityBase(**_quality_kwargs(phosphates=-1.0))

    def test_bacteria_count_ge_zero(self):
        with pytest.raises(ValidationError):
            WaterQualityBase(**_quality_kwargs(bacteria_count=-1.0))


class TestWaterQualityCreate:
    def test_inherits(self):
        obj = WaterQualityCreate(**_quality_kwargs(ph=7.0))
        assert obj.ph == 7.0


class TestWaterQualityUpdate:
    def test_all_none(self):
        obj = WaterQualityUpdate()
        assert obj.temperature is None
        assert obj.ph is None

    def test_partial(self):
        obj = WaterQualityUpdate(ph=6.5, turbidity=1.0)
        assert obj.ph == 6.5

    def test_ph_bounds_on_update(self):
        WaterQualityUpdate(ph=0.0)
        WaterQualityUpdate(ph=14.0)
        with pytest.raises(ValidationError):
            WaterQualityUpdate(ph=-0.1)
        with pytest.raises(ValidationError):
            WaterQualityUpdate(ph=14.1)

    def test_negative_fields_on_update(self):
        with pytest.raises(ValidationError):
            WaterQualityUpdate(dissolved_oxygen=-1.0)
        with pytest.raises(ValidationError):
            WaterQualityUpdate(turbidity=-1.0)
        with pytest.raises(ValidationError):
            WaterQualityUpdate(conductivity=-1.0)
        with pytest.raises(ValidationError):
            WaterQualityUpdate(total_dissolved_solids=-1.0)
        with pytest.raises(ValidationError):
            WaterQualityUpdate(nitrates=-1.0)
        with pytest.raises(ValidationError):
            WaterQualityUpdate(phosphates=-1.0)
        with pytest.raises(ValidationError):
            WaterQualityUpdate(bacteria_count=-1.0)


class TestWaterQualityResponse:
    def test_valid(self):
        obj = WaterQualityResponse(
            **_quality_kwargs(), id="wq1", created_at=NOW, updated_at=NOW
        )
        assert obj.id == "wq1"


# ---------------------------------------------------------------------------
# Query models
# ---------------------------------------------------------------------------


class TestStationQuery:
    def test_defaults(self):
        obj = StationQuery()
        assert obj.skip == 0
        assert obj.limit == 100
        assert obj.station_type is None
        assert obj.status is None
        assert obj.organization is None
        assert obj.bbox is None

    def test_custom(self):
        obj = StationQuery(
            skip=10,
            limit=50,
            station_type=StationType.LAKE,
            status=StationStatus.ACTIVE,
            organization="org",
            bbox=[-180.0, -90.0, 180.0, 90.0],
        )
        assert obj.limit == 50
        assert len(obj.bbox) == 4

    def test_limit_bounds(self):
        with pytest.raises(ValidationError):
            StationQuery(limit=0)
        with pytest.raises(ValidationError):
            StationQuery(limit=1001)

    def test_skip_negative(self):
        with pytest.raises(ValidationError):
            StationQuery(skip=-1)


class TestDataPointQuery:
    def test_defaults(self):
        obj = DataPointQuery(id="frost-1")
        assert obj.limit == 1000
        assert obj.start_time is None
        assert obj.end_time is None
        assert obj.parameter is None
        assert obj.quality_filter is None

    def test_custom(self):
        obj = DataPointQuery(
            id="frost-1",
            start_time=NOW,
            end_time=LATER,
            parameter=ParameterType.PH,
            quality_filter=QualityFlag.GOOD,
            limit=500,
        )
        assert obj.parameter == ParameterType.PH

    def test_limit_bounds(self):
        with pytest.raises(ValidationError):
            DataPointQuery(id="f", limit=0)
        with pytest.raises(ValidationError):
            DataPointQuery(id="f", limit=10001)


# ---------------------------------------------------------------------------
# BulkDataPointCreate
# ---------------------------------------------------------------------------


class TestBulkDataPointCreate:
    def test_valid(self):
        points = [WaterDataPointCreate(**_data_point_kwargs()) for _ in range(3)]
        obj = BulkDataPointCreate(data_points=points)
        assert len(obj.data_points) == 3

    def test_exceeds_limit(self):
        points = [
            WaterDataPointCreate(**_data_point_kwargs(value=float(i)))
            for i in range(1001)
        ]
        with pytest.raises(ValidationError, match="1000"):
            BulkDataPointCreate(data_points=points)

    def test_empty_list_valid(self):
        obj = BulkDataPointCreate(data_points=[])
        assert len(obj.data_points) == 0


# ---------------------------------------------------------------------------
# List / statistics responses
# ---------------------------------------------------------------------------


class TestStationListResponse:
    def test_valid(self):
        st = WaterStationResponse(**_station_kwargs(), created_at=NOW, updated_at=NOW)
        obj = StationListResponse(stations=[st], total=1, skip=0, limit=100)
        assert obj.total == 1


class TestDataPointListResponse:
    def test_valid(self):
        dp = WaterDataPointResponse(
            **_data_point_kwargs(), id="dp1", created_at=NOW, updated_at=NOW
        )
        obj = DataPointListResponse(data_points=[dp], total=1, id="frost-1")
        assert obj.parameter is None
        assert obj.time_range is None

    def test_with_optionals(self):
        dp = WaterDataPointResponse(
            **_data_point_kwargs(), id="dp1", created_at=NOW, updated_at=NOW
        )
        obj = DataPointListResponse(
            data_points=[dp],
            total=1,
            id="frost-1",
            parameter="water_level",
            time_range={"start": NOW, "end": LATER},
        )
        assert obj.parameter == "water_level"


class TestStationStatistics:
    def test_valid(self):
        obj = StationStatistics(
            id="frost-1",
            time_range={"start": NOW, "end": LATER},
            parameters=[{"name": "water_level", "count": 100}],
            total_measurements=100,
            data_quality_summary={"good": 90, "bad": 10},
        )
        assert obj.statistics is None

    def test_with_statistics(self):
        obj = StationStatistics(
            id="frost-1",
            time_range={"start": NOW, "end": None},
            parameters=[],
            total_measurements=0,
            data_quality_summary={},
            statistics={"mean": 5.0},
        )
        assert obj.statistics == {"mean": 5.0}
