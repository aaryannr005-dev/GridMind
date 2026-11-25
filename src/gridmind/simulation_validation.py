"""Compare simulated energy flows with explicitly supplied site measurements.

This module does not acquire data, infer missing observations, or claim that
national aggregate statistics are suitable household reference measurements.
All supplied channels must align exactly with the simulation timestamps.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import math

from .models import TimeSeriesPoint
from .simulation import IntervalResult, SimulationResult


@dataclass(frozen=True, slots=True)
class ReferenceMeasurements:
    """Measured site-level channels, expressed as kWh at each interval.

    At least one channel must be supplied. Each channel is optional because a
    real site may have only some meters (for example, no battery SOC telemetry).
    The caller is responsible for recording the source and ensuring the
    measurements represent the same physical boundary as the simulated flows.
    """

    source_name: str
    demand_kwh: tuple[TimeSeriesPoint, ...] | None = None
    solar_generation_kwh: tuple[TimeSeriesPoint, ...] | None = None
    grid_import_kwh: tuple[TimeSeriesPoint, ...] | None = None
    grid_export_kwh: tuple[TimeSeriesPoint, ...] | None = None
    battery_soc_kwh: tuple[TimeSeriesPoint, ...] | None = None

    def __post_init__(self) -> None:
        if not isinstance(self.source_name, str) or not self.source_name.strip():
            raise ValueError("source_name must be a non-empty string")
        supplied = 0
        for name in (
            "demand_kwh",
            "solar_generation_kwh",
            "grid_import_kwh",
            "grid_export_kwh",
            "battery_soc_kwh",
        ):
            points = getattr(self, name)
            if points is None:
                continue
            try:
                normalized = tuple(points)
            except TypeError as exc:
                raise ValueError(f"{name} must be an iterable of TimeSeriesPoint") from exc
            if not normalized:
                raise ValueError(f"{name} must contain at least one measurement")
            previous: datetime | None = None
            for point in normalized:
                if not isinstance(point, TimeSeriesPoint):
                    raise ValueError(f"{name} entries must be TimeSeriesPoint instances")
                if point.value < 0:
                    raise ValueError(f"{name} measurements must be nonnegative")
                instant = point.timestamp.astimezone(timezone.utc)
                if previous is not None and instant <= previous:
                    raise ValueError(f"{name} timestamps must be strictly increasing")
                previous = instant
            object.__setattr__(self, name, normalized)
            supplied += 1
        if supplied == 0:
            raise ValueError("at least one measured channel must be supplied")


@dataclass(frozen=True, slots=True)
class ChannelValidation:
    """Error statistics for one simulated channel against its measurements."""

    measurement_count: int
    mean_absolute_error_kwh: float
    root_mean_square_error_kwh: float
    mean_bias_error_kwh: float
    maximum_absolute_error_kwh: float
    modelled_total_kwh: float
    measured_total_kwh: float
    within_tolerance: bool


@dataclass(frozen=True, slots=True)
class SimulationValidationReport:
    """Measured-data comparison; pass/fail is relative to caller tolerance."""

    source_name: str
    absolute_tolerance_kwh: float
    demand: ChannelValidation | None
    solar_generation: ChannelValidation | None
    grid_import: ChannelValidation | None
    grid_export: ChannelValidation | None
    battery_soc: ChannelValidation | None
    within_tolerance: bool


def _finite_nonnegative(value: object, name: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"{name} must be a finite nonnegative number")
    try:
        finite = math.isfinite(value)
    except OverflowError:
        finite = False
    if not finite or value < 0:
        raise ValueError(f"{name} must be a finite nonnegative number")
    return float(value)


def _compare_channel(
    modelled: tuple[float, ...],
    measured: tuple[TimeSeriesPoint, ...],
    tolerance: float,
) -> ChannelValidation:
    errors = tuple(actual - reference.value for actual, reference in zip(modelled, measured))
    absolute_errors = tuple(abs(error) for error in errors)
    count = len(errors)
    try:
        mae = math.fsum(absolute_errors) / count
        rmse = math.sqrt(math.fsum(error * error for error in errors) / count)
        bias = math.fsum(errors) / count
        maximum = max(absolute_errors)
        modelled_total = math.fsum(modelled)
        measured_total = math.fsum(point.value for point in measured)
    except OverflowError as exc:
        raise ValueError("validation statistics exceed the finite numeric range") from exc
    values = (mae, rmse, bias, maximum, modelled_total, measured_total)
    if not all(math.isfinite(value) for value in values):
        raise ValueError("validation statistics exceed the finite numeric range")
    return ChannelValidation(
        measurement_count=count,
        mean_absolute_error_kwh=mae,
        root_mean_square_error_kwh=rmse,
        mean_bias_error_kwh=bias,
        maximum_absolute_error_kwh=maximum,
        modelled_total_kwh=modelled_total,
        measured_total_kwh=measured_total,
        within_tolerance=maximum <= tolerance,
    )


def validate_simulation_against_reference(
    result: SimulationResult,
    reference: ReferenceMeasurements,
    *,
    absolute_tolerance_kwh: float,
) -> SimulationValidationReport:
    """Compare selected simulated channels with aligned measured site data.

    A channel passes only when its maximum absolute interval error is no greater
    than the explicit caller-supplied tolerance. This tolerance is a comparison
    setting, not a universal engineering acceptance threshold.
    """
    if not isinstance(result, SimulationResult):
        raise ValueError("result must be a SimulationResult")
    if not isinstance(reference, ReferenceMeasurements):
        raise ValueError("reference must be a ReferenceMeasurements instance")
    tolerance = _finite_nonnegative(absolute_tolerance_kwh, "absolute_tolerance_kwh")
    if not isinstance(result.intervals, tuple) or not result.intervals:
        raise ValueError("result must contain a non-empty tuple of intervals")
    for interval in result.intervals:
        if not isinstance(interval, IntervalResult):
            raise ValueError("result intervals must contain IntervalResult instances")
        if (
            not isinstance(interval.timestamp, datetime)
            or interval.timestamp.tzinfo is None
            or interval.timestamp.utcoffset() is None
        ):
            raise ValueError("result interval timestamps must be timezone-aware")
        for name in (
            "demand_kwh", "solar_generation_kwh", "grid_import_kwh",
            "grid_export_kwh", "state_of_charge_kwh",
        ):
            _finite_nonnegative(getattr(interval, name), f"result {name}")

    result_timestamps = tuple(
        interval.timestamp.astimezone(timezone.utc) for interval in result.intervals
    )
    if any(
        current <= previous
        for previous, current in zip(result_timestamps, result_timestamps[1:])
    ):
        raise ValueError("result timestamps must be strictly increasing")

    channels = (
        ("demand_kwh", "demand_kwh"),
        ("solar_generation_kwh", "solar_generation_kwh"),
        ("grid_import_kwh", "grid_import_kwh"),
        ("grid_export_kwh", "grid_export_kwh"),
        ("battery_soc_kwh", "state_of_charge_kwh"),
    )
    comparisons: dict[str, ChannelValidation | None] = {}
    for reference_name, result_name in channels:
        measured = getattr(reference, reference_name)
        if measured is None:
            comparisons[reference_name] = None
            continue
        measured_timestamps = tuple(
            point.timestamp.astimezone(timezone.utc) for point in measured
        )
        if measured_timestamps != result_timestamps:
            raise ValueError(
                f"{reference_name} timestamps must match simulation intervals exactly"
            )
        modelled = tuple(getattr(interval, result_name) for interval in result.intervals)
        comparisons[reference_name] = _compare_channel(modelled, measured, tolerance)

    assessed = tuple(value for value in comparisons.values() if value is not None)
    return SimulationValidationReport(
        source_name=reference.source_name.strip(),
        absolute_tolerance_kwh=tolerance,
        demand=comparisons["demand_kwh"],
        solar_generation=comparisons["solar_generation_kwh"],
        grid_import=comparisons["grid_import_kwh"],
        grid_export=comparisons["grid_export_kwh"],
        battery_soc=comparisons["battery_soc_kwh"],
        within_tolerance=all(item.within_tolerance for item in assessed),
    )
