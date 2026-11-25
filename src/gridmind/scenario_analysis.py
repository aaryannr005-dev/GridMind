"""Deterministic one-at-a-time sensitivity analysis for energy scenarios.

This module perturbs one input dimension at a time and reruns the existing
simulation or optimizer. It does not infer probability distributions or claim
forecast uncertainty bounds.
"""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
import math
from typing import Sequence

from .metrics import calculate_metrics
from .models import (
    DemandSeries, GridMindConfig, InputData, SolarSeries, TariffSeries,
    TimeSeriesPoint,
)
from .optimizer import OptimizationConfig, optimize_dispatch
from .simulation import simulate


class SensitivityParameter(str, Enum):
    """Supported input dimensions for one-at-a-time scaling."""
    DEMAND = "demand"
    SOLAR_GENERATION = "solar_generation"
    IMPORT_TARIFF = "import_tariff"
    EXPORT_TARIFF = "export_tariff"


class SensitivityMetric(str, Enum):
    """Comparable outcome metrics reported for each scenario."""
    NET_COST = "net_cost"
    GRID_IMPORT_KWH = "grid_import_kwh"
    GRID_EXPORT_KWH = "grid_export_kwh"
    SOLAR_SELF_CONSUMPTION_RATIO = "solar_self_consumption_ratio"


@dataclass(frozen=True, slots=True)
class SensitivityPoint:
    """Outcome at one multiplier relative to the baseline input."""
    multiplier: float
    metric_value: float | None
    absolute_change: float | None
    percentage_change: float | None
    feasible: bool
    error: str | None = None


@dataclass(frozen=True, slots=True)
class SensitivityReport:
    """Baseline and one-at-a-time scenario outcomes."""
    parameter: SensitivityParameter
    metric: SensitivityMetric
    currency: str
    baseline_value: float | None
    points: tuple[SensitivityPoint, ...]


def _scale_series(points: tuple[TimeSeriesPoint, ...], multiplier: float) -> tuple[TimeSeriesPoint, ...]:
    scaled = tuple(
        TimeSeriesPoint(point.timestamp, point.value * multiplier)
        for point in points
    )
    if any(not math.isfinite(point.value) for point in scaled):
        raise ValueError("scaled scenario inputs exceed the finite numeric range")
    return scaled


def _scaled_inputs(inputs: InputData, parameter: SensitivityParameter, multiplier: float) -> InputData:
    demand = inputs.demand
    solar = inputs.solar
    tariffs = inputs.tariffs

    if parameter is SensitivityParameter.DEMAND:
        demand = DemandSeries(_scale_series(demand.points, multiplier))
    elif parameter is SensitivityParameter.SOLAR_GENERATION:
        solar = SolarSeries(_scale_series(solar.points, multiplier))
    elif parameter is SensitivityParameter.IMPORT_TARIFF:
        tariffs = TariffSeries(
            import_rates=_scale_series(tariffs.import_rates, multiplier),
            export_rates=tariffs.export_rates,
        )
    elif parameter is SensitivityParameter.EXPORT_TARIFF:
        if tariffs.export_rates is None:
            raise ValueError("export_tariff sensitivity requires an export tariff series")
        tariffs = TariffSeries(
            import_rates=tariffs.import_rates,
            export_rates=_scale_series(tariffs.export_rates, multiplier),
        )
    else:
        raise ValueError("unsupported sensitivity parameter")

    return InputData(demand=demand, solar=solar, tariffs=tariffs)


def _metric_value(metrics: object, metric: SensitivityMetric) -> float | None:
    value = getattr(metrics, metric.value)
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError("scenario metric must be a finite number or None")
    return float(value)


def run_sensitivity_analysis(
    config: GridMindConfig,
    inputs: InputData,
    *,
    parameter: SensitivityParameter,
    multipliers: Sequence[float],
    metric: SensitivityMetric = SensitivityMetric.NET_COST,
    optimization_options: OptimizationConfig | None = None,
) -> SensitivityReport:
    """Scale one input dimension and compare results with the baseline.

    Multipliers must be positive finite numbers. A multiplier of 1.0 denotes
    the unmodified scenario. If optimization_options is supplied, every case
    uses the optimizer; otherwise every case uses the self-consumption-first
    simulator. Infeasible perturbed scenarios are retained as explicit failed
    points rather than aborting the entire sweep.
    """
    if not isinstance(config, GridMindConfig):
        raise ValueError("config must be a GridMindConfig")
    if not isinstance(inputs, InputData):
        raise ValueError("inputs must be InputData")
    if not isinstance(parameter, SensitivityParameter):
        raise ValueError("parameter must be a SensitivityParameter")
    if not isinstance(metric, SensitivityMetric):
        raise ValueError("metric must be a SensitivityMetric")
    if optimization_options is not None and not isinstance(optimization_options, OptimizationConfig):
        raise ValueError("optimization_options must be an OptimizationConfig or None")
    if not isinstance(multipliers, Sequence) or isinstance(multipliers, (str, bytes)) or not multipliers:
        raise ValueError("multipliers must be a non-empty sequence of positive finite numbers")

    normalized: list[float] = []
    for multiplier in multipliers:
        if isinstance(multiplier, bool) or not isinstance(multiplier, (int, float)):
            raise ValueError("multipliers must contain positive finite numbers")
        try:
            finite = math.isfinite(multiplier)
        except OverflowError:
            finite = False
        if not finite or multiplier <= 0:
            raise ValueError("multipliers must contain positive finite numbers")
        normalized.append(float(multiplier))
    if len(set(normalized)) != len(normalized):
        raise ValueError("multipliers must be unique")

    if parameter is SensitivityParameter.EXPORT_TARIFF and inputs.tariffs.export_rates is None:
        raise ValueError("export_tariff sensitivity requires an export tariff series")

    def evaluate(scenario_inputs: InputData):
        result = (
            optimize_dispatch(config, scenario_inputs, optimization_options)
            if optimization_options is not None
            else simulate(config, scenario_inputs)
        )
        return calculate_metrics(result, config, scenario_inputs)

    baseline_metrics = evaluate(inputs)
    baseline_value = _metric_value(baseline_metrics, metric)
    points: list[SensitivityPoint] = []

    for multiplier in normalized:
        if multiplier == 1.0:
            points.append(SensitivityPoint(
                multiplier=multiplier, metric_value=baseline_value,
                absolute_change=0.0 if baseline_value is not None else None,
                percentage_change=0.0 if baseline_value not in (None, 0.0) else None,
                feasible=True,
            ))
            continue
        try:
            scenario_inputs = _scaled_inputs(inputs, parameter, multiplier)
            scenario_metrics = evaluate(scenario_inputs)
            value = _metric_value(scenario_metrics, metric)
            change = value - baseline_value if value is not None and baseline_value is not None else None
            percentage = (
                100.0 * change / abs(baseline_value)
                if change is not None and baseline_value not in (None, 0.0)
                else None
            )
            points.append(SensitivityPoint(
                multiplier=multiplier, metric_value=value,
                absolute_change=change, percentage_change=percentage,
                feasible=True,
            ))
        except ValueError as exc:
            points.append(SensitivityPoint(
                multiplier=multiplier, metric_value=None,
                absolute_change=None, percentage_change=None,
                feasible=False, error=str(exc),
            ))

    return SensitivityReport(
        parameter=parameter, metric=metric, currency=config.currency,
        baseline_value=baseline_value, points=tuple(points),
    )
