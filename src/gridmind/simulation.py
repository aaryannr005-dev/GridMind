"""Deterministic, self-consumption-first energy simulation.

This module performs interval energy balances. It does not search for an
optimal dispatch schedule.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import math

from .models import GridMindConfig, InputData


@dataclass(frozen=True, slots=True)
class IntervalResult:
    """Energy flows and cost for one input interval."""

    timestamp: datetime
    demand_kwh: float
    solar_generation_kwh: float
    solar_to_load_kwh: float
    battery_charge_kwh: float
    battery_discharge_kwh: float
    grid_import_kwh: float
    grid_export_kwh: float
    state_of_charge_kwh: float
    import_cost: float
    export_credit: float
    net_cost: float


@dataclass(frozen=True, slots=True)
class SimulationResult:
    """Ordered interval results and the currency used for their costs."""

    intervals: tuple[IntervalResult, ...]
    currency: str

    @property
    def total_demand_kwh(self) -> float:
        return sum(interval.demand_kwh for interval in self.intervals)

    @property
    def total_solar_generation_kwh(self) -> float:
        return sum(interval.solar_generation_kwh for interval in self.intervals)

    @property
    def total_grid_import_kwh(self) -> float:
        return sum(interval.grid_import_kwh for interval in self.intervals)

    @property
    def total_grid_export_kwh(self) -> float:
        return sum(interval.grid_export_kwh for interval in self.intervals)

    @property
    def total_import_cost(self) -> float:
        return sum(interval.import_cost for interval in self.intervals)

    @property
    def total_export_credit(self) -> float:
        return sum(interval.export_credit for interval in self.intervals)

    @property
    def total_net_cost(self) -> float:
        return sum(interval.net_cost for interval in self.intervals)


def _validate_interval_spacing(inputs: InputData, interval_minutes: int) -> None:
    expected = timedelta(minutes=interval_minutes)
    timestamps = tuple(point.timestamp.astimezone(timezone.utc) for point in inputs.demand.points)
    for previous, current in zip(timestamps, timestamps[1:]):
        if current - previous != expected:
            raise ValueError(
                "consecutive input timestamps must match config.interval_minutes"
            )


def simulate(config: GridMindConfig, inputs: InputData) -> SimulationResult:
    """Run a self-consumption-first battery simulation over aligned input data.

    Solar serves demand first. Remaining solar charges the battery within its
    power and capacity limits, then exports. When solar is insufficient, the
    battery serves demand within its power and state-of-charge limits, then the
    grid supplies the remainder. Grid charging is not performed.
    """
    if not isinstance(config, GridMindConfig):
        raise ValueError("config must be a GridMindConfig")
    if not isinstance(inputs, InputData):
        raise ValueError("inputs must be an InputData")
    _validate_interval_spacing(inputs, config.interval_minutes)

    battery = config.battery
    interval_hours = config.interval_minutes / 60
    state_of_charge = battery.initial_soc_kwh
    results: list[IntervalResult] = []

    export_rates = inputs.tariffs.export_rates
    for index, (demand_point, solar_point, import_point) in enumerate(
        zip(inputs.demand.points, inputs.solar.points, inputs.tariffs.import_rates)
    ):
        demand = demand_point.value
        solar = solar_point.value
        solar_to_load = min(demand, solar)
        remaining_demand = demand - solar_to_load
        solar_surplus = solar - solar_to_load

        charge_input = min(
            solar_surplus,
            battery.max_charge_power_kw * interval_hours,
            (battery.max_soc_kwh - state_of_charge) / battery.charge_efficiency,
        )
        state_of_charge += charge_input * battery.charge_efficiency
        solar_surplus -= charge_input

        battery_output = min(
            remaining_demand,
            battery.max_discharge_power_kw * interval_hours,
            (state_of_charge - battery.min_soc_kwh) * battery.discharge_efficiency,
        )
        state_of_charge -= battery_output / battery.discharge_efficiency
        remaining_demand -= battery_output

        grid_import = remaining_demand
        grid_export = solar_surplus
        import_cost = grid_import * import_point.value
        export_rate = export_rates[index].value if export_rates is not None else 0.0
        export_credit = grid_export * export_rate
        derived_values = (
            solar_to_load, charge_input, battery_output, grid_import, grid_export,
            state_of_charge, import_cost, export_credit, import_cost - export_credit,
        )
        if not all(math.isfinite(value) for value in derived_values):
            raise ValueError(
                "calculated interval flow or tariff cost exceeds the finite numeric range"
            )

        results.append(
            IntervalResult(
                timestamp=demand_point.timestamp,
                demand_kwh=demand,
                solar_generation_kwh=solar,
                solar_to_load_kwh=solar_to_load,
                battery_charge_kwh=charge_input,
                battery_discharge_kwh=battery_output,
                grid_import_kwh=grid_import,
                grid_export_kwh=grid_export,
                state_of_charge_kwh=state_of_charge,
                import_cost=import_cost,
                export_credit=export_credit,
                net_cost=import_cost - export_credit,
            )
        )

    totals = (
        sum(item.import_cost for item in results),
        sum(item.export_credit for item in results),
        sum(item.net_cost for item in results),
    )
    if not all(math.isfinite(value) for value in totals):
        raise ValueError("total tariff costs exceed the finite numeric range")
    return SimulationResult(intervals=tuple(results), currency=config.currency)

