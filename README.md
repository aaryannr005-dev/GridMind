# GridMind

GridMind is a developing energy simulation project. It currently provides **Module 1: Data Input & Configuration**, **Module 2: Energy Simulation Engine**, and **Module 3: Dispatch Optimizer**.

Module 1 provides typed, immutable models and validation for demand, solar generation, tariffs, battery parameters, and aligned interval data. Module 2 runs a deterministic, self-consumption-first energy balance and reports interval energy flows and tariff costs/credits. Module 3 searches battery charge and discharge schedules to minimize modeled grid import costs minus export credits across the supplied horizon. It can consider grid charging, balances grid charging against solar export rates, curtails solar when export rates are negative, respects battery limits and a terminal state of charge, and uses a discrete state-of-charge resolution. It is an approximate optimizer whose accuracy depends on `soc_step_kwh`. It does not optimize battery sizing, demand response, or multi-site energy sharing.

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

Timestamps must be timezone-aware and strictly increasing. Demand, solar, and tariff series must have matching timestamps, spaced according to `interval_minutes`. Battery efficiencies are fractions in (0, 1]. `min_soc_kwh` and `max_soc_kwh` set the usable state-of-charge range; the maximum defaults to battery capacity, and the initial state must lie within the configured range. The optimizer preserves the starting state of charge at the end of the horizon by default; set `terminal_soc_kwh` to choose another valid ending level. By default it may charge from the grid when that reduces the modeled total cost. Set `allow_grid_charging=False` to prohibit this.

## Metrics and strategy comparison

`calculate_metrics(result, config, inputs)` summarizes either a baseline `SimulationResult` or an `OptimizationResult`. Energy totals use kWh; costs use the configured currency. These are modeled estimates derived from the scenario, not measured household outcomes. The function confirms that result timestamps, demand, solar generation, and tariff calculations match the supplied scenario, and reports energy-balance, battery-constraint, and tariff-cost checks.

Solar self-consumption energy is direct solar supplied to demand plus solar energy sent into the battery. Its ratio is that amount divided by total solar generation; the ratio is `None` when generation is zero. Net cost is import cost minus export credit. `compare_strategies(baseline, optimized, config, inputs)` reports cost savings as baseline net cost minus optimized net cost, and grid-import reduction as baseline imports minus optimized imports. Solar self-consumption, export, and battery activity changes are optimized values minus baseline values, so positive values mean those quantities increased. Each percentage is its corresponding signed change or savings divided by the baseline value, multiplied by 100. It is `None` when the baseline denominator is zero or negative. A positive savings or import reduction is favorable for its stated objective; changes to solar self-consumption, exports, and battery activity are trade-offs that should be interpreted against the scenario objective.


## Reproducible reports

`generate_report(baseline, config, inputs, gridmind=None)` builds a reusable `GridMindReport` from completed outputs. It validates the supplied results through the metrics layer and does not rerun dispatch. The report includes per-interval rows, summary metrics and validation flags, reproducibility fingerprint, scenario assumptions and limitations, plus comparison rows when an optimized result is supplied. `render_markdown(report)` creates a text report; `report.charts` contains dependency-free SVG charts based on the same results and metrics.

For intervals of one hour or less that align cleanly to clock hours, hourly summaries group each interval by its local start hour and retain the final interval's state of charge. Partial first and last hours remain partial. Reports retain the original interval data. If intervals are longer than an hour, do not divide evenly into an hour, or cross clock-hour boundaries, the report does not invent hourly splits and leaves hourly summaries unavailable. Energy is shown in kWh; state of charge is shown as a percentage of nominal battery capacity. Costs are modeled estimates in the scenario currency, not measured bills. The report identifies that grid limits, battery degradation, temperature, and ageing are not included in the current model.

```python
from pathlib import Path
from gridmind import generate_report, render_markdown, simulate, optimize_dispatch

baseline = simulate(config, inputs)
optimized = optimize_dispatch(config, inputs)
report = generate_report(baseline, config, inputs, optimized)
print(render_markdown(report))
# Save an SVG chart if desired: Path("energy.svg").write_text(report.charts[0].svg)
```
