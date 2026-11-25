from dataclasses import replace
from datetime import datetime, timedelta, timezone
import unittest

from gridmind import (
    BatteryConfig,
    DemandSeries,
    GridConfig,
    GridMindConfig,
    InputData,
    OptimizationConfig,
    SolarSeries,
    TariffSeries,
    TimeSeriesPoint,
    calculate_metrics,
    compare_strategies,
    optimize_dispatch,
    simulate,
)


START = datetime(2026, 1, 1, tzinfo=timezone.utc)


def points(values):
    return tuple(TimeSeriesPoint(START + timedelta(hours=i), value) for i, value in enumerate(values))


def scenario(demand=(1, 0), solar=(0, 2), imports=(0.5, 0.3), exports=(0, 0.1)):
    inputs = InputData(
        DemandSeries(points(demand)),
        SolarSeries(points(solar)),
        TariffSeries(points(imports), points(exports)),
    )
    config = GridMindConfig(BatteryConfig(1, 1, 1))
    return config, inputs


class MetricsTests(unittest.TestCase):
    def test_calculates_energy_cost_and_validation_metrics(self):
        config, inputs = scenario()
        result = simulate(config, inputs)
        metrics = calculate_metrics(result, config, inputs)

        self.assertEqual(metrics.interval_count, 2)
        self.assertAlmostEqual(metrics.total_demand_kwh, 1)
        self.assertAlmostEqual(metrics.total_solar_generation_kwh, 2)
        self.assertAlmostEqual(metrics.direct_solar_consumption_kwh, 0)
        self.assertAlmostEqual(metrics.solar_to_battery_kwh, 1)
        self.assertAlmostEqual(metrics.solar_self_consumption_kwh, 1)
        self.assertAlmostEqual(metrics.solar_self_consumption_ratio, 0.5)
        self.assertAlmostEqual(metrics.grid_import_kwh, 1)
        self.assertAlmostEqual(metrics.grid_export_kwh, 1)
        self.assertAlmostEqual(metrics.battery_charge_kwh, 1)
        self.assertAlmostEqual(metrics.battery_discharge_kwh, 0)
        self.assertAlmostEqual(metrics.initial_soc_kwh, 0)
        self.assertAlmostEqual(metrics.final_soc_kwh, 1)
        self.assertAlmostEqual(metrics.import_cost, 0.5)
        self.assertAlmostEqual(metrics.export_credit, 0.1)
        self.assertAlmostEqual(metrics.net_cost, 0.4)
        self.assertTrue(metrics.energy_balance_valid)
        self.assertTrue(metrics.battery_constraints_valid)
        self.assertTrue(metrics.grid_constraints_valid)
        self.assertTrue(metrics.tariff_costs_valid)

    def test_compares_strategies_and_reports_tradeoffs(self):
        config, inputs = scenario()
        baseline = simulate(config, inputs)
        optimized = optimize_dispatch(config, inputs, OptimizationConfig(soc_step_kwh=0.5))
        comparison = compare_strategies(baseline, optimized, config, inputs)

        self.assertAlmostEqual(comparison.cost_savings, 0.1)
        self.assertAlmostEqual(comparison.cost_savings_percent, 25)
        self.assertAlmostEqual(comparison.grid_import_reduction_kwh, 0)
        self.assertAlmostEqual(comparison.grid_import_reduction_percent, 0)
        self.assertAlmostEqual(comparison.solar_self_consumption_change_kwh, -1)
        self.assertAlmostEqual(comparison.solar_self_consumption_change_percent, -100)
        self.assertAlmostEqual(comparison.solar_export_change_kwh, 1)
        self.assertAlmostEqual(comparison.solar_export_change_percent, 100)
        self.assertAlmostEqual(comparison.battery_charge_change_kwh, -1)
        self.assertAlmostEqual(comparison.battery_charge_change_percent, -100)
        self.assertAlmostEqual(comparison.battery_discharge_change_kwh, 0)
        self.assertIsNone(comparison.battery_discharge_change_percent)

    def test_zero_denominators_produce_undefined_percentages(self):
        config, inputs = scenario(demand=(0,), solar=(0,), imports=(0,), exports=(0,))
        baseline = simulate(config, inputs)
        optimized = optimize_dispatch(config, inputs)
        metrics = calculate_metrics(baseline, config, inputs)
        comparison = compare_strategies(baseline, optimized, config, inputs)

        self.assertIsNone(metrics.solar_self_consumption_ratio)
        self.assertIsNone(comparison.cost_savings_percent)
        self.assertIsNone(comparison.grid_import_reduction_percent)
        self.assertIsNone(comparison.solar_self_consumption_change_percent)
        self.assertIsNone(comparison.solar_export_change_percent)
        self.assertIsNone(comparison.battery_charge_change_percent)
        self.assertIsNone(comparison.battery_discharge_change_percent)

    def test_rejects_outputs_from_a_different_demand_scenario(self):
        config, inputs = scenario()
        changed_inputs = scenario(demand=(2, 0))[1]
        with self.assertRaisesRegex(ValueError, "match the supplied scenario"):
            calculate_metrics(simulate(config, inputs), config, changed_inputs)

    def test_reports_energy_and_tariff_invariant_failures(self):
        config, inputs = scenario()
        result = simulate(config, inputs)
        changed = replace(result.intervals[0], grid_import_kwh=1.1)
        invalid_result = replace(result, intervals=(changed, *result.intervals[1:]))
        metrics = calculate_metrics(invalid_result, config, inputs)

        self.assertFalse(metrics.energy_balance_valid)
        self.assertFalse(metrics.tariff_costs_valid)
        self.assertGreater(metrics.max_load_balance_error_kwh, 0)

    def test_rejects_nonfinite_values_in_supplied_results(self):
        config, inputs = scenario()
        result = simulate(config, inputs)
        changed = replace(result.intervals[0], grid_import_kwh=float("inf"))
        invalid = replace(result, intervals=(changed, *result.intervals[1:]))
        with self.assertRaisesRegex(ValueError, "finite number"):
            calculate_metrics(invalid, config, inputs)


class MetricsFidelityTests(unittest.TestCase):
    def _degradation_scenario(self):
        config = GridMindConfig(BatteryConfig(1, 1, 1))
        inputs = InputData(
            DemandSeries(points((0, 1))),
            SolarSeries(points((0, 0))),
            TariffSeries(points((0.1, 1.0)), points((0, 0))),
        )
        options = OptimizationConfig(soc_step_kwh=0.5, degradation_cost_per_kwh=0.2)
        return config, inputs, optimize_dispatch(config, inputs, options)

    def test_objective_includes_degradation_but_net_cost_does_not(self):
        config, inputs, optimized = self._degradation_scenario()
        metrics = calculate_metrics(optimized, config, inputs)

        self.assertTrue(metrics.tariff_costs_valid)
        self.assertAlmostEqual(metrics.net_cost, 0.1)
        self.assertAlmostEqual(optimized.total_degradation_cost, 0.2)
        self.assertAlmostEqual(optimized.total_cost, 0.3)

    def test_objective_mismatch_fails_tariff_validation(self):
        config, inputs, optimized = self._degradation_scenario()
        tampered = replace(optimized, total_cost=0.1)
        metrics = calculate_metrics(tampered, config, inputs)

        self.assertFalse(metrics.tariff_costs_valid)

    def test_export_curtailment_preserves_the_solar_balance(self):
        config = GridMindConfig(
            BatteryConfig(1, 0, 0), grid=GridConfig(max_export_power_kw=0.5)
        )
        inputs = InputData(
            DemandSeries(points((0,))),
            SolarSeries(points((2,))),
            TariffSeries(points((0.2,)), points((0.1,))),
        )
        metrics = calculate_metrics(simulate(config, inputs), config, inputs)

        self.assertTrue(metrics.energy_balance_valid)
        self.assertAlmostEqual(metrics.grid_export_kwh, 0.5)
        self.assertAlmostEqual(metrics.solar_self_consumption_kwh, 0.0)


    def test_baseline_and_optimizer_remain_consistent_under_combined_constraints(self):
        interval = timedelta(minutes=30)
        timestamps = tuple(START + index * interval for index in range(4))

        def half_hour_points(values):
            return tuple(
                TimeSeriesPoint(timestamp, value)
                for timestamp, value in zip(timestamps, values)
            )

        config = GridMindConfig(
            BatteryConfig(
                capacity_kwh=2.0,
                max_charge_power_kw=2.0,
                max_discharge_power_kw=2.0,
                charge_efficiency=0.9,
                discharge_efficiency=0.85,
                initial_soc_kwh=0.75,
                min_soc_kwh=0.3,
                state_of_health=0.75,
            ),
            interval_minutes=30,
            grid=GridConfig(max_import_power_kw=3.0, max_export_power_kw=2.0),
        )
        inputs = InputData(
            DemandSeries(half_hour_points((0.5, 1.0, 1.4, 0.2))),
            SolarSeries(half_hour_points((2.0, 0.0, 0.0, 2.0))),
            TariffSeries(
                half_hour_points((0.1, 0.2, 0.9, 0.1)),
                half_hour_points((0.03, 0.03, 0.03, 0.03)),
            ),
        )

        baseline = simulate(config, inputs)
        baseline_soc = tuple(item.state_of_charge_kwh for item in baseline.intervals)
        optimized = optimize_dispatch(
            config,
            inputs,
            OptimizationConfig(
                soc_step_kwh=0.15,
                terminal_soc_kwh=baseline_soc[-1],
                baseline_soc_schedule_kwh=baseline_soc,
            ),
        )
        baseline_metrics = calculate_metrics(baseline, config, inputs)
        optimized_metrics = calculate_metrics(optimized, config, inputs)
        comparison = compare_strategies(baseline, optimized, config, inputs)

        for metrics in (baseline_metrics, optimized_metrics):
            with self.subTest(strategy="baseline" if metrics is baseline_metrics else "optimized"):
                self.assertTrue(metrics.energy_balance_valid)
                self.assertTrue(metrics.battery_constraints_valid)
                self.assertTrue(metrics.grid_constraints_valid)
                self.assertTrue(metrics.tariff_costs_valid)

        self.assertAlmostEqual(optimized.terminal_soc_kwh, baseline_soc[-1])
        self.assertLessEqual(optimized.total_net_cost, baseline.total_net_cost + 1e-9)
        self.assertAlmostEqual(
            comparison.cost_savings,
            baseline_metrics.net_cost - optimized_metrics.net_cost,
        )


if __name__ == "__main__":
    unittest.main()

