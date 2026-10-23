# GridMind

GridMind is a developing energy simulation project. This repository currently provides **Module 1: Data Input & Configuration**: typed, immutable Python models and validation for demand, solar generation, tariffs, battery parameters, and aligned interval data. The package is a foundation for a later simulation engine; it does not calculate battery dispatch, energy costs, or optimized schedules.

## Requirements

Python 3.10 or newer.

## Install and test

    python -m pip install -e '.[test]'
    pytest

## Quick start

    from datetime import datetime, timezone
    from gridmind import BatteryConfig, DemandSeries, GridMindConfig, InputData, SolarSeries, TariffSeries, TimeSeriesPoint

    start = datetime(2026, 1, 1, tzinfo=timezone.utc)
    demand = DemandSeries((TimeSeriesPoint(start, 1.2),))
    solar = SolarSeries((TimeSeriesPoint(start, 0.4),))
    tariffs = TariffSeries(import_rates=(TimeSeriesPoint(start, 0.30),))
    inputs = InputData(demand=demand, solar=solar, tariffs=tariffs)
    config = GridMindConfig(battery=BatteryConfig(capacity_kwh=10, max_charge_power_kw=5, max_discharge_power_kw=5))

Timestamps must be timezone-aware and strictly increasing. Demand and solar values are nonnegative; tariff prices may be negative to represent credits. Series supplied to `InputData` must have matching timestamps. Battery efficiencies use fractions from 0 (exclusive) to 1 (inclusive), and state of charge must fit within battery capacity.
