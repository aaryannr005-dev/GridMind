# GridMind

GridMind is a developing energy simulation project. It currently provides **Module 1: Data Input & Configuration**, **Module 2: Energy Simulation Engine**, and **Module 3: Dispatch Optimizer**.

Module 1 provides typed, immutable models and validation for demand, solar generation, tariffs, battery parameters, and aligned interval data. Module 2 runs a deterministic, self-consumption-first energy balance and reports interval energy flows and tariff costs/credits. Module 3 searches battery charge and discharge schedules to minimize modeled grid import costs minus export credits across the supplied horizon. It can consider grid charging, respects battery limits and a terminal state of charge, and uses a discrete state-of-charge resolution. It is an approximate optimizer whose accuracy depends on `soc_step_kwh`. It does not optimize battery sizing, demand response, or multi-site energy sharing.

## Requirements

Python 3.10 or newer. The package has no runtime dependencies.

## Install and test

    python -m pip install -e '.[test]'
    pytest

## Quick start

    from datetime import datetime, timezone, timedelta
    from gridmind import (
        BatteryConfig, DemandSeries, GridMindConfig, InputData,
        OptimizationConfig, SolarSeries, TariffSeries, TimeSeriesPoint,
        optimize_dispatch,
    )

    start = datetime(2026, 1, 1, tzinfo=timezone.utc)
    timestamps = (start, start + timedelta(hours=1))
    demand = DemandSeries(tuple(TimeSeriesPoint(t, v) for t, v in zip(timestamps, (0.0, 1.0))))
    solar = SolarSeries(tuple(TimeSeriesPoint(t, v) for t, v in zip(timestamps, (0.0, 0.0))))
    tariffs = TariffSeries(import_rates=tuple(TimeSeriesPoint(t, v) for t, v in zip(timestamps, (0.10, 1.00))))
    inputs = InputData(demand=demand, solar=solar, tariffs=tariffs)
    config = GridMindConfig(battery=BatteryConfig(capacity_kwh=5, max_charge_power_kw=2, max_discharge_power_kw=2))
    result = optimize_dispatch(config, inputs, OptimizationConfig(soc_step_kwh=0.25))
    print(result.total_cost, result.currency)

Timestamps must be timezone-aware and strictly increasing. Demand, solar, and tariff series must have matching timestamps, spaced according to `interval_minutes`. Battery efficiencies are fractions in (0, 1], and state of charge must fit within battery capacity. The optimizer preserves the starting state of charge at the end of the horizon by default; set `terminal_soc_kwh` to choose another valid ending level. By default it may charge from the grid when that reduces the modeled total cost. Set `allow_grid_charging=False` to prohibit this.
