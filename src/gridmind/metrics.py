"""Reusable metrics and strategy comparisons for GridMind results.

Metrics are derived from simulation outputs and the scenario used to create
them. Energy values are in kWh, prices and costs use the scenario currency,
and ratios are ``None`` when their denominator is zero.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import math

from .models import GridMindConfig, InputData
from .optimizer import OptimizedInterval, OptimizationResult
from .simulation import IntervalResult, SimulationResult


SimulationOutput = SimulationResult | OptimizationResult
_TOLERANCE = 1e-9


@dataclass(frozen=True, slots=True)
class SimulationMetrics:
    """Summary quantities and validation outcomes for one strategy run."""

    currency: str
    interval_count: int
    total_demand_kwh: float
    total_solar_generation_kwh: float
    direct_solar_consumption_kwh: float
    solar_to_battery_kwh: float
    solar_self_consumption_kwh: float
    solar_self_consumption_ratio: float | None
    grid_import_kwh: float
    grid_export_kwh: float
    battery_charge_kwh: float
    battery_discharge_kwh: float
    initial_soc_kwh: float
    final_soc_kwh: float
    import_cost: float
    export_credit: float
    net_cost: float
    energy_balance_valid: bool
    battery_constraints_valid: bool
    grid_constraints_valid: bool
    tariff_costs_valid: bool
    max_load_balance_error_kwh: float
    max_solar_balance_error_kwh: float
    max_soc_balance_error_kwh: float


@dataclass(frozen=True, slots=True)
class StrategyComparison:
    """Baseline-to-optimizer differences; positive savings/reductions help."""

    baseline: SimulationMetrics
    optimized: SimulationMetrics
    cost_savings: float
    cost_savings_percent: float | None
    grid_import_reduction_kwh: float
    grid_import_reduction_percent: float | None
    solar_self_consumption_change_kwh: float
    solar_self_consumption_change_percent: float | None
    solar_export_change_kwh: float
    solar_export_change_percent: float | None
    battery_charge_change_kwh: float
    battery_charge_change_percent: float | None
    battery_discharge_change_kwh: float
    battery_discharge_change_percent: float | None


def _interval_charge_sources(interval: IntervalResult | OptimizedInterval) -> tuple[float, float]:
    if isinstance(interval, IntervalResult):
        return interval.battery_charge_kwh, 0.0
    return interval.battery_charge_from_solar_kwh, interval.battery_charge_from_grid_kwh


def _matches_input(result: SimulationOutput, inputs: InputData) -> bool:
    if len(result.intervals) != len(inputs.demand.points):
        return False
    return all(
        interval.timestamp.astimezone(timezone.utc)
        == demand.timestamp.astimezone(timezone.utc)
        == solar.timestamp.astimezone(timezone.utc)
        and math.isclose(interval.demand_kwh, demand.value, rel_tol=0.0, abs_tol=_TOLERANCE)
        and math.isclose(interval.solar_generation_kwh, solar.value, rel_tol=0.0, abs_tol=_TOLERANCE)
        for interval, demand, solar in zip(
            result.intervals, inputs.demand.points, inputs.solar.points
        )
    )


def _validate_result_values(result: SimulationOutput) -> None:
    def is_finite_number(value: object) -> bool:
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            return False
        try:
            return math.isfinite(value)
        except OverflowError:
            return False

    expected = IntervalResult if isinstance(result, SimulationResult) else OptimizedInterval
    if not isinstance(result.intervals, tuple) or any(
        not isinstance(interval, expected) for interval in result.intervals
    ):
        raise ValueError("result intervals must contain the expected interval result type")
    for interval in result.intervals:
        if (
            not isinstance(interval.timestamp, datetime)
            or interval.timestamp.tzinfo is None
            or interval.timestamp.utcoffset() is None
        ):
            raise ValueError("result interval timestamps must be timezone-aware")
        for name in interval.__dataclass_fields__:
            if name == "timestamp":
                continue
            value = getattr(interval, name)
            if isinstance(value, bool) or not isinstance(value, (int, float)):
                raise ValueError(f"result interval {name} must be a finite number")
            try:
                finite = math.isfinite(value)
            except OverflowError:
                finite = False
            if not finite:
                raise ValueError(f"result interval {name} must be a finite number")
    if isinstance(result, OptimizationResult):
        for name in ("starting_soc_kwh", "terminal_soc_kwh", "soc_step_kwh", "total_cost"):
            value = getattr(result, name)
            if not is_finite_number(value):
                raise ValueError(f"optimization result {name} must be a finite number")


def calculate_metrics(
    result: SimulationOutput,
    config: GridMindConfig,
    inputs: InputData,
) -> SimulationMetrics:
    """Calculate energy, cost, SOC, and constraint metrics from a run.

    ``inputs`` is used to confirm scenario alignment and independently check
    interval tariff calculations. The function does not rerun dispatch.
    ``tariff_costs_valid`` confirms per-interval tariff products and, for
    optimizer results, that the reported objective equals modeled import cost
    less export credit plus any configured degradation penalty.
    """
    if not isinstance(result, (SimulationResult, OptimizationResult)):
        raise ValueError("result must be a SimulationResult or OptimizationResult")
    if not isinstance(config, GridMindConfig):
        raise ValueError("config must be a GridMindConfig")
    if not isinstance(inputs, InputData):
        raise ValueError("inputs must be an InputData")
    if not result.intervals:
        raise ValueError("result must contain at least one interval")
    _validate_result_values(result)
    if result.currency != config.currency:
        raise ValueError("result currency must match config currency")
    if not _matches_input(result, inputs):
        raise ValueError("result intervals must match the supplied scenario")

    battery = config.battery
    interval_hours = config.interval_minutes / 60
    demand_total = solar_total = direct_solar = solar_charge_total = 0.0
    imports = exports = charge_total = discharge_total = 0.0
    import_cost = export_credit = 0.0
    degradation_total = 0.0
    max_load_error = max_solar_error = max_soc_error = 0.0
    energy_balance_valid = battery_constraints_valid = grid_constraints_valid = tariff_costs_valid = True
    current_soc = battery.initial_soc_kwh
    if isinstance(result, OptimizationResult):
        battery_constraints_valid &= math.isclose(
            result.starting_soc_kwh,
            battery.initial_soc_kwh,
            rel_tol=0.0,
            abs_tol=_TOLERANCE,
        )

    for index, interval in enumerate(result.intervals):
        charge_solar, charge_grid = _interval_charge_sources(interval)
        charge = interval.battery_charge_kwh
        discharge = interval.battery_discharge_kwh
        curtailment = getattr(interval, "solar_curtailment_kwh", 0.0)
        degradation_cost = getattr(interval, "degradation_cost", 0.0)

        demand_total += interval.demand_kwh
        solar_total += interval.solar_generation_kwh
        direct_solar += interval.solar_to_load_kwh
        solar_charge_total += charge_solar
        imports += interval.grid_import_kwh
        exports += interval.grid_export_kwh
        charge_total += charge
        discharge_total += discharge
        import_cost += interval.import_cost
        export_credit += interval.export_credit
        degradation_total += degradation_cost

        load_error = abs(
            interval.demand_kwh
            - (interval.solar_to_load_kwh + discharge + interval.grid_import_kwh - charge_grid)
        )
        solar_error = abs(
            interval.solar_generation_kwh
            - (interval.solar_to_load_kwh + charge_solar + interval.grid_export_kwh + curtailment)
        )
        charge_source_error = abs(charge - charge_solar - charge_grid)
        expected_import_cost = interval.grid_import_kwh * inputs.tariffs.import_rates[index].value
        export_rate = (
            inputs.tariffs.export_rates[index].value
            if inputs.tariffs.export_rates is not None
            else 0.0
        )
        expected_export_credit = interval.grid_export_kwh * export_rate
        soc_error = abs(
            interval.state_of_charge_kwh
            - (current_soc + charge * battery.charge_efficiency - discharge / battery.discharge_efficiency)
        )
        max_load_error = max(max_load_error, load_error)
        max_solar_error = max(max_solar_error, solar_error)
        max_soc_error = max(max_soc_error, soc_error)
        nonnegative_flows = all(value >= -_TOLERANCE for value in (
            interval.solar_to_load_kwh, charge, discharge,
            interval.grid_import_kwh, interval.grid_export_kwh,
            curtailment, charge_solar, charge_grid,
        ))
        solar_allocation_valid = interval.solar_to_load_kwh <= (
            min(interval.demand_kwh, interval.solar_generation_kwh) + _TOLERANCE
        )
        energy_balance_valid &= (
            nonnegative_flows and solar_allocation_valid
            and load_error <= _TOLERANCE and solar_error <= _TOLERANCE
        )
        battery_constraints_valid &= (
            battery.min_soc_kwh - _TOLERANCE <= interval.state_of_charge_kwh
            <= battery.max_soc_kwh + _TOLERANCE
            and charge >= -_TOLERANCE
            and discharge >= -_TOLERANCE
            and charge <= battery.max_charge_power_kw * interval_hours + _TOLERANCE
            and discharge <= battery.max_discharge_power_kw * interval_hours + _TOLERANCE
            and charge_source_error <= _TOLERANCE
            and not (charge > _TOLERANCE and discharge > _TOLERANCE)
            and soc_error <= _TOLERANCE
        )
        grid_constraints_valid &= (
            (
                config.grid.max_import_power_kw is None
                or interval.grid_import_kwh
                <= config.grid.max_import_power_kw * interval_hours + _TOLERANCE
            )
            and (
                config.grid.max_export_power_kw is None
                or interval.grid_export_kwh
                <= config.grid.max_export_power_kw * interval_hours + _TOLERANCE
            )
        )
        tariff_costs_valid &= (
            math.isclose(interval.import_cost, expected_import_cost, rel_tol=0.0, abs_tol=_TOLERANCE)
            and math.isclose(interval.export_credit, expected_export_credit, rel_tol=0.0, abs_tol=_TOLERANCE)
            and math.isclose(interval.net_cost, expected_import_cost - expected_export_credit, rel_tol=0.0, abs_tol=_TOLERANCE)
        )
        current_soc = interval.state_of_charge_kwh

    accumulated_values = (
        demand_total, solar_total, direct_solar, solar_charge_total, imports,
        exports, charge_total, discharge_total, import_cost, export_credit,
        degradation_total, max_load_error, max_solar_error, max_soc_error,
    )
    if not all(math.isfinite(value) for value in accumulated_values):
        raise ValueError("result totals exceed the finite numeric range")
    solar_consumption = direct_solar + solar_charge_total
    self_consumption_ratio = solar_consumption / solar_total if solar_total > 0 else None
    if isinstance(result, OptimizationResult):
        battery_constraints_valid &= math.isclose(
            result.terminal_soc_kwh,
            result.intervals[-1].state_of_charge_kwh,
            rel_tol=0.0,
            abs_tol=_TOLERANCE,
        )
        tariff_costs_valid &= math.isclose(
            result.total_cost,
            import_cost - export_credit + degradation_total,
            rel_tol=0.0,
            abs_tol=_TOLERANCE,
        )
    return SimulationMetrics(
        currency=result.currency,
        interval_count=len(result.intervals),
        total_demand_kwh=demand_total,
        total_solar_generation_kwh=solar_total,
        direct_solar_consumption_kwh=direct_solar,
        solar_to_battery_kwh=solar_charge_total,
        solar_self_consumption_kwh=solar_consumption,
        solar_self_consumption_ratio=self_consumption_ratio,
        grid_import_kwh=imports,
        grid_export_kwh=exports,
        battery_charge_kwh=charge_total,
        battery_discharge_kwh=discharge_total,
        initial_soc_kwh=battery.initial_soc_kwh,
        final_soc_kwh=result.intervals[-1].state_of_charge_kwh,
        import_cost=import_cost,
        export_credit=export_credit,
        net_cost=import_cost - export_credit,
        energy_balance_valid=energy_balance_valid,
        battery_constraints_valid=battery_constraints_valid,
        grid_constraints_valid=grid_constraints_valid,
        tariff_costs_valid=tariff_costs_valid,
        max_load_balance_error_kwh=max_load_error,
        max_solar_balance_error_kwh=max_solar_error,
        max_soc_balance_error_kwh=max_soc_error,
    )


def compare_strategies(
    baseline: SimulationOutput,
    optimized: SimulationOutput,
    config: GridMindConfig,
    inputs: InputData,
) -> StrategyComparison:
    """Compare baseline and optimized outputs under the same supplied inputs."""
    baseline_metrics = calculate_metrics(baseline, config, inputs)
    optimized_metrics = calculate_metrics(optimized, config, inputs)
    if baseline_metrics.currency != optimized_metrics.currency:
        raise ValueError("strategies must use the same currency")

    cost_savings = baseline_metrics.net_cost - optimized_metrics.net_cost
    grid_reduction = baseline_metrics.grid_import_kwh - optimized_metrics.grid_import_kwh
    solar_change = optimized_metrics.solar_self_consumption_kwh - baseline_metrics.solar_self_consumption_kwh
    export_change = optimized_metrics.grid_export_kwh - baseline_metrics.grid_export_kwh
    charge_change = optimized_metrics.battery_charge_kwh - baseline_metrics.battery_charge_kwh
    discharge_change = optimized_metrics.battery_discharge_kwh - baseline_metrics.battery_discharge_kwh
    return StrategyComparison(
        baseline=baseline_metrics,
        optimized=optimized_metrics,
        cost_savings=cost_savings,
        cost_savings_percent=(100 * cost_savings / baseline_metrics.net_cost if baseline_metrics.net_cost > 0 else None),
        grid_import_reduction_kwh=grid_reduction,
        grid_import_reduction_percent=(100 * grid_reduction / baseline_metrics.grid_import_kwh if baseline_metrics.grid_import_kwh > 0 else None),
        solar_self_consumption_change_kwh=solar_change,
        solar_self_consumption_change_percent=(100 * solar_change / baseline_metrics.solar_self_consumption_kwh if baseline_metrics.solar_self_consumption_kwh > 0 else None),
        solar_export_change_kwh=export_change,
        solar_export_change_percent=(100 * export_change / baseline_metrics.grid_export_kwh if baseline_metrics.grid_export_kwh > 0 else None),
        battery_charge_change_kwh=charge_change,
        battery_charge_change_percent=(100 * charge_change / baseline_metrics.battery_charge_kwh if baseline_metrics.battery_charge_kwh > 0 else None),
        battery_discharge_change_kwh=discharge_change,
        battery_discharge_change_percent=(100 * discharge_change / baseline_metrics.battery_discharge_kwh if baseline_metrics.battery_discharge_kwh > 0 else None),
    )

