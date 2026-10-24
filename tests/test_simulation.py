from datetime import datetime, timezone, timedelta
import unittest

from gridmind import (
    BatteryConfig,
    DemandSeries,
    GridMindConfig,
    InputData,
    SolarSeries,
    TariffSeries,
    TimeSeriesPoint,
    simulate,
)

START = datetime(2026, 1, 1, tzinfo=timezone.utc)


def series(values, start=START, step=timedelta(hours=1)):
    return tuple(TimeSeriesPoint(start + index * step, value) for index, value in enumerate(values))


def inputs(demand, solar, import_rates=None, export_rates=None):
    demand_points = series(demand)
    solar_points = series(solar)
    import_points = series(import_rates or [0.0] * len(demand))
    export_points = series(export_rates) if export_rates is not None else None
    return InputData(
        DemandSeries(demand_points),
        SolarSeries(solar_points),
        TariffSeries(import_points, export_points),
    )


class SimulationTests(unittest.TestCase):
    def test_solar_serves_load_before_export_and_grid_import(self):
        config = GridMindConfig(BatteryConfig(5, 0, 0))
        result = simulate(config, inputs([2.0, 1.0], [0.5, 2.0], [0.30, 0.30], [0.10, 0.10]))
        first, second = result.intervals
        self.assertAlmostEqual(first.solar_to_load_kwh, 0.5)
        self.assertAlmostEqual(first.grid_import_kwh, 1.5)
        self.assertAlmostEqual(second.solar_to_load_kwh, 1.0)
        self.assertAlmostEqual(second.grid_export_kwh, 1.0)
        self.assertAlmostEqual(result.total_net_cost, 0.35)
        self.assertEqual(result.currency, "MYR")

    def test_surplus_solar_charges_battery_for_later_demand(self):
        config = GridMindConfig(BatteryConfig(2, 1, 1))
        result = simulate(config, inputs([0.0, 1.0], [1.0, 0.0]))
        charge, discharge = result.intervals
        self.assertAlmostEqual(charge.battery_charge_kwh, 1.0)
        self.assertAlmostEqual(charge.state_of_charge_kwh, 1.0)
        self.assertAlmostEqual(discharge.battery_discharge_kwh, 1.0)
        self.assertAlmostEqual(discharge.state_of_charge_kwh, 0.0)
        self.assertAlmostEqual(discharge.grid_import_kwh, 0.0)

    def test_power_capacity_and_efficiency_limits_are_applied(self):
        battery = BatteryConfig(2, 0.5, 0.5, 0.8, 0.5)
        result = simulate(GridMindConfig(battery), inputs([0.0, 2.0], [2.0, 0.0]))
        charge, discharge = result.intervals
        self.assertAlmostEqual(charge.battery_charge_kwh, 0.5)
        self.assertAlmostEqual(charge.state_of_charge_kwh, 0.4)
        self.assertAlmostEqual(discharge.battery_discharge_kwh, 0.2)
        self.assertAlmostEqual(discharge.grid_import_kwh, 1.8)
        self.assertAlmostEqual(discharge.state_of_charge_kwh, 0.0)

    def test_respects_minimum_and_maximum_battery_soc(self):
        battery = BatteryConfig(5, 5, 5, initial_soc_kwh=2, min_soc_kwh=1, max_soc_kwh=3)
        result = simulate(
            GridMindConfig(battery),
            inputs([5.0, 0.0], [0.0, 5.0]),
        )
        discharge, charge = result.intervals
        self.assertAlmostEqual(discharge.battery_discharge_kwh, 1.0)
        self.assertAlmostEqual(discharge.state_of_charge_kwh, 1.0)
        self.assertAlmostEqual(charge.battery_charge_kwh, 2.0)
        self.assertAlmostEqual(charge.state_of_charge_kwh, 3.0)

    def test_interval_energy_balances_hold(self):
        result = simulate(
            GridMindConfig(BatteryConfig(3, 1, 1, 0.9, 0.8, 0.5)),
            inputs([2.0, 0.2], [1.0, 1.0]),
        )
        for interval in result.intervals:
            self.assertAlmostEqual(interval.demand_kwh, interval.solar_to_load_kwh + interval.battery_discharge_kwh + interval.grid_import_kwh)
            self.assertAlmostEqual(interval.solar_generation_kwh, interval.solar_to_load_kwh + interval.battery_charge_kwh + interval.grid_export_kwh)

    def test_rejects_irregular_spacing_for_configured_interval(self):
        demand = DemandSeries(series([1.0, 1.0], step=timedelta(minutes=30)))
        solar = SolarSeries(series([0.0, 0.0], step=timedelta(minutes=30)))
        tariffs = TariffSeries(series([0.2, 0.2], step=timedelta(minutes=30)))
        with self.assertRaisesRegex(ValueError, "interval_minutes"):
            simulate(GridMindConfig(BatteryConfig(1, 1, 1), interval_minutes=60), InputData(demand, solar, tariffs))

    def test_costs_and_export_credits_use_per_interval_rates(self):
        result = simulate(
            GridMindConfig(BatteryConfig(1, 0, 0)),
            inputs([1.0, 0.0], [0.0, 1.0], [0.5, 0.2], [0.0, -0.1]),
        )
        self.assertAlmostEqual(result.intervals[0].import_cost, 0.5)
        self.assertAlmostEqual(result.intervals[1].export_credit, -0.1)
        self.assertAlmostEqual(result.total_net_cost, 0.6)


if __name__ == "__main__":
    unittest.main()
