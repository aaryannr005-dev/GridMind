from datetime import datetime, timezone, timedelta
import unittest

from gridmind import (
    BatteryConfig,
    DemandSeries,
    GridMindConfig,
    InputData,
    OptimizationConfig,
    SolarSeries,
    TariffSeries,
    TimeSeriesPoint,
    optimize_dispatch,
)

START = datetime(2026, 1, 1, tzinfo=timezone.utc)


def points(values):
    return tuple(TimeSeriesPoint(START + timedelta(hours=index), value) for index, value in enumerate(values))


def make_inputs(demand, solar, import_rates, export_rates=None):
    exports = points(export_rates) if export_rates is not None else None
    return InputData(
        DemandSeries(points(demand)),
        SolarSeries(points(solar)),
        TariffSeries(points(import_rates), exports),
    )


class OptimizerTests(unittest.TestCase):
    def test_shifts_grid_charge_from_cheap_to_expensive_period(self):
        config = GridMindConfig(BatteryConfig(1, 1, 1))
        result = optimize_dispatch(
            config,
            make_inputs([0, 1], [0, 0], [0.1, 1.0]),
            OptimizationConfig(soc_step_kwh=0.5),
        )
        charge, discharge = result.intervals
        self.assertAlmostEqual(charge.battery_charge_from_grid_kwh, 1.0)
        self.assertAlmostEqual(charge.grid_import_kwh, 1.0)
        self.assertAlmostEqual(discharge.battery_discharge_kwh, 1.0)
        self.assertAlmostEqual(discharge.grid_import_kwh, 0.0)
        self.assertAlmostEqual(result.total_cost, 0.1)
        self.assertAlmostEqual(result.terminal_soc_kwh, 0.0)

    def test_solar_surplus_charges_battery_before_export(self):
        config = GridMindConfig(BatteryConfig(1, 1, 1))
        result = optimize_dispatch(
            config,
            make_inputs([0, 1], [1, 0], [0, 1]),
            OptimizationConfig(soc_step_kwh=0.5),
        )
        self.assertAlmostEqual(result.intervals[0].battery_charge_from_solar_kwh, 1.0)
        self.assertAlmostEqual(result.intervals[1].battery_discharge_kwh, 1.0)
        self.assertAlmostEqual(result.total_cost, 0.0)

    def test_can_disable_grid_charging(self):
        config = GridMindConfig(BatteryConfig(1, 1, 1))
        result = optimize_dispatch(
            config,
            make_inputs([0, 1], [0, 0], [0.1, 1.0]),
            OptimizationConfig(soc_step_kwh=0.5, allow_grid_charging=False),
        )
        self.assertAlmostEqual(result.intervals[0].battery_charge_kwh, 0.0)
        self.assertAlmostEqual(result.intervals[1].grid_import_kwh, 1.0)
        self.assertAlmostEqual(result.total_cost, 1.0)

    def test_enforces_power_efficiency_and_soc_limits(self):
        config = GridMindConfig(BatteryConfig(1, 0.5, 0.5, 0.8, 0.5))
        result = optimize_dispatch(
            config,
            make_inputs([0, 1], [1, 0], [0, 1]),
            OptimizationConfig(soc_step_kwh=0.2),
        )
        first, second = result.intervals
        self.assertAlmostEqual(first.battery_charge_from_solar_kwh, 0.5)
        self.assertAlmostEqual(first.state_of_charge_kwh, 0.4)
        self.assertAlmostEqual(second.battery_discharge_kwh, 0.2)
        self.assertAlmostEqual(second.grid_import_kwh, 0.8)
        self.assertAlmostEqual(second.state_of_charge_kwh, 0.0)

    def test_terminal_soc_can_be_set_explicitly(self):
        config = GridMindConfig(BatteryConfig(1, 1, 1))
        result = optimize_dispatch(
            config,
            make_inputs([0], [1], [0]),
            OptimizationConfig(soc_step_kwh=0.5, terminal_soc_kwh=1),
        )
        self.assertAlmostEqual(result.terminal_soc_kwh, 1.0)
        self.assertAlmostEqual(result.intervals[0].state_of_charge_kwh, 1.0)

    def test_rejects_terminal_soc_above_capacity(self):
        config = GridMindConfig(BatteryConfig(1, 1, 1))
        with self.assertRaisesRegex(ValueError, "cannot exceed"):
            optimize_dispatch(
                config,
                make_inputs([0], [0], [0]),
                OptimizationConfig(terminal_soc_kwh=2),
            )

    def test_rejects_invalid_resolution(self):
        with self.assertRaisesRegex(ValueError, "positive finite"):
            OptimizationConfig(soc_step_kwh=0)

    def test_result_energy_balances_hold(self):
        result = optimize_dispatch(
            GridMindConfig(BatteryConfig(2, 1, 1, 0.9, 0.8)),
            make_inputs([1, 0], [0, 1], [0.5, 0.1], [0, 0.2]),
            OptimizationConfig(soc_step_kwh=0.25),
        )
        for item in result.intervals:
            self.assertAlmostEqual(
                item.demand_kwh,
                item.solar_to_load_kwh + item.battery_discharge_kwh + item.grid_import_kwh - item.battery_charge_from_grid_kwh,
            )
            self.assertAlmostEqual(
                item.solar_generation_kwh,
                item.solar_to_load_kwh + item.battery_charge_from_solar_kwh + item.grid_export_kwh,
            )
            self.assertAlmostEqual(
                item.battery_charge_kwh,
                item.battery_charge_from_solar_kwh + item.battery_charge_from_grid_kwh,
            )


if __name__ == "__main__":
    unittest.main()
