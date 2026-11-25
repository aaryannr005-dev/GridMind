"""GridMind input models, simulation, optimization, metrics, reports, and public data."""

from .forecasting import ForecastEvaluation, ForecastMethod, ForecastResult, evaluate_forecast, forecast_series
from .scenario_analysis import (
    SensitivityMetric, SensitivityParameter, SensitivityPoint, SensitivityReport,
    run_sensitivity_analysis,
)
from .models import (
    BatteryConfig, DemandSeries, GridConfig, GridMindConfig, InputData,
    PvConfig, SolarSeries, TariffSeries, TimeSeriesPoint,
)
from .optimizer import (
    OptimizationConfig, OptimizationResult, OptimizedInterval, optimize_dispatch,
)
from .pv import apply_temperature_derating, cell_temperature_c, temperature_derate_factor
from .metrics import SimulationMetrics, StrategyComparison, calculate_metrics, compare_strategies
from .simulation import IntervalResult, SimulationResult, simulate
from .simulation_validation import (
    ChannelValidation, ReferenceMeasurements, SimulationValidationReport,
    validate_simulation_against_reference,
)
from .reporting import (
    ComparisonRow, GridMindReport, HourlyReportRow, IntervalReportRow,
    ReportChart, generate_report, render_markdown,
)
from .public_data_acquisition import DownloadedPublicData, PublicDataDownloadError, download_open_dosm_csv
from .public_data_quality import (
    CategoryQuality, DataQualityPolicy, DataQualityReport, evaluate_data_quality,
)
from .public_data import (
    ELECTRICITY_CONSUMPTION,
    ELECTRICITY_SUPPLY,
    OPEN_DOSM_DATASETS,
    DatasetMetadata,
    MissingPeriod,
    MonthlyObservation,
    ObservationStatus,
    OpenDosmDataset,
    OpenDosmSeries,
    load_open_dosm_csv,
)

__all__ = [
    "BatteryConfig", "DemandSeries", "GridConfig", "GridMindConfig", "InputData",
    "ForecastEvaluation", "ForecastMethod", "ForecastResult", "evaluate_forecast", "forecast_series",
    "SensitivityMetric", "SensitivityParameter", "SensitivityPoint", "SensitivityReport",
    "run_sensitivity_analysis",
    "IntervalResult", "OptimizationConfig", "OptimizationResult",
    "OptimizedInterval", "PvConfig", "SimulationResult", "SolarSeries", "TariffSeries",
    "SimulationMetrics", "StrategyComparison", "TimeSeriesPoint",
    "ComparisonRow", "GridMindReport", "HourlyReportRow", "IntervalReportRow",
    "ReportChart", "DatasetMetadata", "MissingPeriod", "MonthlyObservation",
    "ObservationStatus", "OpenDosmDataset", "OpenDosmSeries",
    "ELECTRICITY_CONSUMPTION", "ELECTRICITY_SUPPLY", "OPEN_DOSM_DATASETS",
    "DownloadedPublicData", "PublicDataDownloadError", "download_open_dosm_csv",
    "CategoryQuality", "DataQualityPolicy", "DataQualityReport", "evaluate_data_quality",
    "ChannelValidation", "ReferenceMeasurements", "SimulationValidationReport",
    "validate_simulation_against_reference",
    "calculate_metrics", "compare_strategies", "optimize_dispatch", "simulate",
    "generate_report", "render_markdown", "load_open_dosm_csv",
    "apply_temperature_derating", "cell_temperature_c", "temperature_derate_factor",
]
