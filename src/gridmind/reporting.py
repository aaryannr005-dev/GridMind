"""Structured, reproducible reports and dependency-free SVG charts.

Reporting consumes completed simulation outputs and the metrics layer; it
does not run or alter dispatch. Energy values are kWh per interval, and SOC is
reported as a percentage of configured battery capacity.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
import hashlib
import html
import json
import math
from typing import Iterable

from .metrics import SimulationMetrics, StrategyComparison, SimulationOutput, calculate_metrics, compare_strategies
from .models import GridMindConfig, InputData


@dataclass(frozen=True, slots=True)
class IntervalReportRow:
    timestamp: datetime
    demand_kwh: float
    solar_generation_kwh: float
    direct_solar_kwh: float
    battery_charge_kwh: float
    battery_discharge_kwh: float
    grid_import_kwh: float
    grid_export_kwh: float
    state_of_charge_percent: float
    import_cost: float
    export_credit: float
    net_cost: float
    solar_curtailment_kwh: float = 0.0
    battery_charge_from_grid_kwh: float = 0.0


@dataclass(frozen=True, slots=True)
class HourlyReportRow:
    """Energy totals for intervals whose start timestamps fall in this hour."""
    hour_start: datetime
    interval_count: int
    demand_kwh: float
    solar_generation_kwh: float
    direct_solar_kwh: float
    battery_charge_kwh: float
    battery_discharge_kwh: float
    grid_import_kwh: float
    grid_export_kwh: float
    state_of_charge_percent: float
    net_cost: float


@dataclass(frozen=True, slots=True)
class ComparisonRow:
    metric: str
    unit: str
    baseline: float
    gridmind: float
    change: float
    change_percent: float | None
    favorable_direction: str


@dataclass(frozen=True, slots=True)
class ReportChart:
    title: str
    description: str
    svg: str


@dataclass(frozen=True, slots=True)
class GridMindReport:
    scenario_fingerprint: str
    period_start: datetime
    period_end: datetime
    interval_minutes: int
    interval_count: int
    duration_hours: float
    currency: str
    baseline: SimulationMetrics
    gridmind: SimulationMetrics | None
    comparison: StrategyComparison | None
    baseline_intervals: tuple[IntervalReportRow, ...]
    gridmind_intervals: tuple[IntervalReportRow, ...] | None
    baseline_hourly: tuple[HourlyReportRow, ...] | None
    gridmind_hourly: tuple[HourlyReportRow, ...] | None
    comparison_rows: tuple[ComparisonRow, ...]
    assumptions: tuple[str, ...]
    limitations: tuple[str, ...]
    charts: tuple[ReportChart, ...]


def _rows(result: SimulationOutput, config: GridMindConfig) -> tuple[IntervalReportRow, ...]:
    rows = []
    for interval in result.intervals:
        rows.append(IntervalReportRow(
            timestamp=interval.timestamp,
            demand_kwh=interval.demand_kwh,
            solar_generation_kwh=interval.solar_generation_kwh,
            direct_solar_kwh=interval.solar_to_load_kwh,
            battery_charge_kwh=interval.battery_charge_kwh,
            battery_discharge_kwh=interval.battery_discharge_kwh,
            grid_import_kwh=interval.grid_import_kwh,
            grid_export_kwh=interval.grid_export_kwh,
            state_of_charge_percent=100.0 * interval.state_of_charge_kwh / config.battery.capacity_kwh,
            import_cost=interval.import_cost,
            export_credit=interval.export_credit,
            net_cost=interval.net_cost,
            solar_curtailment_kwh=getattr(interval, "solar_curtailment_kwh", 0.0),
            battery_charge_from_grid_kwh=getattr(interval, "battery_charge_from_grid_kwh", 0.0),
        ))
    return tuple(rows)


def _hourly(rows: tuple[IntervalReportRow, ...], interval_minutes: int) -> tuple[HourlyReportRow, ...] | None:
    # Do not split intervals that cross clock-hour boundaries or invent data
    # for multi-hour intervals.
    if interval_minutes > 60 or 60 % interval_minutes:
        return None
    if any(row.timestamp.minute % interval_minutes or row.timestamp.second or row.timestamp.microsecond for row in rows):
        return None
    grouped: dict[datetime, list[IntervalReportRow]] = {}
    for row in rows:
        hour = row.timestamp.replace(minute=0, second=0, microsecond=0)
        grouped.setdefault(hour, []).append(row)
    return tuple(HourlyReportRow(
        hour_start=hour,
        interval_count=len(items),
        demand_kwh=sum(item.demand_kwh for item in items),
        solar_generation_kwh=sum(item.solar_generation_kwh for item in items),
        direct_solar_kwh=sum(item.direct_solar_kwh for item in items),
        battery_charge_kwh=sum(item.battery_charge_kwh for item in items),
        battery_discharge_kwh=sum(item.battery_discharge_kwh for item in items),
        grid_import_kwh=sum(item.grid_import_kwh for item in items),
        grid_export_kwh=sum(item.grid_export_kwh for item in items),
        state_of_charge_percent=items[-1].state_of_charge_percent,
        net_cost=sum(item.net_cost for item in items),
    ) for hour, items in sorted(grouped.items()))


def _comparison_rows(comparison: StrategyComparison) -> tuple[ComparisonRow, ...]:
    b, g = comparison.baseline, comparison.optimized
    fields: Iterable[tuple[str, str, float, float, float, float | None, str]] = (
        ("Grid imports", "kWh", b.grid_import_kwh, g.grid_import_kwh, comparison.grid_import_reduction_kwh, comparison.grid_import_reduction_percent, "decrease"),
        ("Net electricity cost", b.currency, b.net_cost, g.net_cost, comparison.cost_savings, comparison.cost_savings_percent, "decrease"),
        ("Solar self-consumption", "kWh", b.solar_self_consumption_kwh, g.solar_self_consumption_kwh, comparison.solar_self_consumption_change_kwh, comparison.solar_self_consumption_change_percent, "objective-dependent"),
        ("Grid exports", "kWh", b.grid_export_kwh, g.grid_export_kwh, comparison.solar_export_change_kwh, comparison.solar_export_change_percent, "objective-dependent"),
        ("Battery charged", "kWh", b.battery_charge_kwh, g.battery_charge_kwh, comparison.battery_charge_change_kwh, comparison.battery_charge_change_percent, "objective-dependent"),
        ("Battery discharged", "kWh", b.battery_discharge_kwh, g.battery_discharge_kwh, comparison.battery_discharge_change_kwh, comparison.battery_discharge_change_percent, "objective-dependent"),
    )
    return tuple(ComparisonRow(*field) for field in fields)


_COLORS = ("#2563eb", "#f59e0b", "#16a34a", "#dc2626", "#7c3aed", "#0891b2")


def _line_chart(title: str, labels: tuple[str, ...], series: tuple[tuple[str, tuple[float, ...]], ...], unit: str) -> str:
    width, height = 820, 360
    left, right, top, bottom = 64, 24, 44, 72
    plot_w, plot_h = width-left-right, height-top-bottom
    values = [v for _, data in series for v in data]
    ceiling = max(max(values, default=0), 1e-12)
    floor = min(min(values, default=0), 0)
    if math.isclose(ceiling, floor):
        ceiling = floor + 1
    def xy(i: int, value: float) -> tuple[float, float]:
        x = left + (plot_w * i / max(len(labels)-1, 1))
        y = top + plot_h * (ceiling-value)/(ceiling-floor)
        return x, y
    parts = [f'<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="{html.escape(title)}" viewBox="0 0 {width} {height}">',
             '<rect width="100%" height="100%" fill="white"/>',
             f'<text x="{left}" y="25" font-family="sans-serif" font-size="17" font-weight="bold">{html.escape(title)}</text>']
    for tick in range(5):
        value = floor + (ceiling-floor)*tick/4
        y = top + plot_h*(1-tick/4)
        parts.append(f'<line x1="{left}" y1="{y:.1f}" x2="{width-right}" y2="{y:.1f}" stroke="#e5e7eb"/>')
        parts.append(f'<text x="{left-8}" y="{y+4:.1f}" text-anchor="end" font-family="sans-serif" font-size="11">{value:.2f}</text>')
    parts.append(f'<text x="14" y="{top+plot_h/2:.1f}" transform="rotate(-90 14 {top+plot_h/2:.1f})" font-family="sans-serif" font-size="11">{html.escape(unit)}</text>')
    if labels:
        indices = sorted(set((0, len(labels)//2, len(labels)-1)))
        for i in indices:
            x, _ = xy(i, floor)
            parts.append(f'<text x="{x:.1f}" y="{height-48}" text-anchor="middle" font-family="sans-serif" font-size="10">{html.escape(labels[i])}</text>')
    for series_index, (name, data) in enumerate(series):
        if not data:
            continue
        pts = " ".join(f"{x:.1f},{y:.1f}" for i, value in enumerate(data) for x, y in [xy(i, value)])
        color = _COLORS[series_index % len(_COLORS)]
        parts.append(f'<polyline fill="none" stroke="{color}" stroke-width="2.2" points="{pts}"/>')
        legend_x = left + (series_index % 3) * 235
        legend_y = height - 18 - (series_index // 3) * 18
        parts.append(f'<line x1="{legend_x}" y1="{legend_y-4}" x2="{legend_x+20}" y2="{legend_y-4}" stroke="{color}" stroke-width="3"/>')
        parts.append(f'<text x="{legend_x+26}" y="{legend_y}" font-family="sans-serif" font-size="11">{html.escape(name)}</text>')
    parts.append("</svg>")
    return "".join(parts)


def _comparison_chart(rows: tuple[ComparisonRow, ...]) -> str:
    # Side-by-side bars are normalized per metric so mixed units are never
    # presented on a shared numeric scale. Exact values remain in the table.
    width, row_h, height = 820, 42, 70 + 42*len(rows)
    parts = [f'<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Baseline and GridMind metric comparison" viewBox="0 0 {width} {height}">',
             '<rect width="100%" height="100%" fill="white"/>',
             '<text x="18" y="25" font-family="sans-serif" font-size="17" font-weight="bold">Baseline vs GridMind (each pair scaled to its own maximum)</text>']
    for index, row in enumerate(rows):
        y = 52 + index*row_h
        maximum = max(abs(row.baseline), abs(row.gridmind), 1e-12)
        parts.append(f'<text x="18" y="{y+10}" font-family="sans-serif" font-size="11">{html.escape(row.metric)} ({html.escape(row.unit)})</text>')
        for val, yy, color in ((row.baseline, y+15, "#94a3b8"), (row.gridmind, y+28, "#2563eb")):
            bar_w = 360*abs(val)/maximum
            parts.append(f'<rect x="190" y="{yy-8}" width="{bar_w:.2f}" height="8" fill="{color}"/>')
            parts.append(f'<text x="{min(558, 196+bar_w):.1f}" y="{yy-1}" font-family="sans-serif" font-size="9">{val:.3g}</text>')
    parts.append('</svg>')
    return "".join(parts)


def generate_report(
    baseline: SimulationOutput,
    config: GridMindConfig,
    inputs: InputData,
    gridmind: SimulationOutput | None = None,
) -> GridMindReport:
    """Build a reproducible report from one baseline and optional optimized run.

    Every supplied result is validated by the existing metrics layer. If an
    optimized run is omitted, comparison fields and chart are omitted.
    """
    baseline_metrics = calculate_metrics(baseline, config, inputs)
    optimized_metrics = calculate_metrics(gridmind, config, inputs) if gridmind is not None else None
    comparison = compare_strategies(baseline, gridmind, config, inputs) if gridmind is not None else None
    base_rows = _rows(baseline, config)
    grid_rows = _rows(gridmind, config) if gridmind is not None else None
    hourly = _hourly(base_rows, config.interval_minutes)
    grid_hourly = _hourly(grid_rows, config.interval_minutes) if grid_rows is not None else None
    comparisons = _comparison_rows(comparison) if comparison is not None else ()

    canonical = {
        "interval_minutes": config.interval_minutes,
        "currency": config.currency,
        "battery": {name: getattr(config.battery, name) for name in (
            "capacity_kwh", "max_charge_power_kw", "max_discharge_power_kw",
            "charge_efficiency", "discharge_efficiency", "initial_soc_kwh",
            "min_soc_kwh", "max_soc_kwh")},
        "demand": [(point.timestamp.isoformat(), point.value) for point in inputs.demand.points],
        "solar": [(point.timestamp.isoformat(), point.value) for point in inputs.solar.points],
        "import_rates": [(point.timestamp.isoformat(), point.value) for point in inputs.tariffs.import_rates],
        "export_rates": None if inputs.tariffs.export_rates is None else [(point.timestamp.isoformat(), point.value) for point in inputs.tariffs.export_rates],
    }
    fingerprint = hashlib.sha256(json.dumps(canonical, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    def plot_values(rows: tuple[IntervalReportRow, ...], hourly_rows: tuple[HourlyReportRow, ...] | None):
        display = hourly_rows if hourly_rows is not None else rows
        timestamps = tuple((row.hour_start if isinstance(row, HourlyReportRow) else row.timestamp).strftime("%m-%d %H:%M") for row in display)
        return display, timestamps

    base_plot, base_labels = plot_values(base_rows, hourly)
    grid_plot, _ = plot_values(grid_rows, grid_hourly) if grid_rows is not None else (None, None)
    energy_series = [
        ("Demand", tuple(r.demand_kwh for r in base_plot)),
        ("Solar generation", tuple(r.solar_generation_kwh for r in base_plot)),
        ("Baseline grid import", tuple(r.grid_import_kwh for r in base_plot)),
        ("Baseline grid export", tuple(r.grid_export_kwh for r in base_plot)),
    ]
    battery_series = [
        ("Baseline charge", tuple(r.battery_charge_kwh for r in base_plot)),
        ("Baseline discharge", tuple(r.battery_discharge_kwh for r in base_plot)),
    ]
    soc_series = [("Baseline SOC", tuple(r.state_of_charge_percent for r in base_plot))]
    if grid_plot is not None:
        energy_series.extend((
            ("GridMind grid import", tuple(r.grid_import_kwh for r in grid_plot)),
            ("GridMind grid export", tuple(r.grid_export_kwh for r in grid_plot)),
        ))
        battery_series.extend((
            ("GridMind charge", tuple(r.battery_charge_kwh for r in grid_plot)),
            ("GridMind discharge", tuple(r.battery_discharge_kwh for r in grid_plot)),
        ))
        soc_series.append(("GridMind SOC", tuple(r.state_of_charge_percent for r in grid_plot)))
    charts = [ReportChart(
        title="Energy flows by simulation interval",
        description="Uses grouped hourly energy totals when interval length is at most one hour; otherwise shows input intervals.",
        svg=_line_chart("Energy flows by hour or simulation interval", base_labels, tuple(energy_series), "kWh per hour" if hourly is not None else "kWh per interval"),
    ), ReportChart(
        title="Battery activity",
        description="Battery activity is shown as interval energy or grouped hourly energy totals.",
        svg=_line_chart("Battery activity by hour or simulation interval", base_labels, tuple(battery_series), "kWh per hour" if hourly is not None else "kWh per interval"),
    ), ReportChart(
        title="Battery state of charge",
        description="State of charge is percent of configured battery capacity at the end of each interval.",
        svg=_line_chart("Battery state of charge", base_labels, tuple(soc_series), "% of capacity"),
    )]
    if comparisons:
        charts.append(ReportChart("Baseline vs GridMind comparison", "Paired bars are normalized independently by metric. Use the comparison table for exact values.", _comparison_chart(comparisons)))

    assumptions = (
        f"Interval duration is {config.interval_minutes} minutes; energy values are modeled per interval.",
        f"Tariff values and estimated costs use {config.currency}.",
        f"Battery state of charge is displayed as a percent of {config.battery.capacity_kwh:g} kWh nominal capacity.",
        "Import and export tariffs are modeled in currency per kWh; omitted export tariffs produce zero export credit.",
        "Tariffs, demand, and solar generation are the supplied scenario inputs; results are simulated estimates, not measured outcomes.",
        "Baseline and GridMind comparisons use the same input series and configuration.",
    )
    limitations = (
        "Battery degradation, temperature, ageing, and other omitted physical effects are not represented.",
        "Grid limits and export constraints are not modeled by the current engine.",
        "For intervals longer than one hour, no hourly split is inferred; interval-level rows and charts are retained.",
        "For intervals shorter than one hour, hourly totals group intervals by their local start hour; a partial first or last hour remains partial.",
        "Hourly aggregation is omitted when interval boundaries do not align cleanly to clock hours.",
    )
    return GridMindReport(
        scenario_fingerprint=fingerprint,
        period_start=base_rows[0].timestamp,
        period_end=base_rows[-1].timestamp,
        interval_minutes=config.interval_minutes,
        interval_count=len(base_rows),
        duration_hours=len(base_rows)*config.interval_minutes/60,
        currency=config.currency,
        baseline=baseline_metrics,
        gridmind=optimized_metrics,
        comparison=comparison,
        baseline_intervals=base_rows,
        gridmind_intervals=grid_rows,
        baseline_hourly=hourly,
        gridmind_hourly=grid_hourly,
        comparison_rows=comparisons,
        assumptions=assumptions,
        limitations=limitations,
        charts=tuple(charts),
    )


def render_markdown(report: GridMindReport) -> str:
    """Render a compact human-readable summary; chart SVGs remain reusable."""
    lines = ["# GridMind simulation report", "",
             f"Scenario fingerprint: `{report.scenario_fingerprint}`", "",
             f"Period: {report.period_start.isoformat()} to {report.period_end.isoformat()} (interval starts)",
             f"Intervals: {report.interval_count} × {report.interval_minutes} minutes; modeled duration: {report.duration_hours:g} h", "",
             "## Summary", "",
             "| Metric | Baseline | GridMind | Unit |", "|---|---:|---:|---|"]
    def fmt(value: float | None) -> str:
        return "—" if value is None else f"{value:.4g}"
    items = [("Demand", report.baseline.total_demand_kwh, report.gridmind.total_demand_kwh if report.gridmind else None, "kWh"),
             ("Solar generation", report.baseline.total_solar_generation_kwh, report.gridmind.total_solar_generation_kwh if report.gridmind else None, "kWh"),
             ("Grid imports", report.baseline.grid_import_kwh, report.gridmind.grid_import_kwh if report.gridmind else None, "kWh"),
             ("Grid exports", report.baseline.grid_export_kwh, report.gridmind.grid_export_kwh if report.gridmind else None, "kWh"),
             ("Battery charged", report.baseline.battery_charge_kwh, report.gridmind.battery_charge_kwh if report.gridmind else None, "kWh"),
             ("Battery discharged", report.baseline.battery_discharge_kwh, report.gridmind.battery_discharge_kwh if report.gridmind else None, "kWh"),
             ("Net estimated cost", report.baseline.net_cost, report.gridmind.net_cost if report.gridmind else None, report.currency)]
    lines.extend(f"| {name} | {fmt(base)} | {fmt(opt)} | {unit} |" for name, base, opt, unit in items)
    lines += ["", "## Validation", "",
              f"Baseline: energy balance {report.baseline.energy_balance_valid}; battery constraints {report.baseline.battery_constraints_valid}; tariff costs {report.baseline.tariff_costs_valid}."]
    if report.gridmind:
        lines.append(f"GridMind: energy balance {report.gridmind.energy_balance_valid}; battery constraints {report.gridmind.battery_constraints_valid}; tariff costs {report.gridmind.tariff_costs_valid}.")
    if report.comparison_rows:
        lines += ["", "## Baseline vs GridMind", "", "| Metric | Baseline | GridMind | Change | Change % | Unit | Interpretation |", "|---|---:|---:|---:|---:|---|---|"]
        lines.extend(f"| {r.metric} | {fmt(r.baseline)} | {fmt(r.gridmind)} | {fmt(r.change)} | {fmt(r.change_percent)} | {r.unit} | {r.favorable_direction} |" for r in report.comparison_rows)
    lines += ["", "## Assumptions", ""] + [f"- {x}" for x in report.assumptions]
    lines += ["", "## Limitations", ""] + [f"- {x}" for x in report.limitations]
    return "\n".join(lines)+"\n"
