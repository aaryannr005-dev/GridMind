"""Consumer-oriented helpers for creating and running hourly scenarios."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from collections.abc import Mapping, Sequence
from typing import Any

from .metrics import SimulationMetrics
from .models import (
    BatteryConfig,
    DemandSeries,
    GridConfig,
    GridMindConfig,
    InputData,
    PvConfig,
    SolarSeries,
    TariffSeries,
    TimeSeriesPoint,
)
from .optimizer import OptimizationConfig, OptimizationResult, optimize_dispatch
from .pv import apply_temperature_derating
from .reporting import GridMindReport, generate_report
from .simulation import SimulationResult, simulate


MALAYSIA_TIME = timezone(timedelta(hours=8), name="MYT")
HOURLY_PERIODS = 24
PROFILE_FIELDS = (
    "Demand (kWh)",
    "Solar generation (kWh)",
    "Import tariff (per kWh)",
    "Export credit (per kWh)",
)


def synthetic_demo_profile() -> tuple[dict[str, str | float], ...]:
    """Return clearly synthetic example inputs for the dashboard editor."""

    demand = (0.55, 0.50, 0.48, 0.46, 0.48, 0.65, 0.95, 1.05, 0.90, 0.80, 0.75, 0.72,
              0.70, 0.68, 0.70, 0.78, 0.90, 1.10, 1.35, 1.45, 1.30, 1.05, 0.80, 0.65)
    solar = (
        (0.0,) * 6
        + (0.05, 0.20, 0.55, 0.95, 1.35, 1.65, 1.85, 1.95, 1.85, 1.55, 1.10, 0.60, 0.20, 0.03)
        + (0.0,) * 4
    )
    import_rate = tuple(0.30 if 17 <= hour <= 21 else 0.22 for hour in range(HOURLY_PERIODS))
    export_rate = (0.05,) * HOURLY_PERIODS
    return tuple(
        {
            "Hour (MYT)": f"{hour:02d}:00",
            "Demand (kWh)": demand[hour],
            "Solar generation (kWh)": solar[hour],
            "Import tariff (per kWh)": import_rate[hour],
            "Export credit (per kWh)": export_rate[hour],
        }
        for hour in range(HOURLY_PERIODS)
    )


def profile_rows_to_records(profile: object) -> tuple[dict[str, Any], ...]:
    """Normalize Streamlit's supported edited profile return types."""

    if isinstance(profile, (list, tuple)):
        rows = profile
    else:
        to_dict = getattr(profile, "to_dict", None)
        if not callable(to_dict):
            raise ValueError("hourly profile must be an editable table of rows")
        try:
            rows = to_dict(orient="records")
        except (TypeError, ValueError) as exc:
            raise ValueError("hourly profile table could not be read") from exc
    if not isinstance(rows, (list, tuple)):
        raise ValueError("hourly profile table must return a list of rows")
    records: list[dict[str, Any]] = []
    for row_number, row in enumerate(rows, start=1):
        if not isinstance(row, Mapping):
            raise ValueError(f"hourly profile row {row_number} must contain named values")
        missing = [name for name in PROFILE_FIELDS if name not in row]
        if missing:
            raise ValueError(
                f"hourly profile row {row_number} is missing fields: {', '.join(missing)}"
            )
        records.append(dict(row))
    if len(records) != HOURLY_PERIODS:
        raise ValueError(f"hourly profile must contain exactly {HOURLY_PERIODS} rows; received {len(records)}")
    return tuple(records)


@dataclass(frozen=True, slots=True)
class ScenarioRun:
    """Inputs and reproducible outputs for one consumer dashboard run."""

    config: GridMindConfig
    inputs: InputData
    baseline: SimulationResult
    optimized: OptimizationResult
    report: GridMindReport


def _sequence(name: str, values: Sequence[float]) -> tuple[float, ...]:
    if isinstance(values, (str, bytes)):
        raise ValueError(f"{name} must contain exactly {HOURLY_PERIODS} numeric values")
    try:
        items = tuple(values)
    except TypeError as exc:
        raise ValueError(f"{name} must contain exactly {HOURLY_PERIODS} numeric values") from exc
    if len(items) != HOURLY_PERIODS:
        raise ValueError(
            f"{name} must contain exactly {HOURLY_PERIODS} values; received {len(items)}"
        )
    return items


def build_hourly_scenario(
    demand_kwh: Sequence[float],
    solar_generation_kwh: Sequence[float],
    import_rate_per_kwh: Sequence[float],
    export_rate_per_kwh: Sequence[float],
    *,
    start_date: date,
    battery: BatteryConfig,
    currency: str = "MYR",
    grid: GridConfig | None = None,
    pv: PvConfig | None = None,
    ambient_temperature_c: Sequence[float] | None = None,
    solar_irradiance_w_m2: Sequence[float] | None = None,
) -> tuple[GridMindConfig, InputData]:
    """Build a validated 24-hour scenario using Malaysia Time (UTC+08:00).

    Each sequence contains one value per hourly interval. Energy inputs are
    kWh per interval; tariff inputs are currency per kWh. No values are
    defaulted, imputed, or converted silently.

    When ``pv`` and both weather series are supplied, the solar series is
    temperature-derated by a first-order NOCT model before the simulation, so
    metrics and reports see the effective generation used by dispatch.
    Supplying weather without a PV configuration, or a PV configuration without
    both weather series, is rejected.
    """

    if type(start_date) is not date:
        raise ValueError("start_date must be a calendar date")
    if not isinstance(battery, BatteryConfig):
        raise ValueError("battery must be a BatteryConfig")
    if grid is not None and not isinstance(grid, GridConfig):
        raise ValueError("grid must be a GridConfig")
    if pv is not None and not isinstance(pv, PvConfig):
        raise ValueError("pv must be a PvConfig")
    weather_supplied = (
        ambient_temperature_c is not None or solar_irradiance_w_m2 is not None
    )
    if pv is None and weather_supplied:
        raise ValueError("pv must be supplied to apply a weather series")
    if pv is not None and (
        ambient_temperature_c is None or solar_irradiance_w_m2 is None
    ):
        raise ValueError(
            "ambient_temperature_c and solar_irradiance_w_m2 are required "
            "when pv is supplied"
        )

    sequences = (
        ("demand_kwh", demand_kwh),
        ("solar_generation_kwh", solar_generation_kwh),
        ("import_rate_per_kwh", import_rate_per_kwh),
        ("export_rate_per_kwh", export_rate_per_kwh),
    )
    normalized = {
        name: _sequence(name, values) for name, values in sequences
    }

    solar_values = normalized["solar_generation_kwh"]
    if pv is not None:
        solar_values = apply_temperature_derating(
            solar_values,
            _sequence("ambient_temperature_c", ambient_temperature_c),
            _sequence("solar_irradiance_w_m2", solar_irradiance_w_m2),
            pv,
        )

    start = datetime.combine(start_date, time.min, tzinfo=MALAYSIA_TIME)
    timestamps = tuple(start + timedelta(hours=index) for index in range(HOURLY_PERIODS))
    demand = DemandSeries(tuple(TimeSeriesPoint(ts, value) for ts, value in zip(timestamps, normalized["demand_kwh"])))
    solar = SolarSeries(tuple(TimeSeriesPoint(ts, value) for ts, value in zip(timestamps, solar_values)))
    tariffs = TariffSeries(
        import_rates=tuple(TimeSeriesPoint(ts, value) for ts, value in zip(timestamps, normalized["import_rate_per_kwh"])),
        export_rates=tuple(TimeSeriesPoint(ts, value) for ts, value in zip(timestamps, normalized["export_rate_per_kwh"])),
    )
    config = GridMindConfig(
        battery=battery, interval_minutes=60, currency=currency, grid=grid, pv=pv
    )
    return config, InputData(demand=demand, solar=solar, tariffs=tariffs)


def run_hourly_scenario(
    demand_kwh: Sequence[float],
    solar_generation_kwh: Sequence[float],
    import_rate_per_kwh: Sequence[float],
    export_rate_per_kwh: Sequence[float],
    *,
    start_date: date,
    battery: BatteryConfig,
    currency: str = "MYR",
    grid: GridConfig | None = None,
    pv: PvConfig | None = None,
    ambient_temperature_c: Sequence[float] | None = None,
    solar_irradiance_w_m2: Sequence[float] | None = None,
    degradation_cost_per_kwh: float = 0.0,
) -> ScenarioRun:
    """Run baseline and cost optimizer on identical validated inputs."""

    config, inputs = build_hourly_scenario(
        demand_kwh,
        solar_generation_kwh,
        import_rate_per_kwh,
        export_rate_per_kwh,
        start_date=start_date,
        battery=battery,
        currency=currency,
        grid=grid,
        pv=pv,
        ambient_temperature_c=ambient_temperature_c,
        solar_irradiance_w_m2=solar_irradiance_w_m2,
    )
    baseline = simulate(config, inputs)
    # Scale the discrete search to battery size and stay within the optimizer's
    # documented maximum state count. Match the baseline's final state of charge
    # so the cost comparison does not give either strategy extra stored energy.
    soc_step = max(battery.capacity_kwh / 200, 0.01)
    optimized = optimize_dispatch(
        config,
        inputs,
        OptimizationConfig(
            soc_step_kwh=soc_step,
            terminal_soc_kwh=baseline.intervals[-1].state_of_charge_kwh,
            degradation_cost_per_kwh=degradation_cost_per_kwh,
        ),
    )
    report = generate_report(baseline, config, inputs, optimized)
    return ScenarioRun(config, inputs, baseline, optimized, report)


def metric_rows(run: ScenarioRun) -> tuple[dict[str, object], ...]:
    """Prepare side-by-side metric rows with units for the UI."""

    baseline: SimulationMetrics = run.report.baseline
    optimized = run.report.gridmind
    if optimized is None:
        raise ValueError("dashboard report must include both baseline and GridMind metrics")
    values = (
        ("Solar generation", baseline.total_solar_generation_kwh, optimized.total_solar_generation_kwh, "kWh"),
        ("Energy demand", baseline.total_demand_kwh, optimized.total_demand_kwh, "kWh"),
        ("Direct solar to demand", baseline.direct_solar_consumption_kwh, optimized.direct_solar_consumption_kwh, "kWh"),
        ("Solar self-consumption", baseline.solar_self_consumption_kwh, optimized.solar_self_consumption_kwh, "kWh"),
        (
            "Solar self-consumption ratio",
            None if baseline.solar_self_consumption_ratio is None else baseline.solar_self_consumption_ratio * 100,
            None if optimized.solar_self_consumption_ratio is None else optimized.solar_self_consumption_ratio * 100,
            "%",
        ),
        ("Grid imports", baseline.grid_import_kwh, optimized.grid_import_kwh, "kWh"),
        ("Grid exports", baseline.grid_export_kwh, optimized.grid_export_kwh, "kWh"),
        ("Battery charged", baseline.battery_charge_kwh, optimized.battery_charge_kwh, "kWh"),
        ("Battery discharged", baseline.battery_discharge_kwh, optimized.battery_discharge_kwh, "kWh"),
        ("Initial battery charge", baseline.initial_soc_kwh, optimized.initial_soc_kwh, "kWh"),
        ("Final battery charge", baseline.final_soc_kwh, optimized.final_soc_kwh, "kWh"),
        ("Import cost", baseline.import_cost, optimized.import_cost, run.config.currency),
        ("Export credit", baseline.export_credit, optimized.export_credit, run.config.currency),
        ("Estimated net cost", baseline.net_cost, optimized.net_cost, run.config.currency),
    )
    return tuple(
        {"Metric": name, "Baseline": base, "GridMind": optimized_value, "Unit": unit}
        for name, base, optimized_value, unit in values
    )
