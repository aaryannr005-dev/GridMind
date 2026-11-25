"""Deterministic baseline forecasting and evaluation primitives.

These methods establish reproducible reference forecasts. They do not ingest
weather, learn model parameters, or claim calibrated prediction intervals.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta, timezone
from enum import Enum
import math
from typing import Sequence

from .models import TimeSeriesPoint


class ForecastMethod(str, Enum):
    """Transparent baseline methods for interval-energy time series."""
    PERSISTENCE = "persistence"
    SEASONAL_NAIVE = "seasonal_naive"
    ROLLING_MEAN = "rolling_mean"


@dataclass(frozen=True, slots=True)
class ForecastResult:
    """Point forecasts plus settings needed to interpret their origin."""
    target: str
    method: ForecastMethod
    interval_minutes: int
    history_count: int
    points: tuple[TimeSeriesPoint, ...]

    def __post_init__(self) -> None:
        if not isinstance(self.target, str) or not self.target.strip():
            raise ValueError("target must be a non-empty string")
        if not isinstance(self.method, ForecastMethod):
            raise ValueError("method must be a ForecastMethod")
        if isinstance(self.interval_minutes, bool) or not isinstance(self.interval_minutes, int) or self.interval_minutes <= 0:
            raise ValueError("interval_minutes must be a positive integer")
        if isinstance(self.history_count, bool) or not isinstance(self.history_count, int) or self.history_count <= 0:
            raise ValueError("history_count must be a positive integer")
        if not isinstance(self.points, tuple) or not self.points:
            raise ValueError("points must be a non-empty tuple")
        previous = None
        for point in self.points:
            if not isinstance(point, TimeSeriesPoint) or point.value < 0:
                raise ValueError("forecast points must be nonnegative TimeSeriesPoint instances")
            instant = point.timestamp.astimezone(timezone.utc)
            if previous is not None and instant - previous != timedelta(minutes=self.interval_minutes):
                raise ValueError("forecast timestamps must follow the configured interval")
            previous = instant


@dataclass(frozen=True, slots=True)
class ForecastEvaluation:
    """Error metrics from a timestamp-aligned forecast/actual comparison."""
    target: str
    method: ForecastMethod
    sample_count: int
    mean_absolute_error: float
    root_mean_squared_error: float
    mean_bias_error: float
    weighted_absolute_percentage_error: float | None
    maximum_absolute_error: float


def forecast_series(
    history: Sequence[TimeSeriesPoint],
    *,
    horizon_intervals: int,
    interval_minutes: int,
    method: ForecastMethod = ForecastMethod.PERSISTENCE,
    seasonal_period: int = 24,
    rolling_window: int = 24,
    target: str = "energy",
) -> ForecastResult:
    """Forecast nonnegative interval values using a transparent baseline.

    Seasonal naive repeats the most recent complete cycle. Rolling mean repeats
    the mean of a recent window. Persistence repeats the last observation.
    """
    if not isinstance(history, Sequence) or isinstance(history, (str, bytes)) or not history:
        raise ValueError("history must be a non-empty sequence of TimeSeriesPoint instances")
    if isinstance(horizon_intervals, bool) or not isinstance(horizon_intervals, int) or horizon_intervals <= 0:
        raise ValueError("horizon_intervals must be a positive integer")
    if isinstance(interval_minutes, bool) or not isinstance(interval_minutes, int) or interval_minutes <= 0:
        raise ValueError("interval_minutes must be a positive integer")
    if not isinstance(method, ForecastMethod):
        raise ValueError("method must be a ForecastMethod")
    if not isinstance(target, str) or not target.strip():
        raise ValueError("target must be a non-empty string")
    if isinstance(seasonal_period, bool) or not isinstance(seasonal_period, int) or seasonal_period <= 0:
        raise ValueError("seasonal_period must be a positive integer")
    if isinstance(rolling_window, bool) or not isinstance(rolling_window, int) or rolling_window <= 0:
        raise ValueError("rolling_window must be a positive integer")

    previous = None
    values: list[float] = []
    for point in history:
        if not isinstance(point, TimeSeriesPoint):
            raise ValueError("history entries must be TimeSeriesPoint instances")
        if point.value < 0:
            raise ValueError("history values must be nonnegative")
        instant = point.timestamp.astimezone(timezone.utc)
        if previous is not None and instant - previous != timedelta(minutes=interval_minutes):
            raise ValueError("history timestamps must be equally spaced at interval_minutes")
        previous = instant
        values.append(float(point.value))

    if method is ForecastMethod.SEASONAL_NAIVE and len(values) < seasonal_period:
        raise ValueError("seasonal_naive requires at least one complete seasonal period")

    if method is ForecastMethod.PERSISTENCE:
        predictions = [values[-1]] * horizon_intervals
    elif method is ForecastMethod.SEASONAL_NAIVE:
        pattern = values[-seasonal_period:]
        predictions = [pattern[index % seasonal_period] for index in range(horizon_intervals)]
    else:
        window = values[-rolling_window:]
        mean = math.fsum(window) / len(window)
        if not math.isfinite(mean):
            raise ValueError("rolling mean exceeds the finite numeric range")
        predictions = [mean] * horizon_intervals

    step = timedelta(minutes=interval_minutes)
    last_timestamp_utc = history[-1].timestamp.astimezone(timezone.utc)
    output_timezone = history[-1].timestamp.tzinfo
    points = tuple(
        TimeSeriesPoint(
            (last_timestamp_utc + step * (index + 1)).astimezone(output_timezone),
            value,
        )
        for index, value in enumerate(predictions)
    )
    return ForecastResult(
        target=target.strip(), method=method, interval_minutes=interval_minutes,
        history_count=len(values), points=points,
    )


def evaluate_forecast(
    forecast: ForecastResult,
    actual: Sequence[TimeSeriesPoint],
) -> ForecastEvaluation:
    """Evaluate against actual values at exactly matching instants.

    WAPE is omitted when total actual energy is zero. Pointwise percentage
    errors are avoided because they are undefined for zero actual values.
    """
    if not isinstance(forecast, ForecastResult):
        raise ValueError("forecast must be a ForecastResult")
    if not isinstance(actual, Sequence) or isinstance(actual, (str, bytes)):
        raise ValueError("actual must be a sequence of TimeSeriesPoint instances")
    if len(actual) != len(forecast.points) or not actual:
        raise ValueError("actual must contain exactly one point per forecast interval")

    errors: list[float] = []
    actual_total = 0.0
    for predicted, observed in zip(forecast.points, actual):
        if not isinstance(observed, TimeSeriesPoint) or observed.value < 0:
            raise ValueError("actual values must be nonnegative TimeSeriesPoint instances")
        if predicted.timestamp.astimezone(timezone.utc) != observed.timestamp.astimezone(timezone.utc):
            raise ValueError("actual timestamps must align exactly with forecast timestamps")
        errors.append(predicted.value - observed.value)
        actual_total += observed.value

    absolute_errors = [abs(error) for error in errors]
    mae = math.fsum(absolute_errors) / len(errors)
    rmse = math.sqrt(math.fsum(error * error for error in errors) / len(errors))
    bias = math.fsum(errors) / len(errors)
    wape = math.fsum(absolute_errors) / actual_total if actual_total > 0 else None
    maximum = max(absolute_errors)
    if not all(math.isfinite(value) for value in (mae, rmse, bias, maximum)) or (wape is not None and not math.isfinite(wape)):
        raise ValueError("forecast evaluation exceeds the finite numeric range")
    return ForecastEvaluation(
        target=forecast.target, method=forecast.method, sample_count=len(errors),
        mean_absolute_error=mae, root_mean_squared_error=rmse,
        mean_bias_error=bias, weighted_absolute_percentage_error=wape,
        maximum_absolute_error=maximum,
    )
