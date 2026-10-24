"""GridMind input models, energy simulation, and dispatch optimization."""

from .models import (
    BatteryConfig, DemandSeries, GridMindConfig, InputData,
    SolarSeries, TariffSeries, TimeSeriesPoint,
)
from .optimizer import (
    OptimizationConfig, OptimizationResult, OptimizedInterval, optimize_dispatch,
)
from .metrics import SimulationMetrics, StrategyComparison, calculate_metrics, compare_strategies
from .simulation import IntervalResult, SimulationResult, simulate
from .reporting import (
    ComparisonRow, GridMindReport, HourlyReportRow, IntervalReportRow,
    ReportChart, generate_report, render_markdown,
)

__all__ = [
    "BatteryConfig", "DemandSeries", "GridMindConfig", "InputData",
    "IntervalResult", "OptimizationConfig", "OptimizationResult",
    "OptimizedInterval", "SimulationResult", "SolarSeries", "TariffSeries",
    "SimulationMetrics", "StrategyComparison", "TimeSeriesPoint",
    "ComparisonRow", "GridMindReport", "HourlyReportRow", "IntervalReportRow",
    "ReportChart",
    "calculate_metrics", "compare_strategies", "optimize_dispatch", "simulate",
    "generate_report", "render_markdown",
]

