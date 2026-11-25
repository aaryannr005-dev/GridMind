# GridMind

<p align="center">
  <a href="https://github.com/aaryannr005-dev/GridMind/releases/latest/download/GridMind-Setup.exe">
    <img alt="Download for Windows (.exe)" src="https://img.shields.io/badge/Download%20for-Windows%20(.exe)-218BFF?style=for-the-badge&logo=windows&logoColor=white">
  </a>
</p>

**Windows beta:** Click the button above to download `GridMind-Setup.exe` from the latest GitHub Release. The installer is currently unsigned, and a successful CI build does not yet guarantee it has been verified on every Windows machine. Downloads from this private repository require repository access.


GridMind is a Python energy simulation and decision-support project. It provides typed input models, deterministic energy simulation with battery constraints, a discrete dispatch optimizer, performance metrics, and structured reports. The input models validate demand, solar generation, tariffs, battery parameters (including static state of health), optional grid import/export power caps, optional PV temperature-derating parameters, and aligned interval data. The simulation follows a self-consumption-first energy balance and reports interval flows and tariff costs/credits. When configured, grid import and export are capped per interval: export above the cap is curtailed, while demand above the import cap rejects the scenario. Dispatch optimization minimizes modeled grid import costs minus export credits across the supplied horizon, optionally adding a per-kWh battery-degradation penalty to the objective; it can consider grid charging, balances grid charging against solar export rates, curtails solar when export rates are negative or above an export cap, respects battery limits and a terminal state of charge, and uses a discrete state-of-charge resolution. It is approximate, with accuracy affected by `soc_step_kwh`; it does not optimize battery sizing, demand response, or multi-site energy sharing.

## Requirements

Python 3.10 or newer. The package has no runtime dependencies.

## Install and test

    python -m pip install -e '.[test]'
    pytest

## Local scenario dashboard

Install the optional dashboard dependency and launch the local app:

    python -m pip install -e '.[dashboard]'
    streamlit run app.py

The dashboard accepts 24 hourly values in MYT for demand and solar generation (kWh per interval), import tariffs and export credits (currency per kWh), plus battery capacity, power, efficiency, and state-of-charge limits. It validates entries with the same models as the library, then runs the baseline and cost optimizer on the same scenario. Results include both strategies' interval tables, comparison metrics, estimated cost changes, energy-flow charts, reproducibility fingerprint, and model checks. A zero value is valid; empty, malformed, non-finite, negative energy, and inconsistent battery values are rejected with an input error.

The underlying `build_hourly_scenario` and `run_hourly_scenario` functions also accept optional grid caps, PV derating settings, static state of health, and a degradation penalty for programmatic use. The Streamlit form exposes the original battery and tariff fields.

The starting profile is synthetic demonstration data. It is not measured household or facility data. Results are scenario estimates, not bills or guaranteed savings. The app does not use the OpenDOSM statistics as household inputs, make network requests, store scenarios in a database, or create accounts. Project Streamlit settings bind to loopback and disable its usage statistics. Scenario values remain in the local Streamlit session's memory while the app is running.

Streamlit is an optional third-party dependency under Apache License 2.0; it is not added to GridMind's runtime dependencies. If preparing a packaged application, review and include notices for Streamlit and any bundled transitive dependencies.

## React/Electron desktop foundation

The React + TypeScript + Electron desktop app has a local typed bridge to the existing Python engine. Its dashboard can run a clearly labeled synthetic example, the Simulation Lab accepts editable 24-hour scenarios, Reports reviews the latest engine result, and Energy Map links to official historical power-station and grid maps. Overview section preferences are saved locally on the device; scenario values and reports remain in app memory and are not saved. Charts and baseline-versus-optimizer metrics come from the Python engine. See [`frontend/README.md`](frontend/README.md) for setup and the bridge contract.

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

Timestamps must be timezone-aware and strictly increasing by absolute time. Demand, solar, and tariff series must refer to the same instants, spaced according to `interval_minutes`; this distinguishes repeated local hours at daylight-saving transitions. Battery efficiencies are fractions in (0, 1]. `min_soc_kwh` and `max_soc_kwh` set the usable state-of-charge range; the maximum defaults to usable battery capacity (`capacity_kwh × state_of_health`), and the initial state must lie within the configured range. The optimizer preserves the starting state of charge at the end of the horizon by default; set `terminal_soc_kwh` to choose another valid ending level. By default it may charge from the grid when that reduces the modeled total cost. Set `allow_grid_charging=False` to prohibit this. For a fair baseline comparison at a matched terminal state, supply the baseline's per-interval ending SOC values through `baseline_soc_schedule_kwh`; this ensures the discrete search can reproduce the feasible reference trajectory. With zero degradation penalty, the optimiser should therefore be no more expensive than that baseline on the same tariff-cost basis.

`GridConfig`, `PvConfig`, and `BatteryConfig.state_of_health` enable the Phase 2 options. Grid import and export caps are per-interval kW values; omit a cap for unlimited, and zero is a valid cap. `state_of_health` is a static fraction in (0, 1] that scales usable capacity. `PvConfig` activates temperature derating only when both ambient-temperature and irradiance series are supplied; cell temperature follows a first-order NOCT model, and the derate factor is capped at 1.0 so derating never increases generation. `OptimizationConfig.degradation_cost_per_kwh` adds a nonnegative penalty per kWh discharged to the dispatch objective; `OptimizationResult.total_cost` includes it while `total_net_cost` and reported comparisons remain tariff-only.

Simulation and optimization raise a clear `ValueError` if otherwise finite inputs produce non-finite interval flows or tariff totals due to numeric overflow. Result metrics reject non-finite or malformed interval data rather than reporting it as valid.

## Grid limits, battery health, PV temperature and degradation

- **Grid limits.** `GridConfig(max_import_power_kw=..., max_export_power_kw=...)` sets per-interval power caps in kW. Omitted or `None` caps are unlimited; zero is a valid cap. Export above the export cap is curtailed as unexported solar. Demand that cannot be served within the import cap rejects the scenario rather than exceeding the limit. Caps are converted using the simulation interval length, so they remain power limits for sub-hourly intervals.
- **Battery state of health.** `BatteryConfig.state_of_health` is a static fraction in (0, 1] and defaults to 1.0. Usable capacity is `capacity_kwh × state_of_health`. The default maximum state of charge is that usable capacity, and an explicit `max_soc_kwh` may not exceed it. Calendar and cycle ageing are not simulated.
- **PV temperature derating.** `PvConfig(reference_temperature_c=25, noct_c=45, temperature_coefficient_per_c=-0.004)` applies a first-order NOCT model before simulation. It requires aligned `ambient_temperature_c` and `solar_irradiance_w_m2` series. The NOCT model assumes 800 W/m² and 20 °C ambient; cell temperature is `ambient + (noct_c - 20) × irradiance / 800`, and the output factor is `1 + coefficient × (cell - reference)`, capped to the range 0–1. Derating therefore never increases generation. It is not a full thermal, shading, or soiling model.
- **Degradation penalty.** `OptimizationConfig.degradation_cost_per_kwh` defaults to 0 and adds a nonnegative per-kWh penalty for battery discharge to the dispatch objective. `OptimizationResult.total_cost` is the tariff objective plus that penalty; `total_net_cost` excludes it. Metrics, savings, and financial comparisons remain tariff-only.

### Not modelled

Weather presets, wind speed, live weather or forecasting, calendar and cycle ageing, electrochemical or thermal battery dynamics, physical battery control, demand response, and multi-site energy sharing. Supplied weather is scenario input, not a forecast; the desktop UI repeats one ambient temperature and irradiance value across all 24 intervals.

## Metrics and strategy comparison

`calculate_metrics(result, config, inputs)` summarizes either a baseline `SimulationResult` or an `OptimizationResult`. Energy totals use kWh; costs use the configured currency. These are modeled estimates derived from the scenario, not measured household outcomes. The function confirms that result timestamps, demand, solar generation, and tariff calculations match the supplied scenario, and reports energy-balance, battery-constraint, and tariff-cost checks.

Solar self-consumption energy is direct solar supplied to demand plus solar energy sent into the battery. Its ratio is that amount divided by total solar generation; the ratio is `None` when generation is zero. Net cost is import cost minus export credit. `compare_strategies(baseline, optimized, config, inputs)` reports cost savings as baseline net cost minus optimized net cost, and grid-import reduction as baseline imports minus optimized imports. Solar self-consumption, export, and battery activity changes are optimized values minus baseline values, so positive values mean those quantities increased. Each percentage is its corresponding signed change or savings divided by the baseline value, multiplied by 100. It is `None` when the baseline denominator is zero or negative. A positive savings or import reduction is favorable for its stated objective; changes to solar self-consumption, exports, and battery activity are trade-offs that should be interpreted against the scenario objective.


## Reproducible reports

`generate_report(baseline, config, inputs, gridmind=None)` builds a reusable `GridMindReport` from completed outputs. It validates the supplied results through the metrics layer and does not rerun dispatch. The report includes per-interval rows, summary metrics and validation flags, reproducibility fingerprint, scenario assumptions and limitations, plus comparison rows when an optimized result is supplied. `render_markdown(report)` creates a text report; `report.charts` contains dependency-free SVG charts based on the same results and metrics.

For intervals of one hour or less that align cleanly to clock hours, hourly summaries group each interval by its local start hour and retain the final interval's state of charge. Partial first and last hours remain partial. Reports retain the original interval data. If intervals are longer than an hour, do not divide evenly into an hour, or cross clock-hour boundaries, the report does not invent hourly splits and leaves hourly summaries unavailable. Energy is shown in kWh; state of charge is shown as a percentage of nominal battery capacity, even when state of health reduces usable capacity. Costs are modeled estimates in the scenario currency, not measured bills. Reports record configured grid caps, static state of health, PV derating parameters, and any degradation penalty in their assumptions and limitations. Grid caps apply per interval: surplus above an export cap is curtailed, while demand above an import cap rejects the scenario. State of health is static; calendar and cycle ageing are not simulated. PV temperature derating is a first-order NOCT model driven by supplied ambient temperature and irradiance, not a full thermal, shading, or soiling model. The degradation penalty affects only the optimizer objective; reported net costs and savings remain tariff-only. Live weather, weather presets, wind speed, forecasting, and physical battery control are not modelled.

```python
from pathlib import Path
from gridmind import generate_report, render_markdown, simulate, optimize_dispatch

baseline = simulate(config, inputs)
optimized = optimize_dispatch(config, inputs)
report = generate_report(baseline, config, inputs, optimized)
print(render_markdown(report))
# Save an SVG chart if desired: Path("energy.svg").write_text(report.charts[0].svg)
```

## Public Malaysian electricity statistics

GridMind can parse locally obtained OpenDOSM monthly electricity consumption and supply CSV files. The package makes no network requests and does not bundle a copy of either dataset. Obtain CSVs from the official dataset pages: [Monthly Electricity Consumption](https://open.dosm.gov.my/data-catalogue/electricity_consumption) and [Monthly Electricity Supply](https://open.dosm.gov.my/data-catalogue/electricity_supply). Both pages identify the datasets as CC BY 4.0 and report national monthly sector totals in million kWh.

`gridmind.public_data` exposes the dataset title, publisher and contributing sources, source and download URLs, licence, national coverage, unit, frequency, data-as-of date, last-updated date, next-update information, and the date the metadata was checked. OpenDOSM currently marks the most recent six months as provisional and subject to revision. Blank numeric cells remain explicit missing values; absent months within each observed sector range are listed as gaps. Dates later than the checked data-as-of month receive an `unknown` status until their provenance is refreshed. No values are filled, rescaled, or mapped into household simulation inputs.

When redistributing or displaying these statistics, retain the dataset title and source links, link to the [CC BY 4.0 licence](https://creativecommons.org/licenses/by/4.0/), and describe any modifications. The current parser preserves reported values and units while converting CSV strings into typed monthly records. These national aggregate statistics are context only; they are not household profiles, measured consumer telemetry, or real-time grid data.

Example (after obtaining the CSV separately):

```python
from gridmind import ELECTRICITY_CONSUMPTION, load_open_dosm_csv

with open("electricity_consumption.csv", encoding="utf-8", newline="") as source:
    monthly = load_open_dosm_csv(ELECTRICITY_CONSUMPTION, source)

print(monthly.metadata.title, monthly.metadata.license_url)
print(monthly.observations[0], monthly.missing_periods)
```
