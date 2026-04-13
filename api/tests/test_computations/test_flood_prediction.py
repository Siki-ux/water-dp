"""
Tests for flood_prediction computation script.
"""

from unittest.mock import MagicMock

from app.computations.flood_prediction import run


def _make_ctx(params=None, sensor_data=None):
    ctx = MagicMock()
    ctx.params = params or {}
    if sensor_data is not None:
        ctx.get_sensor_data.return_value = sensor_data
    else:
        ctx.get_sensor_data.return_value = []
    return ctx


class TestFloodPrediction:
    def test_normal_risk_low_water(self):
        ctx = _make_ctx(params={"water_level": 50.0})
        result = run(ctx)
        assert result["prediction"] == "NORMAL"
        assert result["risk_score"] == 10.0
        assert result["source"] == "simulation"

    def test_medium_risk_water_over_100(self):
        ctx = _make_ctx(params={"water_level": 120.0})
        result = run(ctx)
        assert result["risk_score"] == 40.0
        assert result["prediction"] == "NORMAL"

    def test_high_risk_water_over_150(self):
        ctx = _make_ctx(params={"water_level": 155.0})
        result = run(ctx)
        assert result["risk_score"] == 80.0
        assert result["prediction"] == "FLOOD"
        # Critical alert should be triggered
        ctx.alert.assert_called()
        call_kwargs = ctx.alert.call_args[1]
        assert call_kwargs["severity"] == "critical"

    def test_flood_risk_between_75_and_150(self):
        # risk_score > 50 but <= 75 → "warning" alert
        ctx = _make_ctx(params={"water_level": 110.0})
        result = run(ctx)
        # 40.0 risk score → no alert triggered (not > 50)
        assert result["prediction"] == "NORMAL"

    def test_no_params_uses_default_location(self):
        """When no params, location_id defaults to '1' and tries sensor fetch."""
        ctx = _make_ctx(params={}, sensor_data=[{"value": "130.0"}])
        result = run(ctx)
        assert result["location_id"] == "1"
        assert result["source"] == "sensor"
        assert result["input_level"] == 130.0

    def test_sensor_fetch_exception_uses_simulation(self):
        """If sensor fetch fails, falls back to simulated water level."""
        ctx = _make_ctx(params={"location_id": "station-1"})
        ctx.get_sensor_data.side_effect = Exception("FROST down")
        result = run(ctx)
        assert result["source"] == "simulation"
        assert result["input_level"] is not None

    def test_sensor_fetch_no_data_uses_simulation(self):
        ctx = _make_ctx(params={"location_id": "station-1"}, sensor_data=[])
        result = run(ctx)
        assert result["source"] == "simulation"

    def test_sensor_data_value_is_none(self):
        """Sensor data with None value falls back to simulation."""
        ctx = _make_ctx(
            params={"location_id": "station-1"},
            sensor_data=[{"value": None}],
        )
        result = run(ctx)
        assert result["source"] == "simulation"

    def test_result_structure(self):
        ctx = _make_ctx(params={"water_level": 80.0})
        result = run(ctx)
        assert "status" in result
        assert result["status"] == "success"
        assert "risk_score" in result
        assert "prediction" in result
        assert "alert_triggered" in result

    def test_alert_triggered_flag(self):
        ctx = _make_ctx(params={"water_level": 155.0})
        result = run(ctx)
        assert result["alert_triggered"] is True

    def test_no_alert_when_low_risk(self):
        ctx = _make_ctx(params={"water_level": 90.0})
        result = run(ctx)
        assert result["alert_triggered"] is False
        ctx.alert.assert_not_called()
