from datetime import date, timedelta
import unittest

from gridmind.dashboard import (
    MALAYSIA_TIME,
    build_hourly_scenario,
    metric_rows,
    profile_rows_to_records,
    run_hourly_scenario,
    synthetic_demo_profile,
)
from gridmind.models import BatteryConfig, GridConfig, PvConfig


class DashboardScenarioTests(unittest.TestCase):
    def setUp(self):
        self.battery = BatteryConfig(
            capacity_kwh=8,
            max_charge_power_kw=3,
            max_discharge_power_kw=3,
            charge_efficiency=0.95,
            discharge_efficiency=0.95,
            initial_soc_kwh=3,
        )
        self.demand = [0.8] * 24
        self.solar = [0.0] * 6 + [0.5, 1, 1.5, 2, 2.5, 3, 3, 2.5, 2, 1.5, 1, 0.5] + [0.0] * 6
        self.import_rates = [0.22] * 24
        self.export_rates = [0.05] * 24

    def test_synthetic_profile_is_complete_and_in_display_units(self):
        rows = synthetic_demo_profile()
        self.assertEqual(len(rows), 24)
        self.assertEqual(rows[0]["Hour (MYT)"], "00:00")
        self.assertEqual(rows[-1]["Hour (MYT)"], "23:00")
        self.assertTrue(all(row["Demand (kWh)"] >= 0 for row in rows))
        self.assertTrue(all(row["Solar generation (kWh)"] >= 0 for row in rows))
        self.assertTrue(any(row["Solar generation (kWh)"] > 0 for row in rows))
        self.assertTrue(all(row["Import tariff (per kWh)"] >= 0 for row in rows))

    def test_normalizes_streamlit_list_and_dataframe_profile_returns(self):
        rows = synthetic_demo_profile()

        class DataFrameLike:
            def to_dict(self, *, orient):
                self.orient = orient
                return list(rows)

        list_result = profile_rows_to_records(list(rows))
        frame = DataFrameLike()
        frame_result = profile_rows_to_records(frame)
        self.assertEqual(len(list_result), 24)
        self.assertEqual(frame.orient, "records")
        self.assertEqual(frame_result, list_result)

    def test_profile_normalizer_rejects_incomplete_or_wrong_shaped_rows(self):
        with self.assertRaisesRegex(ValueError, "exactly 24"):
            profile_rows_to_records(synthetic_demo_profile()[:-1])
        incomplete = list(synthetic_demo_profile())
        incomplete[0] = {"Hour (MYT)": "00:00"}
        with self.assertRaisesRegex(ValueError, "missing fields"):
            profile_rows_to_records(incomplete)
        with self.assertRaisesRegex(ValueError, "editable table"):
            profile_rows_to_records(object())

    def test_builds_aligned_hourly_malaysia_time_inputs(self):
        config, inputs = build_hourly_scenario(
            self.demand,
            self.solar,
            self.import_rates,
            self.export_rates,
            start_date=date(2026, 3, 8),
            battery=self.battery,
        )
        self.assertEqual(config.interval_minutes, 60)
        self.assertEqual(config.currency, "MYR")
        self.assertEqual(len(inputs.demand.points), 24)
        self.assertEqual(inputs.demand.points[0].timestamp.utcoffset(), timedelta(hours=8))
        self.assertEqual(inputs.demand.points[0].timestamp.tzinfo, MALAYSIA_TIME)
        self.assertEqual(
            inputs.demand.points[-1].timestamp - inputs.demand.points[0].timestamp,
            timedelta(hours=23),
        )
        self.assertEqual(inputs.tariffs.export_rates[0].value, 0.05)

    def test_rejects_missing_or_extra_hourly_values(self):
        for count in (0, 23, 25):
            demand = self.demand[:count] if count <= 24 else self.demand + [0.8]
            with self.subTest(count=count), self.assertRaisesRegex(ValueError, "exactly 24"):
                build_hourly_scenario(
                    demand, self.solar, self.import_rates, self.export_rates,
                    start_date=date(2026, 1, 1), battery=self.battery,
                )

    def test_model_validation_catches_consumer_entered_invalid_values(self):
        invalid_inputs = (
            ([-0.1] + self.demand[1:], self.solar, self.import_rates, self.export_rates),
            (self.demand, [float("nan")] + self.solar[1:], self.import_rates, self.export_rates),
            (self.demand, self.solar, [float("inf")] + self.import_rates[1:], self.export_rates),
        )
        for data in invalid_inputs:
            with self.subTest(data=data[0][0]), self.assertRaises(ValueError):
                build_hourly_scenario(
                    *data, start_date=date(2026, 1, 1), battery=self.battery,
                )

    def test_zero_profile_and_negative_tariff_are_valid_inputs(self):
        config, inputs = build_hourly_scenario(
            [0.0] * 24,
            [0.0] * 24,
            [-0.02] * 24,
            [0.0] * 24,
            start_date=date(2026, 1, 1),
            battery=BatteryConfig(1, 0, 0),
        )
        self.assertEqual(config.currency, "MYR")
        self.assertEqual(inputs.tariffs.import_rates[0].value, -0.02)

    def test_runs_baseline_optimizer_and_report_on_same_consumer_scenario(self):
        run = run_hourly_scenario(
            self.demand,
            self.solar,
            self.import_rates,
            self.export_rates,
            start_date=date(2026, 1, 1),
            battery=self.battery,
        )
        self.assertEqual(len(run.baseline.intervals), 24)
        self.assertEqual(len(run.optimized.intervals), 24)
        self.assertLessEqual(
            run.optimized.total_net_cost,
            run.baseline.total_net_cost + 1e-9,
        )
        self.assertEqual(run.report.interval_count, 24)
        self.assertEqual(
            run.optimized.terminal_soc_kwh,
            run.baseline.intervals[-1].state_of_charge_kwh,
        )
        self.assertEqual(run.report.baseline.energy_balance_valid, True)
        self.assertEqual(run.report.baseline.battery_constraints_valid, True)
        self.assertEqual(run.report.baseline.grid_constraints_valid, True)
        self.assertEqual(run.report.gridmind.energy_balance_valid, True)
        self.assertEqual(run.report.gridmind.battery_constraints_valid, True)
        self.assertEqual(run.report.gridmind.grid_constraints_valid, True)
        self.assertEqual(len(metric_rows(run)), 14)
        self.assertEqual(run.report.scenario_fingerprint, run_hourly_scenario(
            self.demand,
            self.solar,
            self.import_rates,
            self.export_rates,
            start_date=date(2026, 1, 1),
            battery=self.battery,
        ).report.scenario_fingerprint)


class DashboardFidelityTests(unittest.TestCase):
    def setUp(self):
        self.battery = BatteryConfig(
            capacity_kwh=8,
            max_charge_power_kw=3,
            max_discharge_power_kw=3,
            initial_soc_kwh=3,
            state_of_health=0.75,
        )
        self.demand = [0.8] * 24
        self.solar = [0.0] * 6 + [0.5, 1, 1.5, 2, 2.5, 3, 3, 2.5, 2, 1.5, 1, 0.5] + [0.0] * 6
        self.import_rates = [0.22] * 24
        self.export_rates = [0.05] * 24

    def test_temperature_derating_is_applied_before_simulation(self):
        config, inputs = build_hourly_scenario(
            self.demand,
            [1.0] * 24,
            self.import_rates,
            self.export_rates,
            start_date=date(2026, 1, 1),
            battery=self.battery,
            pv=PvConfig(),
            ambient_temperature_c=[30.0] * 24,
            solar_irradiance_w_m2=[800.0] * 24,
        )
        self.assertIsNotNone(config.pv)
        # 30 °C ambient at 800 W/m² gives a 55 °C cell and a 0.88 factor.
        self.assertAlmostEqual(inputs.solar.points[0].value, 0.88)
        for point in inputs.solar.points:
            self.assertAlmostEqual(point.value, 0.88)

    def test_weather_requires_pv_and_pv_requires_both_weather_series(self):
        with self.assertRaisesRegex(ValueError, "pv must be supplied"):
            build_hourly_scenario(
                self.demand,
                self.solar,
                self.import_rates,
                self.export_rates,
                start_date=date(2026, 1, 1),
                battery=self.battery,
                ambient_temperature_c=[30.0] * 24,
                solar_irradiance_w_m2=[800.0] * 24,
            )
        with self.assertRaisesRegex(ValueError, "ambient_temperature_c"):
            build_hourly_scenario(
                self.demand,
                self.solar,
                self.import_rates,
                self.export_rates,
                start_date=date(2026, 1, 1),
                battery=self.battery,
                pv=PvConfig(),
                ambient_temperature_c=[30.0] * 24,
            )

    def test_rejects_weather_series_with_wrong_length(self):
        with self.assertRaisesRegex(ValueError, "exactly 24"):
            build_hourly_scenario(
                self.demand,
                self.solar,
                self.import_rates,
                self.export_rates,
                start_date=date(2026, 1, 1),
                battery=self.battery,
                pv=PvConfig(),
                ambient_temperature_c=[30.0] * 23,
                solar_irradiance_w_m2=[800.0] * 24,
            )

    def test_runs_grid_health_and_pv_scenario_with_labeled_assumptions(self):
        run = run_hourly_scenario(
            self.demand,
            self.solar,
            self.import_rates,
            self.export_rates,
            start_date=date(2026, 1, 1),
            battery=self.battery,
            grid=GridConfig(max_import_power_kw=1.0, max_export_power_kw=2.0),
            pv=PvConfig(),
            ambient_temperature_c=[30.0] * 24,
            solar_irradiance_w_m2=[1000.0] * 24,
        )
        self.assertTrue(run.report.baseline.energy_balance_valid)
        self.assertTrue(run.report.gridmind.energy_balance_valid)
        assumptions = " ".join(run.report.assumptions)
        limitations = " ".join(run.report.limitations)
        self.assertIn("state of health is 0.75", assumptions)
        self.assertIn("Grid import is capped", assumptions)
        self.assertIn("Grid export is capped", assumptions)
        self.assertIn("NOCT", assumptions)
        self.assertIn("static input", limitations)
        self.assertIn("per-interval power caps", limitations)

    def test_degradation_penalty_stays_out_of_comparison_costs(self):
        demand = [0.0, 1.0] + [0.0] * 22
        solar = [1.0] + [0.0] * 23
        run = run_hourly_scenario(
            demand,
            solar,
            [0.2] * 24,
            [0.05] * 24,
            start_date=date(2026, 1, 1),
            battery=BatteryConfig(2, 1, 1),
            degradation_cost_per_kwh=0.01,
        )
        optimized = run.optimized
        self.assertGreater(optimized.total_degradation_cost, 0)
        self.assertAlmostEqual(
            optimized.total_cost,
            optimized.total_net_cost + optimized.total_degradation_cost,
        )
        self.assertAlmostEqual(
            run.report.gridmind.net_cost, optimized.total_net_cost
        )
        # The baseline also self-consumes the solar, so tariff-only savings are
        # zero; the degradation penalty must not turn them negative.
        self.assertAlmostEqual(run.report.comparison.cost_savings, 0.0)
        self.assertTrue(
            any("degradation penalty" in item for item in run.report.assumptions)
        )


if __name__ == "__main__":
    unittest.main()
