from datetime import datetime, timedelta, timezone

import pytest

from gridmind.models import (
    BatteryConfig, DemandSeries, GridConfig, GridMindConfig, InputData,
    SolarSeries, TariffSeries, TimeSeriesPoint,
)
from gridmind.optimizer import OptimizationConfig
from gridmind.scenario_analysis import (
    SensitivityMetric, SensitivityParameter, run_sensitivity_analysis,
)


def make_inputs(demand=(1.0, 1.0), solar=(0.5, 0.5), import_rates=(1.0, 1.0),
                export_rates=(0.2, 0.2)):
    start = datetime(2026, 1, 1, tzinfo=timezone.utc)

    def series(values):
        return tuple(
            TimeSeriesPoint(start + timedelta(hours=index), value)
            for index, value in enumerate(values)
        )

    return InputData(
        demand=DemandSeries(series(demand)),
        solar=SolarSeries(series(solar)),
        tariffs=TariffSeries(
            import_rates=series(import_rates),
            export_rates=series(export_rates) if export_rates is not None else None,
        ),
    )


def make_config():
    return GridMindConfig(BatteryConfig(
        capacity_kwh=2, max_charge_power_kw=1, max_discharge_power_kw=1,
        initial_soc_kwh=0,
    ))


def test_demand_sensitivity_reports_baseline_and_changes():
    report = run_sensitivity_analysis(
        make_config(), make_inputs(),
        parameter=SensitivityParameter.DEMAND,
        multipliers=(0.5, 1.0, 1.5),
        metric=SensitivityMetric.NET_COST,
    )
    assert report.baseline_value == pytest.approx(1.0)
    assert [point.multiplier for point in report.points] == [0.5, 1.0, 1.5]
    assert report.points[1].metric_value == pytest.approx(report.baseline_value)
    assert report.points[1].absolute_change == 0
    assert report.points[0].metric_value == pytest.approx(0.0)
    assert report.points[2].metric_value == pytest.approx(2.0)
    assert report.points[2].absolute_change == pytest.approx(1.0)
    assert report.points[2].percentage_change == pytest.approx(100.0)


def test_solar_sensitivity_changes_grid_import():
    report = run_sensitivity_analysis(
        make_config(), make_inputs(),
        parameter=SensitivityParameter.SOLAR_GENERATION,
        multipliers=(0.0, 1.0, 2.0),
        metric=SensitivityMetric.GRID_IMPORT_KWH,
    )
    assert [point.metric_value for point in report.points] == pytest.approx([2.0, 1.0, 0.0])


def test_tariff_sensitivity_changes_net_cost():
    report = run_sensitivity_analysis(
        make_config(), make_inputs(),
        parameter=SensitivityParameter.IMPORT_TARIFF,
        multipliers=(0.5, 1.0, 2.0),
        metric=SensitivityMetric.NET_COST,
    )
    assert [point.metric_value for point in report.points] == pytest.approx([0.25, 0.5, 1.0])


def test_export_tariff_requires_export_series():
    with pytest.raises(ValueError, match="requires an export tariff series"):
        run_sensitivity_analysis(
            make_config(), make_inputs(export_rates=None),
            parameter=SensitivityParameter.EXPORT_TARIFF,
            multipliers=(0.5, 1.0),
        )


def test_infeasible_grid_cap_scenario_is_reported_not_silently_dropped():
    config = GridMindConfig(
        BatteryConfig(1, 1, 1),
        grid=GridConfig(max_import_power_kw=1.0),
    )
    report = run_sensitivity_analysis(
        config, make_inputs(demand=(1.0, 1.0), solar=(0.0, 0.0)),
        parameter=SensitivityParameter.DEMAND,
        multipliers=(1.0, 2.0),
    )
    assert report.points[0].feasible is True
    assert report.points[1].feasible is False
    assert "grid import exceeds" in report.points[1].error


def test_optimizer_can_be_used_for_each_sensitivity_case():
    report = run_sensitivity_analysis(
        make_config(), make_inputs(),
        parameter=SensitivityParameter.IMPORT_TARIFF,
        multipliers=(0.5, 1.0, 2.0),
        optimization_options=OptimizationConfig(soc_step_kwh=0.5),
    )
    assert all(point.feasible for point in report.points)
    assert report.metric is SensitivityMetric.NET_COST


@pytest.mark.parametrize("multipliers", [(), (0,), (-1,), (float("nan"),), (float("inf"),), (True,), (1, 1)])
def test_rejects_invalid_multipliers(multipliers):
    with pytest.raises(ValueError, match="multipliers"):
        run_sensitivity_analysis(
            make_config(), make_inputs(),
            parameter=SensitivityParameter.DEMAND,
            multipliers=multipliers,
        )


def test_rejects_invalid_parameter_and_metric():
    with pytest.raises(ValueError, match="SensitivityParameter"):
        run_sensitivity_analysis(
            make_config(), make_inputs(), parameter="demand", multipliers=(1.0,),
        )
    with pytest.raises(ValueError, match="SensitivityMetric"):
        run_sensitivity_analysis(
            make_config(), make_inputs(), parameter=SensitivityParameter.DEMAND,
            multipliers=(1.0,), metric="net_cost",
        )


def test_percentage_change_is_none_when_baseline_is_zero():
    report = run_sensitivity_analysis(
        make_config(), make_inputs(solar=(2.0, 2.0), demand=(1.0, 1.0), export_rates=(0.0, 0.0)),
        parameter=SensitivityParameter.DEMAND,
        multipliers=(1.0, 2.0),
    )
    assert report.baseline_value == 0.0
    assert report.points[1].percentage_change is None
