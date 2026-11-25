from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from gridmind import (
    BatteryConfig,
    DemandSeries,
    GridMindConfig,
    InputData,
    SolarSeries,
    TariffSeries,
    TimeSeriesPoint,
    forecast_series,
    generate_report,
    simulate,
)


def test_forecast_timestamps_advance_in_real_time_across_spring_dst_gap():
    local = ZoneInfo("America/New_York")
    history = (
        TimeSeriesPoint(datetime(2025, 3, 9, 0, tzinfo=local), 1.0),
        TimeSeriesPoint(datetime(2025, 3, 9, 1, tzinfo=local), 2.0),
    )

    forecast = forecast_series(history, horizon_intervals=3, interval_minutes=60)
    expected_start = history[-1].timestamp.astimezone(timezone.utc) + timedelta(hours=1)

    assert [
        point.timestamp.astimezone(timezone.utc) for point in forecast.points
    ] == [expected_start + timedelta(hours=index) for index in range(3)]
    assert forecast.points[0].timestamp.hour == 3


def test_forecast_timestamps_include_repeated_fall_dst_hour():
    local = ZoneInfo("America/New_York")
    history = (TimeSeriesPoint(datetime(2025, 11, 2, 0, tzinfo=local), 1.0),)

    forecast = forecast_series(history, horizon_intervals=3, interval_minutes=60)
    expected_start = history[-1].timestamp.astimezone(timezone.utc) + timedelta(hours=1)

    assert [
        point.timestamp.astimezone(timezone.utc) for point in forecast.points
    ] == [expected_start + timedelta(hours=index) for index in range(3)]
    assert forecast.points[1].timestamp.hour == 1
    assert forecast.points[1].timestamp.fold == 1


def test_hourly_reports_group_half_hour_offset_zones_by_local_hour():
    local = ZoneInfo("Asia/Kolkata")
    timestamps = (
        datetime(2026, 1, 1, 0, 0, tzinfo=local),
        datetime(2026, 1, 1, 0, 30, tzinfo=local),
        datetime(2026, 1, 1, 1, 0, tzinfo=local),
    )

    def series(values):
        return tuple(TimeSeriesPoint(timestamp, value) for timestamp, value in zip(timestamps, values))

    inputs = InputData(
        DemandSeries(series((1.0, 2.0, 3.0))),
        SolarSeries(series((0.0, 0.0, 0.0))),
        TariffSeries(series((0.2, 0.2, 0.2))),
    )
    config = GridMindConfig(BatteryConfig(1.0, 0.0, 0.0), interval_minutes=30)
    report = generate_report(simulate(config, inputs), config, inputs)

    assert len(report.baseline_hourly) == 2
    first, second = report.baseline_hourly
    assert first.hour_start == datetime(2026, 1, 1, 0, 0, tzinfo=local)
    assert first.interval_count == 2
    assert first.demand_kwh == 3.0
    assert second.hour_start == datetime(2026, 1, 1, 1, 0, tzinfo=local)
    assert second.interval_count == 1
    assert second.demand_kwh == 3.0
