# GridMind

GridMind is a developing energy simulation project. It currently provides **Module 1: Data Input & Configuration** and **Module 2: Energy Simulation Engine**.

Module 1 provides typed, immutable models and validation for demand, solar generation, tariffs, battery parameters, and aligned interval data. Module 2 runs a deterministic, self-consumption-first energy balance: solar serves demand, surplus solar charges the battery and then exports, and the battery serves remaining demand before grid imports. It reports interval energy flows and tariff costs/credits. It does not optimize dispatch, schedule grid charging, or implement an optimizer.

## Requirements

Python 3.10 or newer.

## Install and test

    python -m pip install -e '.[test]'
    pytest

## Quick start

    from datetime import datetime, timezone
    from gridmind import BatteryConfig, DemandSeries, GridMindConfig, InputData, SolarSeries, TariffSeries, TimeSeriesPoint, simulate

    start = datetime(2026, 1, 1, tzinfo=timezone.utc)
    timestamps = (start, start.replace(hour=1))
    demand = DemandSeries(tuple(TimeSeriesPoint(t, v) for t, v in zip(timestamps, (1.2, 1.5))))
    solar = SolarSeries(tuple(TimeSeriesPoint(t, v) for t, v in zip(timestamps, (0.4, 2.0))))
    tariffs = TariffSeries(
        import_rates=tuple(TimeSeriesPoint(t, 0.30) for t in timestamps),
        export_rates=tuple(TimeSeriesPoint(t, 0.10) for t in timestamps),
    )
    inputs = InputData(demand=demand, solar=solar, tariffs=tariffs)
    config = GridMindConfig(battery=BatteryConfig(capacity_kwh=10, max_charge_power_kw=5, max_discharge_power_kw=5))
    result = simulate(config, inputs)
    print(result.total_net_cost, result.currency)

Timestamps must be timezone-aware and strictly increasing. Demand and solar values are nonnegative; tariff prices may be negative to represent credits. Demand, solar, and tariff series must have matching timestamps, spaced according to `interval_minutes`. Battery efficiencies use fractions from 0 (exclusive) to 1 (inclusive), and state of charge must fit within battery capacity.
