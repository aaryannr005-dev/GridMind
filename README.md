# GridMind

GridMind is a Python energy simulation and decision-support project. It provides typed input models, deterministic energy simulation with battery constraints, a discrete dispatch optimizer, performance metrics, and structured reports. The input models validate demand, solar generation, tariffs, battery parameters, and aligned interval data. The simulation follows a self-consumption-first energy balance and reports interval flows and tariff costs/credits. Dispatch optimization minimizes modeled grid import costs minus export credits across the supplied horizon; it can consider grid charging, balances grid charging against solar export rates, curtails solar when export rates are negative, respects battery limits and a terminal state of charge, and uses a discrete state-of-charge resolution. It is approximate, with accuracy affected by `soc_step_kwh`; it does not optimize battery sizing, demand response, or multi-site energy sharing.

## Requirements

Python 3.10 or newer. The package has no runtime dependencies.

## Install and test

    python -m pip install -e '.[test]'
    pytest

## Local desktop scenario app

Install Python 3.10 or newer and the desktop dependencies in the project environment:

    python -m pip install -e '.[desktop]'

Then launch `gridmind-desktop` from that environment. The launcher opens the existing Streamlit dashboard in its own application window. It starts the service on `127.0.0.1`, waits for its health endpoint, then opens the window. It tries ports 8501–8510 so another local service is not taken over. Closing the window shuts down the GridMind service.

To add a Windows desktop shortcut, create a shortcut to `gridmind-desktop.exe` in the environment's `Scripts` folder (for example, `<environment>\Scripts\gridmind-desktop.exe`). The project registers this as a GUI entry point so launching it does not open a console window.

On Windows, Microsoft Edge WebView2 Runtime is required. Most supported Windows installations already include it. If GridMind detects that it is missing, install the Evergreen WebView2 Runtime from [Microsoft's WebView2 page](https://developer.microsoft.com/microsoft-edge/webview2/) and restart GridMind. The wrapper checks the registered runtime and common installation folders before starting. The pywebview Windows backend also requires pythonnet, which is installed with the desktop dependency.

The desktop app accepts 24 hourly values in MYT for demand and solar generation (kWh per interval), import tariffs and export credits (currency per kWh), plus battery capacity, power, efficiency, and state-of-charge limits. It validates entries with the same models as the library, then runs the baseline and cost optimizer on the same scenario. Results include both strategies' interval tables, comparison metrics, estimated cost changes, energy-flow charts, reproducibility fingerprint, and model checks. A zero value is valid; empty, malformed, non-finite, negative energy, and inconsistent battery values are rejected with an input error.

The starting profile is synthetic demonstration data. It is not measured household or facility data. Results are scenario estimates, not bills or guaranteed savings. The app does not use the OpenDOSM statistics as household inputs, make network requests, store scenarios in a database, or create accounts. Project Streamlit settings bind to loopback and disable its usage statistics. Scenario values remain in the local Streamlit session's memory while the app is running.

Streamlit (Apache-2.0) and pywebview (BSD-3-Clause) are optional desktop dependencies; neither is required by the simulation library. See the [Streamlit license](https://github.com/streamlit/streamlit/blob/develop/LICENSE) and [pywebview license](https://github.com/r0x0r/pywebview/blob/master/LICENSE). The local service is loopback-only and keeps Streamlit's CORS and XSRF protections enabled. It does not send scenario inputs to a cloud service or enable usage statistics. Wrapper logs contain startup and shutdown diagnostics only and are stored under `%LOCALAPPDATA%/GridMind/logs` on Windows or `$XDG_STATE_HOME/GridMind/logs` (falling back to `~/.local/state/GridMind/logs`) elsewhere.

To update a checkout installation, update the project files and run `python -m pip install --upgrade -e '.[desktop]'` again in the same environment. If startup reports that all ports 8501–8510 are occupied, close the other local applications using them and retry. If the desktop window prerequisite is missing, install WebView2 as described above. For service diagnostics, inspect `desktop.log` in the log folder; it records wrapper startup and shutdown events without recording scenario values.

This repository currently provides a Python launcher, not a standalone installer or executable. The launcher requires Python and GridMind's desktop dependencies. To remove it, uninstall GridMind from the Python environment where it was installed (`python -m pip uninstall gridmind`); remove the log folder separately if desired. No Windows installer, desktop shortcut, or clean Windows installation has been produced or verified.

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

Timestamps must be timezone-aware and strictly increasing by absolute time. Demand, solar, and tariff series must refer to the same instants, spaced according to `interval_minutes`; this distinguishes repeated local hours at daylight-saving transitions. Battery efficiencies are fractions in (0, 1]. `min_soc_kwh` and `max_soc_kwh` set the usable state-of-charge range; the maximum defaults to battery capacity, and the initial state must lie within the configured range. The optimizer preserves the starting state of charge at the end of the horizon by default; set `terminal_soc_kwh` to choose another valid ending level. By default it may charge from the grid when that reduces the modeled total cost. Set `allow_grid_charging=False` to prohibit this.

Simulation and optimization raise a clear `ValueError` if otherwise finite inputs produce non-finite interval flows or tariff totals due to numeric overflow. Result metrics reject non-finite or malformed interval data rather than reporting it as valid.

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
