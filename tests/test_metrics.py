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


if __name__ == "__main__":
    unittest.main()

