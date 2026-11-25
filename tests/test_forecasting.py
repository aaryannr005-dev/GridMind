from datetime import datetime, timedelta, timezone

import pytest

from gridmind.forecasting import ForecastMethod, evaluate_forecast, forecast_series
from gridmind.models import TimeSeriesPoint


def points(values, *, start=None, interval_minutes=60):
    start = start or datetime(2026, 1, 1, tzinfo=timezone.utc)
    return tuple(
        TimeSeriesPoint(start + timedelta(minutes=interval_minutes * index), value)
        for index, value in enumerate(values)
    )


def test_persistence_repeats_last_value_and_starts_after_history():
    history = points([1.0, 2.5, 3.0])
    result = forecast_series(history, horizon_intervals=3, interval_minutes=60)
    assert [point.value for point in result.points] == [3.0, 3.0, 3.0]
    assert result.points[0].timestamp == history[-1].timestamp + timedelta(hours=1)
    assert result.method is ForecastMethod.PERSISTENCE


def test_seasonal_naive_repeats_last_complete_cycle():
    history = points([1, 2, 3, 4, 10, 20, 30, 40])
    result = forecast_series(history, horizon_intervals=6, interval_minutes=60,
        method=ForecastMethod.SEASONAL_NAIVE, seasonal_period=4)
    assert [point.value for point in result.points] == [10, 20, 30, 40, 10, 20]


def test_seasonal_naive_requires_full_period():
    with pytest.raises(ValueError, match="complete seasonal period"):
        forecast_series(points([1, 2, 3]), horizon_intervals=2, interval_minutes=60,
            method=ForecastMethod.SEASONAL_NAIVE, seasonal_period=4)


def test_rolling_mean_uses_requested_recent_window():
    result = forecast_series(points([100, 2, 4, 6]), horizon_intervals=2, interval_minutes=60,
        method=ForecastMethod.ROLLING_MEAN, rolling_window=3)
    assert [point.value for point in result.points] == [4.0, 4.0]


def test_forecast_rejects_irregular_history_spacing():
    history = (TimeSeriesPoint(datetime(2026, 1, 1, tzinfo=timezone.utc), 1),
        TimeSeriesPoint(datetime(2026, 1, 1, 2, tzinfo=timezone.utc), 2))
    with pytest.raises(ValueError, match="equally spaced"):
        forecast_series(history, horizon_intervals=1, interval_minutes=60)


def test_forecast_rejects_negative_energy():
    with pytest.raises(ValueError, match="nonnegative"):
        forecast_series(points([1, -1]), horizon_intervals=1, interval_minutes=60)


def test_evaluation_reports_error_metrics_and_wape():
    forecast = forecast_series(points([2, 4]), horizon_intervals=2, interval_minutes=60)
    actual = points([3, 2], start=forecast.points[0].timestamp)
    report = evaluate_forecast(forecast, actual)
    assert report.sample_count == 2
    assert report.mean_absolute_error == 1.5
    assert report.root_mean_squared_error == pytest.approx((2.5) ** 0.5)
    assert report.mean_bias_error == 0.5
    assert report.weighted_absolute_percentage_error == pytest.approx(2 / 5)
    assert report.maximum_absolute_error == 2


def test_evaluation_omits_wape_when_actual_total_is_zero():
    forecast = forecast_series(points([0]), horizon_intervals=1, interval_minutes=60)
    actual = points([0], start=forecast.points[0].timestamp)
    assert evaluate_forecast(forecast, actual).weighted_absolute_percentage_error is None


def test_evaluation_rejects_timestamp_mismatch():
    forecast = forecast_series(points([1, 2]), horizon_intervals=2, interval_minutes=60)
    actual = points([1, 2], start=forecast.points[0].timestamp + timedelta(minutes=30))
    with pytest.raises(ValueError, match="align exactly"):
        evaluate_forecast(forecast, actual)


def test_evaluation_rejects_wrong_length():
    forecast = forecast_series(points([1]), horizon_intervals=2, interval_minutes=60)
    with pytest.raises(ValueError, match="exactly one point"):
        evaluate_forecast(forecast, points([1], start=forecast.points[0].timestamp))
