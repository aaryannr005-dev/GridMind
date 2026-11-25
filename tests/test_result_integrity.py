from datetime import datetime, timezone

from gridmind import (
    BatteryConfig,
    DemandSeries,
    GridConfig,
    GridMindConfig,
    InputData,
    SolarSeries,
    TariffSeries,
    TimeSeriesPoint,
    calculate_metrics,
)
from gridmind.simulation import IntervalResult, SimulationResult


def make_inputs(demand, solar, import_rate=0.2, export_rate=0.1):
    timestamp = datetime(2026, 1, 1, tzinfo=timezone.utc)
    return InputData(
        DemandSeries((TimeSeriesPoint(timestamp, demand),)),
        SolarSeries((TimeSeriesPoint(timestamp, solar),)),
        TariffSeries(
            (TimeSeriesPoint(timestamp, import_rate),),
            (TimeSeriesPoint(timestamp, export_rate),),
        ),
    )


def test_metrics_reject_negative_grid_flow_even_when_energy_equations_balance():
    config = GridMindConfig(BatteryConfig(2.0, 0.0, 2.0, initial_soc_kwh=2.0))
    inputs = make_inputs(1.0, 0.0)
    timestamp = inputs.demand.points[0].timestamp
    tampered = SimulationResult(
        intervals=(IntervalResult(
            timestamp=timestamp,
            demand_kwh=1.0,
            solar_generation_kwh=0.0,
            solar_to_load_kwh=0.0,
            battery_charge_kwh=0.0,
            battery_discharge_kwh=2.0,
            grid_import_kwh=-1.0,
            grid_export_kwh=0.0,
            state_of_charge_kwh=0.0,
            import_cost=-0.2,
            export_credit=0.0,
            net_cost=-0.2,
        ),),
        currency="MYR",
    )

    metrics = calculate_metrics(tampered, config, inputs)

    assert metrics.energy_balance_valid is False
    assert metrics.battery_constraints_valid is True
    assert metrics.tariff_costs_valid is True


def test_metrics_detect_grid_import_cap_violation_in_supplied_result():
    config = GridMindConfig(
        BatteryConfig(1.0, 0.0, 0.0),
        grid=GridConfig(max_import_power_kw=0.5),
    )
    inputs = make_inputs(1.0, 0.0)
    timestamp = inputs.demand.points[0].timestamp
    tampered = SimulationResult(
        intervals=(IntervalResult(
            timestamp=timestamp,
            demand_kwh=1.0,
            solar_generation_kwh=0.0,
            solar_to_load_kwh=0.0,
            battery_charge_kwh=0.0,
            battery_discharge_kwh=0.0,
            grid_import_kwh=1.0,
            grid_export_kwh=0.0,
            state_of_charge_kwh=0.0,
            import_cost=0.2,
            export_credit=0.0,
            net_cost=0.2,
        ),),
        currency="MYR",
    )

    metrics = calculate_metrics(tampered, config, inputs)

    assert metrics.energy_balance_valid is True
    assert metrics.battery_constraints_valid is True
    assert metrics.grid_constraints_valid is False
    assert metrics.tariff_costs_valid is True


def test_metrics_detect_grid_export_cap_violation_in_supplied_result():
    config = GridMindConfig(
        BatteryConfig(1.0, 0.0, 0.0),
        grid=GridConfig(max_export_power_kw=0.5),
    )
    inputs = make_inputs(0.0, 1.0)
    timestamp = inputs.demand.points[0].timestamp
    tampered = SimulationResult(
        intervals=(IntervalResult(
            timestamp=timestamp,
            demand_kwh=0.0,
            solar_generation_kwh=1.0,
            solar_to_load_kwh=0.0,
            battery_charge_kwh=0.0,
            battery_discharge_kwh=0.0,
            grid_import_kwh=0.0,
            grid_export_kwh=1.0,
            state_of_charge_kwh=0.0,
            import_cost=0.0,
            export_credit=0.1,
            net_cost=-0.1,
        ),),
        currency="MYR",
    )

    metrics = calculate_metrics(tampered, config, inputs)

    assert metrics.energy_balance_valid is True
    assert metrics.grid_constraints_valid is False
