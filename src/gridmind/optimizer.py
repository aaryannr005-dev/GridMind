"""Discrete dynamic-programming optimizer for battery dispatch.

The search minimizes modeled grid import cost minus export credits over a
finite input horizon. State of charge is discretized, so the optimum is
approximate at the configured energy resolution.
"""

from __future__ import annotations

from bisect import bisect_left, bisect_right
from dataclasses import dataclass
from datetime import datetime
import math

from .models import GridMindConfig, InputData
from .simulation import _validate_interval_spacing


@dataclass(frozen=True, slots=True)
class OptimizationConfig:
    """Controls optimizer resolution and end-of-horizon state.

    If terminal_soc_kwh is omitted, the optimizer must finish at the initial
    state of charge. Grid charging is available by default and is selected only
    when it improves the modeled objective.
    """

    soc_step_kwh: float = 0.5
    terminal_soc_kwh: float | None = None
    allow_grid_charging: bool = True

    def __post_init__(self) -> None:
        if isinstance(self.soc_step_kwh, bool) or not isinstance(self.soc_step_kwh, (int, float)):
            raise ValueError("soc_step_kwh must be a positive finite number")
        try:
            finite = math.isfinite(self.soc_step_kwh)
        except OverflowError:
            finite = False
        if not finite or self.soc_step_kwh <= 0:
            raise ValueError("soc_step_kwh must be a positive finite number")
        if self.terminal_soc_kwh is not None:
            if isinstance(self.terminal_soc_kwh, bool) or not isinstance(self.terminal_soc_kwh, (int, float)):
                raise ValueError("terminal_soc_kwh must be a finite number")
            try:
                finite = math.isfinite(self.terminal_soc_kwh)
            except OverflowError:
                finite = False
            if not finite or self.terminal_soc_kwh < 0:
                raise ValueError("terminal_soc_kwh must be a nonnegative finite number")
        if not isinstance(self.allow_grid_charging, bool):
            raise ValueError("allow_grid_charging must be a boolean")


@dataclass(frozen=True, slots=True)
class OptimizedInterval:
    """Energy flows selected by the optimizer for one interval."""

    timestamp: datetime
    demand_kwh: float
    solar_generation_kwh: float
    solar_to_load_kwh: float
    battery_charge_kwh: float
    battery_charge_from_solar_kwh: float
    battery_charge_from_grid_kwh: float
    battery_discharge_kwh: float
    grid_import_kwh: float
    grid_export_kwh: float
    solar_curtailment_kwh: float
    state_of_charge_kwh: float
    import_cost: float
    export_credit: float
    net_cost: float


@dataclass(frozen=True, slots=True)
class OptimizationResult:
    """Chosen dispatch and objective value across the input horizon."""

    intervals: tuple[OptimizedInterval, ...]
    currency: str
    starting_soc_kwh: float
    terminal_soc_kwh: float
    soc_step_kwh: float
    total_cost: float

    @property
    def total_grid_import_kwh(self) -> float:
        return sum(interval.grid_import_kwh for interval in self.intervals)

    @property
    def total_grid_export_kwh(self) -> float:
        return sum(interval.grid_export_kwh for interval in self.intervals)

    @property
    def total_net_cost(self) -> float:
        return self.total_cost


def _state_levels(capacity: float, initial: float, terminal: float, step: float) -> list[float]:
    regular_count = math.floor(capacity / step)
    if regular_count > 1000:
        raise ValueError(
            "soc_step_kwh creates more than 1001 regular states; use a coarser step"
        )
    levels = {0.0, capacity, initial, terminal}
    levels.update(round(index * step, 12) for index in range(regular_count + 1))
    return sorted(value for value in levels if 0 <= value <= capacity)


def _transition(
    current_soc: float,
    next_soc: float,
    demand: float,
    solar: float,
    import_rate: float,
    export_rate: float,
    config: GridMindConfig,
    options: OptimizationConfig,
) -> tuple[float, float, float, float, float, float, float, float] | None:
    """Return transition energy/cost values, or None when physically invalid."""
    battery = config.battery
    duration_hours = config.interval_minutes / 60
    solar_to_load = min(demand, solar)
    demand_after_solar = demand - solar_to_load
    solar_surplus = solar - solar_to_load
    charge_input = 0.0
    charge_from_solar = 0.0
    charge_from_grid = 0.0
    discharge = 0.0
    solar_curtailment = 0.0

    if next_soc > current_soc:
        charge_input = (next_soc - current_soc) / battery.charge_efficiency
        if charge_input > battery.max_charge_power_kw * duration_hours + 1e-9:
            return None
        if not options.allow_grid_charging:
            charge_from_solar = charge_input
        elif import_rate >= max(export_rate, 0.0):
            charge_from_solar = min(charge_input, solar_surplus)
        charge_from_grid = charge_input - charge_from_solar
        if not options.allow_grid_charging and charge_from_grid > 1e-9:
            return None
        grid_import = demand_after_solar + charge_from_grid
        remaining_surplus = max(0.0, solar_surplus - charge_from_solar)
        grid_export = remaining_surplus if export_rate > 0 else 0.0
        solar_curtailment = remaining_surplus - grid_export
    elif next_soc < current_soc:
        discharge = (current_soc - next_soc) * battery.discharge_efficiency
        if discharge > battery.max_discharge_power_kw * duration_hours + 1e-9:
            return None
        if discharge > demand_after_solar + 1e-9:
            return None
        grid_import = max(0.0, demand_after_solar - discharge)
        grid_export = solar_surplus if export_rate > 0 else 0.0
        solar_curtailment = solar_surplus - grid_export
    else:
        grid_import = demand_after_solar
        grid_export = solar_surplus if export_rate > 0 else 0.0
        solar_curtailment = solar_surplus - grid_export

    import_cost = grid_import * import_rate
    export_credit = grid_export * export_rate
    net_cost = import_cost - export_credit
    return (
        charge_input,
        charge_from_solar,
        charge_from_grid,
        discharge,
        grid_import,
        grid_export,
        solar_curtailment,
        net_cost,
    )


def optimize_dispatch(
    config: GridMindConfig,
    inputs: InputData,
    options: OptimizationConfig = OptimizationConfig(),
) -> OptimizationResult:
    """Minimize modeled import cost less export credit for the given horizon.

    The battery state is searched on a discrete grid. Solar serves load first;
    solar surplus may be charged or exported according to the import and export
    prices; surplus is curtailed when its export price is negative. Grid charging
    is selected when its price is below the value of exporting available solar.
    Battery discharge serves load but is not exported. The default
    terminal state equals the starting state to avoid consuming stored energy
    outside the modeled horizon.
    """
    if not isinstance(config, GridMindConfig):
        raise ValueError("config must be a GridMindConfig")
    if not isinstance(inputs, InputData):
        raise ValueError("inputs must be an InputData")
    if not isinstance(options, OptimizationConfig):
        raise ValueError("options must be an OptimizationConfig")
    _validate_interval_spacing(inputs, config.interval_minutes)

    battery = config.battery
    initial_soc = battery.initial_soc_kwh
    terminal_soc = initial_soc if options.terminal_soc_kwh is None else options.terminal_soc_kwh
    if terminal_soc > battery.capacity_kwh:
        raise ValueError("terminal_soc_kwh cannot exceed battery capacity")

    states = _state_levels(
        battery.capacity_kwh, initial_soc, terminal_soc, options.soc_step_kwh
    )
    if len(states) > 1001:
        raise ValueError(
            "soc_step_kwh creates more than 1001 states; use a coarser step"
        )
    start_index = states.index(initial_soc)
    terminal_index = states.index(terminal_soc)
    state_count = len(states)
    tolerance = 1e-9

    costs = [math.inf] * state_count
    costs[start_index] = 0.0
    parent_layers: list[list[int]] = []
    transition_layers: list[list[tuple[float, float, float, float, float, float, float, float] | None]] = []

    for index, (demand_point, solar_point, import_point) in enumerate(
        zip(inputs.demand.points, inputs.solar.points, inputs.tariffs.import_rates)
    ):
        export_rate = (
            inputs.tariffs.export_rates[index].value
            if inputs.tariffs.export_rates is not None
            else 0.0
        )
        next_costs = [math.inf] * state_count
        parents = [-1] * state_count
        actions: list[tuple[float, float, float, float, float, float, float, float] | None] = [None] * state_count

        for current_index, current_soc in enumerate(states):
            current_cost = costs[current_index]
            if not math.isfinite(current_cost):
                continue
            max_charge = battery.max_charge_power_kw * (config.interval_minutes / 60) * battery.charge_efficiency
            max_discharge = battery.max_discharge_power_kw * (config.interval_minutes / 60) / battery.discharge_efficiency
            lower_soc = max(0.0, current_soc - max_discharge)
            upper_soc = min(battery.capacity_kwh, current_soc + max_charge)
            if not options.allow_grid_charging:
                solar_surplus = max(0.0, solar_point.value - demand_point.value)
                upper_soc = min(upper_soc, current_soc + solar_surplus * battery.charge_efficiency)

            first_candidate = bisect_left(states, lower_soc - tolerance)
            last_candidate = bisect_right(states, upper_soc + tolerance)
            for next_index in range(first_candidate, last_candidate):
                next_soc = states[next_index]
                action = _transition(
                    current_soc,
                    next_soc,
                    demand_point.value,
                    solar_point.value,
                    import_point.value,
                    export_rate,
                    config,
                    options,
                )
                if action is None:
                    continue
                candidate_cost = current_cost + action[-1]
                if candidate_cost < next_costs[next_index] - 1e-12:
                    next_costs[next_index] = candidate_cost
                    parents[next_index] = current_index
                    actions[next_index] = action

        costs = next_costs
        parent_layers.append(parents)
        transition_layers.append(actions)

    if not math.isfinite(costs[terminal_index]):
        raise ValueError("no feasible dispatch reaches the requested terminal state")

    chosen: list[tuple[int, tuple[float, float, float, float, float, float, float, float]]] = []
    state_index = terminal_index
    for period in range(len(parent_layers) - 1, -1, -1):
        parent_index = parent_layers[period][state_index]
        action = transition_layers[period][state_index]
        if parent_index < 0 or action is None:
            raise RuntimeError("optimizer failed to reconstruct its selected dispatch")
        chosen.append((state_index, action))
        state_index = parent_index
    chosen.reverse()

    optimized: list[OptimizedInterval] = []
    for index, (end_state_index, action) in enumerate(chosen):
        charge, charge_solar, charge_grid, discharge, grid_import, grid_export, solar_curtailment, net_cost = action
        import_cost = grid_import * inputs.tariffs.import_rates[index].value
        export_rate = (
            inputs.tariffs.export_rates[index].value
            if inputs.tariffs.export_rates is not None
            else 0.0
        )
        export_credit = grid_export * export_rate
        optimized.append(
            OptimizedInterval(
                timestamp=inputs.demand.points[index].timestamp,
                demand_kwh=inputs.demand.points[index].value,
                solar_generation_kwh=inputs.solar.points[index].value,
                solar_to_load_kwh=min(
                    inputs.demand.points[index].value,
                    inputs.solar.points[index].value,
                ),
                battery_charge_kwh=charge,
                battery_charge_from_solar_kwh=charge_solar,
                battery_charge_from_grid_kwh=charge_grid,
                battery_discharge_kwh=discharge,
                grid_import_kwh=grid_import,
                grid_export_kwh=grid_export,
                solar_curtailment_kwh=solar_curtailment,
                state_of_charge_kwh=states[end_state_index],
                import_cost=import_cost,
                export_credit=export_credit,
                net_cost=net_cost,
            )
        )

    return OptimizationResult(
        intervals=tuple(optimized),
        currency=config.currency,
        starting_soc_kwh=initial_soc,
        terminal_soc_kwh=terminal_soc,
        soc_step_kwh=options.soc_step_kwh,
        total_cost=costs[terminal_index],
    )
