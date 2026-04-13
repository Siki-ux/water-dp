"""Tests for time series schema models."""

from datetime import datetime, timedelta

import pytest
from pydantic import ValidationError

from app.schemas.time_series import (
    AggregatedDataPoint,
    AggregatedTimeSeriesResponse,
    AggregationInterval,
    AggregationMethod,
    BulkTimeSeriesDataCreate,
    DataType,
    InterpolatedDataPoint,
    InterpolationRequest,
    InterpolationResponse,
    QualityLevel,
    SourceType,
    StationBase,
    StationCreate,
    StationResponse,
    StationUpdate,
    TimeSeriesAggregation,
    TimeSeriesDataBase,
    TimeSeriesDataCreate,
    TimeSeriesDataResponse,
    TimeSeriesDataUpdate,
    TimeSeriesListResponse,
    TimeSeriesMetadataBase,
    TimeSeriesMetadataCreate,
    TimeSeriesMetadataListResponse,
    TimeSeriesMetadataResponse,
    TimeSeriesMetadataUpdate,
    TimeSeriesQuery,
    TimeSeriesStatistics,
)

NOW = datetime(2025, 6, 1, 12, 0, 0)
LATER = NOW + timedelta(hours=1)
EARLIER = NOW - timedelta(hours=1)


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------


class TestEnums:
    def test_source_type_values(self):
        assert SourceType.SENSOR == "sensor"
        assert SourceType.MODEL == "model"
        assert SourceType.MANUAL == "manual"
        assert SourceType.CALCULATED == "calculated"
        assert SourceType.EXTERNAL == "external"

    def test_data_type_values(self):
        assert DataType.CONTINUOUS == "continuous"
        assert DataType.DISCRETE == "discrete"
        assert DataType.EVENT == "event"

    def test_quality_level_values(self):
        assert QualityLevel.RAW == "raw"
        assert QualityLevel.PROCESSED == "processed"
        assert QualityLevel.VALIDATED == "validated"
        assert QualityLevel.QUALITY_CONTROLLED == "quality_controlled"

    def test_aggregation_method_values(self):
        assert AggregationMethod.MEAN == "mean"
        assert AggregationMethod.AVG == "avg"
        assert AggregationMethod.MAX == "max"
        assert AggregationMethod.MIN == "min"
        assert AggregationMethod.SUM == "sum"
        assert AggregationMethod.COUNT == "count"
        assert AggregationMethod.STD == "std"
        assert AggregationMethod.MEDIAN == "median"
        assert AggregationMethod.PERCENTILE == "percentile"

    def test_aggregation_interval_values(self):
        assert AggregationInterval.MINUTE_1 == "1min"
        assert AggregationInterval.MINUTE_5 == "5min"
        assert AggregationInterval.MINUTE_15 == "15min"
        assert AggregationInterval.MINUTE_30 == "30min"
        assert AggregationInterval.HOUR_1 == "1h"
        assert AggregationInterval.HOUR_6 == "6h"
        assert AggregationInterval.HOUR_12 == "12h"
        assert AggregationInterval.DAY_1 == "1D"
        assert AggregationInterval.WEEK_1 == "1W"
        assert AggregationInterval.MONTH_1 == "1M"
        assert AggregationInterval.YEAR_1 == "1Y"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _metadata_kwargs(**overrides):
    defaults = dict(
        series_id="s1",
        name="Test Series",
        source_type=SourceType.SENSOR,
        start_time=NOW,
        parameter="water_level",
        unit="m",
        data_type=DataType.CONTINUOUS,
    )
    defaults.update(overrides)
    return defaults


def _data_kwargs(**overrides):
    defaults = dict(series_id="s1", timestamp=NOW, value=1.5)
    defaults.update(overrides)
    return defaults


# ---------------------------------------------------------------------------
# TimeSeriesMetadata models
# ---------------------------------------------------------------------------


class TestTimeSeriesMetadataBase:
    def test_minimal_valid(self):
        obj = TimeSeriesMetadataBase(**_metadata_kwargs())
        assert obj.series_id == "s1"
        assert obj.quality_level == QualityLevel.RAW
        assert obj.time_zone == "UTC"
        assert obj.description is None
        assert obj.source_id is None
        assert obj.station_id is None
        assert obj.end_time is None
        assert obj.sampling_rate is None
        assert obj.processing_notes is None
        assert obj.properties is None

    def test_all_optional_fields(self):
        obj = TimeSeriesMetadataBase(
            **_metadata_kwargs(
                description="desc",
                source_id="src1",
                station_id="st1",
                end_time=LATER,
                time_zone="US/Eastern",
                sampling_rate="15min",
                quality_level=QualityLevel.VALIDATED,
                processing_notes="notes",
                properties={"key": "val"},
            )
        )
        assert obj.description == "desc"
        assert obj.source_id == "src1"
        assert obj.station_id == "st1"
        assert obj.end_time == LATER
        assert obj.time_zone == "US/Eastern"
        assert obj.sampling_rate == "15min"
        assert obj.quality_level == QualityLevel.VALIDATED
        assert obj.processing_notes == "notes"
        assert obj.properties == {"key": "val"}


class TestTimeSeriesMetadataCreate:
    def test_inherits_base(self):
        obj = TimeSeriesMetadataCreate(**_metadata_kwargs())
        assert obj.series_id == "s1"


class TestTimeSeriesMetadataUpdate:
    def test_all_none(self):
        obj = TimeSeriesMetadataUpdate()
        assert obj.name is None
        assert obj.description is None
        assert obj.end_time is None
        assert obj.quality_level is None
        assert obj.processing_notes is None
        assert obj.properties is None

    def test_partial_update(self):
        obj = TimeSeriesMetadataUpdate(name="new", quality_level=QualityLevel.PROCESSED)
        assert obj.name == "new"
        assert obj.quality_level == QualityLevel.PROCESSED


class TestTimeSeriesMetadataResponse:
    def test_valid(self):
        obj = TimeSeriesMetadataResponse(
            **_metadata_kwargs(), id=1, created_at=NOW, updated_at=NOW
        )
        assert obj.id == 1
        assert obj.created_at == NOW


# ---------------------------------------------------------------------------
# TimeSeriesData models
# ---------------------------------------------------------------------------


class TestTimeSeriesDataBase:
    def test_minimal(self):
        obj = TimeSeriesDataBase(**_data_kwargs())
        assert obj.quality_flag == "good"
        assert obj.is_interpolated is False
        assert obj.is_aggregated is False
        assert obj.uncertainty is None
        assert obj.aggregation_method is None
        assert obj.properties is None

    def test_all_fields(self):
        obj = TimeSeriesDataBase(
            **_data_kwargs(
                quality_flag="suspect",
                uncertainty=0.1,
                is_interpolated=True,
                is_aggregated=True,
                aggregation_method="mean",
                properties={"k": "v"},
            )
        )
        assert obj.quality_flag == "suspect"
        assert obj.uncertainty == 0.1
        assert obj.is_interpolated is True
        assert obj.is_aggregated is True
        assert obj.aggregation_method == "mean"


class TestTimeSeriesDataCreate:
    def test_inherits_base(self):
        obj = TimeSeriesDataCreate(**_data_kwargs())
        assert obj.value == 1.5


class TestTimeSeriesDataUpdate:
    def test_all_none(self):
        obj = TimeSeriesDataUpdate()
        assert obj.value is None

    def test_partial(self):
        obj = TimeSeriesDataUpdate(value=2.0, quality_flag="bad")
        assert obj.value == 2.0
        assert obj.quality_flag == "bad"


class TestTimeSeriesDataResponse:
    def test_valid(self):
        obj = TimeSeriesDataResponse(
            **_data_kwargs(), id=1, created_at=NOW, updated_at=NOW
        )
        assert obj.id == 1


# ---------------------------------------------------------------------------
# TimeSeriesQuery - including time range validator
# ---------------------------------------------------------------------------


class TestTimeSeriesQuery:
    def test_defaults(self):
        obj = TimeSeriesQuery(series_id="s1")
        assert obj.limit == 1000
        assert obj.offset == 0
        assert obj.include_interpolated is True
        assert obj.include_aggregated is True
        assert obj.sort_order == "asc"
        assert obj.quality_filter is None

    def test_valid_time_range(self):
        obj = TimeSeriesQuery(series_id="s1", start_time=EARLIER, end_time=NOW)
        assert obj.end_time == NOW

    def test_end_before_start_raises(self):
        with pytest.raises(ValidationError, match="end_time must be after start_time"):
            TimeSeriesQuery(series_id="s1", start_time=NOW, end_time=EARLIER)

    def test_end_equal_start_raises(self):
        with pytest.raises(ValidationError, match="end_time must be after start_time"):
            TimeSeriesQuery(series_id="s1", start_time=NOW, end_time=NOW)

    def test_end_without_start_ok(self):
        obj = TimeSeriesQuery(series_id="s1", end_time=NOW)
        assert obj.end_time == NOW

    def test_limit_bounds(self):
        with pytest.raises(ValidationError):
            TimeSeriesQuery(series_id="s1", limit=0)
        with pytest.raises(ValidationError):
            TimeSeriesQuery(series_id="s1", limit=100001)

    def test_offset_negative(self):
        with pytest.raises(ValidationError):
            TimeSeriesQuery(series_id="s1", offset=-1)

    def test_sort_order_invalid(self):
        with pytest.raises(ValidationError):
            TimeSeriesQuery(series_id="s1", sort_order="random")

    def test_sort_order_desc(self):
        obj = TimeSeriesQuery(series_id="s1", sort_order="desc")
        assert obj.sort_order == "desc"


# ---------------------------------------------------------------------------
# TimeSeriesAggregation
# ---------------------------------------------------------------------------


class TestTimeSeriesAggregation:
    def test_valid(self):
        obj = TimeSeriesAggregation(
            series_id="s1",
            start_time=EARLIER,
            end_time=NOW,
            aggregation_method=AggregationMethod.MEAN,
            aggregation_interval=AggregationInterval.HOUR_1,
        )
        assert obj.time_zone == "UTC"
        assert obj.include_metadata is True

    def test_end_before_start_raises(self):
        with pytest.raises(ValidationError, match="end_time must be after start_time"):
            TimeSeriesAggregation(
                series_id="s1",
                start_time=NOW,
                end_time=EARLIER,
                aggregation_method=AggregationMethod.MEAN,
                aggregation_interval=AggregationInterval.HOUR_1,
            )

    def test_end_equal_start_raises(self):
        with pytest.raises(ValidationError, match="end_time must be after start_time"):
            TimeSeriesAggregation(
                series_id="s1",
                start_time=NOW,
                end_time=NOW,
                aggregation_method=AggregationMethod.MEAN,
                aggregation_interval=AggregationInterval.HOUR_1,
            )


# ---------------------------------------------------------------------------
# BulkTimeSeriesDataCreate
# ---------------------------------------------------------------------------


class TestBulkTimeSeriesDataCreate:
    def test_valid(self):
        points = [
            TimeSeriesDataCreate(**_data_kwargs(timestamp=NOW + timedelta(minutes=i)))
            for i in range(3)
        ]
        obj = BulkTimeSeriesDataCreate(series_id="s1", data_points=points)
        assert len(obj.data_points) == 3

    def test_exceeds_limit(self):
        points = [
            TimeSeriesDataCreate(**_data_kwargs(timestamp=NOW + timedelta(seconds=i)))
            for i in range(10001)
        ]
        with pytest.raises(ValidationError, match="10000"):
            BulkTimeSeriesDataCreate(series_id="s1", data_points=points)

    def test_empty_list_valid(self):
        obj = BulkTimeSeriesDataCreate(series_id="s1", data_points=[])
        assert len(obj.data_points) == 0


# ---------------------------------------------------------------------------
# List / aggregated responses
# ---------------------------------------------------------------------------


class TestTimeSeriesListResponse:
    def test_valid(self):
        dp = TimeSeriesDataResponse(
            **_data_kwargs(), id=1, created_at=NOW, updated_at=NOW
        )
        obj = TimeSeriesListResponse(data_points=[dp], total=1, series_id="s1")
        assert obj.total == 1
        assert obj.time_range is None
        assert obj.aggregation_info is None


class TestTimeSeriesMetadataListResponse:
    def test_valid(self):
        m = TimeSeriesMetadataResponse(
            **_metadata_kwargs(), id=1, created_at=NOW, updated_at=NOW
        )
        obj = TimeSeriesMetadataListResponse(series=[m], total=1, skip=0, limit=10)
        assert obj.total == 1


class TestAggregatedDataPoint:
    def test_valid(self):
        obj = AggregatedDataPoint(
            timestamp=NOW,
            value=5.0,
            count=10,
            aggregation_method="mean",
            aggregation_interval="1h",
            quality_flags=["good", "suspect"],
        )
        assert obj.min is None
        assert obj.max is None
        assert obj.avg is None
        assert obj.metadata is None

    def test_all_optional(self):
        obj = AggregatedDataPoint(
            timestamp=NOW,
            value=5.0,
            count=10,
            aggregation_method="mean",
            aggregation_interval="1h",
            quality_flags=["good"],
            min=1.0,
            max=9.0,
            avg=5.0,
            metadata={"key": "val"},
        )
        assert obj.min == 1.0
        assert obj.max == 9.0


class TestInterpolatedDataPoint:
    def test_valid(self):
        obj = InterpolatedDataPoint(
            timestamp=NOW, value=3.0, is_interpolated=True, quality_flag="good"
        )
        assert obj.properties is None

    def test_with_properties(self):
        obj = InterpolatedDataPoint(
            timestamp=NOW,
            value=3.0,
            is_interpolated=False,
            quality_flag="good",
            properties={"method": "linear"},
        )
        assert obj.properties == {"method": "linear"}


class TestAggregatedTimeSeriesResponse:
    def test_valid(self):
        dp = AggregatedDataPoint(
            timestamp=NOW,
            value=5.0,
            count=10,
            aggregation_method="mean",
            aggregation_interval="1h",
            quality_flags=["good"],
        )
        obj = AggregatedTimeSeriesResponse(
            series_id="s1",
            aggregation_method="mean",
            aggregation_interval="1h",
            time_range={"start": EARLIER, "end": NOW},
            data_points=[dp],
            total_points=1,
        )
        assert obj.metadata is None


class TestTimeSeriesStatistics:
    def test_valid(self):
        obj = TimeSeriesStatistics(
            series_id="s1",
            time_range={"start": EARLIER, "end": NOW},
            total_points=100,
            statistics={"mean": 5.0, "std": 1.2},
            quality_summary={"good": 90, "bad": 10},
            gaps=[{"start": EARLIER, "end": NOW}],
        )
        assert obj.metadata is None


# ---------------------------------------------------------------------------
# Interpolation
# ---------------------------------------------------------------------------


class TestInterpolationRequest:
    def test_defaults(self):
        obj = InterpolationRequest(series_id="s1", start_time=EARLIER, end_time=NOW)
        assert obj.method == "linear"
        assert obj.interval == AggregationInterval.HOUR_1
        assert obj.fill_gaps is True
        assert obj.max_gap_duration is None

    def test_custom(self):
        obj = InterpolationRequest(
            series_id="s1",
            start_time=EARLIER,
            end_time=NOW,
            method="cubic",
            interval=AggregationInterval.MINUTE_15,
            fill_gaps=False,
            max_gap_duration="6h",
        )
        assert obj.method == "cubic"
        assert obj.max_gap_duration == "6h"


class TestInterpolationResponse:
    def test_valid(self):
        dp = InterpolatedDataPoint(
            timestamp=NOW, value=3.0, is_interpolated=True, quality_flag="good"
        )
        obj = InterpolationResponse(
            series_id="s1",
            interpolated_data=[dp],
            method="linear",
            interval="1h",
            gaps_filled=2,
            metadata={"info": "test"},
        )
        assert obj.gaps_filled == 2


# ---------------------------------------------------------------------------
# Station models
# ---------------------------------------------------------------------------


class TestStationBase:
    def test_minimal(self):
        obj = StationBase(name="St1", station_id="sid1")
        assert obj.station_type == "unknown"
        assert obj.status == "unknown"
        assert obj.description is None
        assert obj.organization is None
        assert obj.latitude is None
        assert obj.longitude is None
        assert obj.elevation is None
        assert obj.properties is None

    def test_all_fields(self):
        obj = StationBase(
            name="St1",
            station_id="sid1",
            description="d",
            station_type="river",
            status="active",
            organization="org",
            latitude=60.0,
            longitude=10.0,
            elevation=100.0,
            properties={"k": "v"},
        )
        assert obj.latitude == 60.0

    def test_name_min_length(self):
        with pytest.raises(ValidationError):
            StationBase(name="", station_id="sid1")

    def test_name_max_length(self):
        with pytest.raises(ValidationError):
            StationBase(name="x" * 256, station_id="sid1")


class TestStationCreate:
    def test_inherits(self):
        obj = StationCreate(name="St1", station_id="sid1")
        assert obj.name == "St1"


class TestStationUpdate:
    def test_all_none(self):
        obj = StationUpdate()
        assert obj.name is None

    def test_partial(self):
        obj = StationUpdate(name="new", latitude=55.0)
        assert obj.name == "new"


class TestStationResponse:
    def test_valid(self):
        obj = StationResponse(
            name="St1",
            station_id="sid1",
            id=1,
            created_at=NOW,
            updated_at=NOW,
        )
        assert obj.is_active is False
        assert obj.last_activity is None
