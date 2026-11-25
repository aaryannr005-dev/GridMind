from datetime import datetime, timezone, timedelta
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
    optimize_dispatch,
    simulate,
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
    def test_baseline_soc_anchors_respect_optimizer_state_limit(self):
        config = GridMindConfig(
            BatteryConfig(
                capacity_kwh=1000,
                max_charge_power_kw=1000,
                max_discharge_power_kw=1000,
                initial_soc_kwh=500,
            )
        )
        baseline_soc = (500.1, 500.2, 500.3)
        result = optimize_dispatch(
            config,
            make_inputs([0, 0, 0], [0, 0, 0], [0, 0, 0]),
            OptimizationConfig(
                soc_step_kwh=1,
                terminal_soc_kwh=baseline_soc[-1],
                baseline_soc_schedule_kwh=baseline_soc,
            ),
        )
        self.assertAlmostEqual(result.terminal_soc_kwh, baseline_soc[-1])
        self.assertLessEqual(
            max(item.state_of_charge_kwh for item in result.intervals),
            config.battery.max_soc_kwh,
        )

    def test_seeded_baseline_soc_path_is_never_worse_without_degradation_penalty(self):
        config = GridMindConfig(
            BatteryConfig(
                capacity_kwh=3.7,
                max_charge_power_kw=1.3,
                max_discharge_power_kw=1.1,
                charge_efficiency=0.93,
                discharge_efficiency=0.91,
                initial_soc_kwh=1.37,
            )
        )
        inputs = make_inputs(
            [0.2, 0.9, 1.1, 0.4, 0.8, 1.0],
            [1.15, 0.0, 0.0, 1.4, 0.0, 0.0],
            [0.08, 0.12, 0.65, 0.09, 0.75, 0.11],
            [0.03, 0.03, 0.03, 0.03, 0.03, 0.03],
        )
        baseline = simulate(config, inputs)
        baseline_soc = tuple(item.state_of_charge_kwh for item in baseline.intervals)
        optimized = optimize_dispatch(
            config,
            inputs,
            OptimizationConfig(
                soc_step_kwh=0.7,
                terminal_soc_kwh=baseline_soc[-1],
                baseline_soc_schedule_kwh=baseline_soc,
            ),
        )
        self.assertLessEqual(
            optimized.total_net_cost,
            baseline.total_net_cost + 1e-9,
        )
        self.assertAlmostEqual(
            optimized.terminal_soc_kwh,
            baseline_soc[-1],
        )

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

    def test_grid_charging_can_be_more_profitable_than_exporting_solar(self):
        config = GridMindConfig(BatteryConfig(1, 1, 1))
        result = optimize_dispatch(
            config,
            make_inputs([0, 1], [1, 0], [0.1, 1.0], [1.0, 0.0]),
            OptimizationConfig(soc_step_kwh=0.5),
        )
        first = result.intervals[0]
        self.assertAlmostEqual(first.battery_charge_from_grid_kwh, 1.0)
        self.assertAlmostEqual(first.battery_charge_from_solar_kwh, 0.0)
        self.assertAlmostEqual(first.grid_export_kwh, 1.0)
        self.assertAlmostEqual(result.total_cost, -0.9)

    def test_negative_export_rate_curtails_surplus(self):
        result = optimize_dispatch(
            GridMindConfig(BatteryConfig(1, 0, 0)),
            make_inputs([0], [1], [0], [-0.1]),
        )
        self.assertAlmostEqual(result.intervals[0].grid_export_kwh, 0.0)
        self.assertAlmostEqual(result.intervals[0].solar_curtailment_kwh, 1.0)
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

    def test_respects_minimum_and_maximum_battery_soc(self):
        config = GridMindConfig(BatteryConfig(5, 5, 5, initial_soc_kwh=2, min_soc_kwh=1, max_soc_kwh=3))
        result = optimize_dispatch(
            config,
            make_inputs([5, 0], [0, 5], [1, 0]),
            OptimizationConfig(soc_step_kwh=0.5, terminal_soc_kwh=2),
        )
        for interval in result.intervals:
            self.assertGreaterEqual(interval.state_of_charge_kwh, 1)
            self.assertLessEqual(interval.state_of_charge_kwh, 3)

    def test_rejects_terminal_soc_below_minimum(self):
        config = GridMindConfig(BatteryConfig(5, 5, 5, initial_soc_kwh=2, min_soc_kwh=1))
        with self.assertRaisesRegex(ValueError, "min_soc_kwh"):
            optimize_dispatch(
                config,
                make_inputs([0], [0], [0]),
                OptimizationConfig(terminal_soc_kwh=0),
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
                item.solar_to_load_kwh + item.battery_charge_from_solar_kwh + item.grid_export_kwh + item.solar_curtailment_kwh,
            )
            self.assertAlmostEqual(
                item.battery_charge_kwh,
                item.battery_charge_from_solar_kwh + item.battery_charge_from_grid_kwh,
            )

    def test_rejects_tariff_product_that_overflows_finite_range(self):
        timestamp = START
        data = InputData(
            DemandSeries((TimeSeriesPoint(timestamp, 1e308),)),
            SolarSeries((TimeSeriesPoint(timestamp, 0.0),)),
            TariffSeries((TimeSeriesPoint(timestamp, 1e308),)),
        )
        with self.assertRaisesRegex(ValueError, "finite numeric range"):
            optimize_dispatch(GridMindConfig(BatteryConfig(1, 0, 0)), data)

    def test_rejects_horizon_cost_sum_that_overflows_finite_range(self):
        data = make_inputs([1.0, 1.0], [0.0, 0.0], [1e308, 1e308])
        with self.assertRaisesRegex(ValueError, "finite numeric range"):
            optimize_dispatch(GridMindConfig(BatteryConfig(1, 0, 0)), data)


class OptimizerFidelityTests(unittest.TestCase):
    def test_export_cap_curtails_surplus_and_limits_credit(self):
        config = GridMindConfig(
            BatteryConfig(1, 0, 0), grid=GridConfig(max_export_power_kw=0.5)
        )
        result = optimize_dispatch(config, make_inputs([0], [2], [0], [0.4]))
        interval = result.intervals[0]
        self.assertAlmostEqual(interval.grid_export_kwh, 0.5)
        self.assertAlmostEqual(interval.solar_curtailment_kwh, 1.5)
        self.assertAlmostEqual(result.total_net_cost, -0.2)

    def test_export_cap_makes_curtailed_solar_available_for_charging(self):
        config = GridMindConfig(
            BatteryConfig(1, 1, 1), grid=GridConfig(max_export_power_kw=0.5)
        )
        result = optimize_dispatch(
            config,
            make_inputs([0], [1.5], [0.10], [1.00]),
            OptimizationConfig(soc_step_kwh=0.5, terminal_soc_kwh=1.0),
        )
        interval = result.intervals[0]
        self.assertAlmostEqual(interval.battery_charge_kwh, 1.0)
        self.assertAlmostEqual(interval.battery_charge_from_solar_kwh, 1.0)
        self.assertAlmostEqual(interval.battery_charge_from_grid_kwh, 0.0)
        self.assertAlmostEqual(interval.grid_import_kwh, 0.0)
        self.assertAlmostEqual(interval.grid_export_kwh, 0.5)
        self.assertAlmostEqual(interval.solar_curtailment_kwh, 0.0)
        self.assertAlmostEqual(result.total_cost, -0.5)

    def test_curtailed_solar_charging_preserves_charge_efficiency(self):
        config = GridMindConfig(
            BatteryConfig(1, 1, 1, charge_efficiency=0.8),
            grid=GridConfig(max_export_power_kw=0.5),
        )
        result = optimize_dispatch(
            config,
            make_inputs([0], [1.5], [0.10], [1.00]),
            OptimizationConfig(soc_step_kwh=0.5, terminal_soc_kwh=0.8),
        )
        interval = result.intervals[0]
        self.assertAlmostEqual(interval.battery_charge_kwh, 1.0)
        self.assertAlmostEqual(interval.battery_charge_from_solar_kwh, 1.0)
        self.assertAlmostEqual(interval.state_of_charge_kwh, 0.8)
        self.assertAlmostEqual(interval.grid_import_kwh, 0.0)
        self.assertAlmostEqual(interval.grid_export_kwh, 0.5)
        self.assertAlmostEqual(result.total_cost, -0.5)

    def test_charge_beyond_curtailed_surplus_uses_grid_without_reducing_export(self):
        config = GridMindConfig(
            BatteryConfig(2, 2, 2), grid=GridConfig(max_export_power_kw=0.5)
        )
        result = optimize_dispatch(
            config,
            make_inputs([0], [1.5], [0.10], [1.00]),
            OptimizationConfig(soc_step_kwh=0.5, terminal_soc_kwh=2.0),
        )
        interval = result.intervals[0]
        self.assertAlmostEqual(interval.battery_charge_kwh, 2.0)
        self.assertAlmostEqual(interval.battery_charge_from_solar_kwh, 1.0)
        self.assertAlmostEqual(interval.battery_charge_from_grid_kwh, 1.0)
        self.assertAlmostEqual(interval.grid_import_kwh, 1.0)
        self.assertAlmostEqual(interval.grid_export_kwh, 0.5)
        self.assertAlmostEqual(interval.solar_curtailment_kwh, 0.0)
        self.assertAlmostEqual(result.total_cost, -0.4)

    def test_export_cap_that_does_not_bind_leaves_surplus_for_export(self):
        config = GridMindConfig(
            BatteryConfig(1, 1, 1), grid=GridConfig(max_export_power_kw=0.5)
        )
        result = optimize_dispatch(
            config,
            make_inputs([0], [0.4], [0.10], [1.00]),
            OptimizationConfig(soc_step_kwh=0.5, terminal_soc_kwh=1.0),
        )
        interval = result.intervals[0]
        self.assertAlmostEqual(interval.battery_charge_from_solar_kwh, 0.0)
        self.assertAlmostEqual(interval.battery_charge_from_grid_kwh, 1.0)
        self.assertAlmostEqual(interval.grid_import_kwh, 1.0)
        self.assertAlmostEqual(interval.grid_export_kwh, 0.4)
        self.assertAlmostEqual(interval.solar_curtailment_kwh, 0.0)
        self.assertAlmostEqual(result.total_cost, -0.3)

    def test_zero_export_cap_leaves_all_surplus_available_for_charging(self):
        config = GridMindConfig(
            BatteryConfig(1, 1, 1), grid=GridConfig(max_export_power_kw=0)
        )
        result = optimize_dispatch(
            config,
            make_inputs([0], [1.5], [0.10], [1.00]),
            OptimizationConfig(soc_step_kwh=0.5, terminal_soc_kwh=1.0),
        )
        interval = result.intervals[0]
        self.assertAlmostEqual(interval.battery_charge_from_solar_kwh, 1.0)
        self.assertAlmostEqual(interval.grid_import_kwh, 0.0)
        self.assertAlmostEqual(interval.grid_export_kwh, 0.0)
        self.assertAlmostEqual(interval.solar_curtailment_kwh, 0.5)
        self.assertAlmostEqual(result.total_cost, 0.0)

    def test_import_cap_can_make_the_scenario_infeasible(self):
        config = GridMindConfig(
            BatteryConfig(1, 0, 0), grid=GridConfig(max_import_power_kw=1)
        )
        with self.assertRaisesRegex(ValueError, "grid limits"):
            optimize_dispatch(config, make_inputs([2], [0], [0.5]))

    def test_import_at_the_cap_remains_feasible(self):
        config = GridMindConfig(
            BatteryConfig(1, 0, 0), grid=GridConfig(max_import_power_kw=1)
        )
        result = optimize_dispatch(config, make_inputs([1], [0], [0.5]))
        self.assertAlmostEqual(result.intervals[0].grid_import_kwh, 1.0)

    def test_import_cap_diverts_exportable_solar_into_charging(self):
        config = GridMindConfig(
            BatteryConfig(1, 1, 1),
            grid=GridConfig(max_import_power_kw=0.4, max_export_power_kw=0.1),
        )
        result = optimize_dispatch(
            config,
            make_inputs([0], [0.6], [0.10], [1.00]),
            OptimizationConfig(soc_step_kwh=0.5, terminal_soc_kwh=1.0),
        )
        interval = result.intervals[0]
        self.assertAlmostEqual(interval.battery_charge_kwh, 1.0)
        self.assertAlmostEqual(interval.battery_charge_from_solar_kwh, 0.6)
        self.assertAlmostEqual(interval.battery_charge_from_grid_kwh, 0.4)
        self.assertAlmostEqual(interval.grid_import_kwh, 0.4)
        self.assertAlmostEqual(interval.grid_export_kwh, 0.0)
        self.assertAlmostEqual(interval.solar_curtailment_kwh, 0.0)
        self.assertAlmostEqual(result.total_cost, 0.04)

    def test_import_cap_diverts_solar_while_preserving_charge_efficiency(self):
        config = GridMindConfig(
            BatteryConfig(1, 1, 1, charge_efficiency=0.8),
            grid=GridConfig(max_import_power_kw=0.4, max_export_power_kw=0.1),
        )
        result = optimize_dispatch(
            config,
            make_inputs([0], [0.6], [0.10], [1.00]),
            OptimizationConfig(soc_step_kwh=0.5, terminal_soc_kwh=0.8),
        )
        interval = result.intervals[0]
        self.assertAlmostEqual(interval.battery_charge_kwh, 1.0)
        self.assertAlmostEqual(interval.battery_charge_from_solar_kwh, 0.6)
        self.assertAlmostEqual(interval.battery_charge_from_grid_kwh, 0.4)
        self.assertAlmostEqual(interval.state_of_charge_kwh, 0.8)
        self.assertAlmostEqual(interval.grid_import_kwh, 0.4)
        self.assertAlmostEqual(interval.grid_export_kwh, 0.0)
        self.assertAlmostEqual(result.total_cost, 0.04)

    def test_import_cap_that_does_not_bind_preserves_tariff_allocation(self):
        config = GridMindConfig(
            BatteryConfig(1, 1, 1),
            grid=GridConfig(max_import_power_kw=1.0, max_export_power_kw=0.1),
        )
        result = optimize_dispatch(
            config,
            make_inputs([0], [0.6], [0.10], [1.00]),
            OptimizationConfig(soc_step_kwh=0.5, terminal_soc_kwh=1.0),
        )
        interval = result.intervals[0]
        self.assertAlmostEqual(interval.battery_charge_from_solar_kwh, 0.5)
        self.assertAlmostEqual(interval.battery_charge_from_grid_kwh, 0.5)
        self.assertAlmostEqual(interval.grid_import_kwh, 0.5)
        self.assertAlmostEqual(interval.grid_export_kwh, 0.1)
        self.assertAlmostEqual(interval.solar_curtailment_kwh, 0.0)
        self.assertAlmostEqual(result.total_cost, -0.05)

    def test_import_cap_exactly_at_grid_charge_does_not_force_diversion(self):
        config = GridMindConfig(
            BatteryConfig(1, 1, 1),
            grid=GridConfig(max_import_power_kw=0.5, max_export_power_kw=0.1),
        )
        result = optimize_dispatch(
            config,
            make_inputs([0], [0.6], [0.10], [1.00]),
            OptimizationConfig(soc_step_kwh=0.5, terminal_soc_kwh=1.0),
        )
        interval = result.intervals[0]
        self.assertAlmostEqual(interval.battery_charge_from_solar_kwh, 0.5)
        self.assertAlmostEqual(interval.battery_charge_from_grid_kwh, 0.5)
        self.assertAlmostEqual(interval.grid_import_kwh, 0.5)
        self.assertAlmostEqual(interval.grid_export_kwh, 0.1)
        self.assertAlmostEqual(result.total_cost, -0.05)

    def test_import_cap_remains_infeasible_when_surplus_is_insufficient(self):
        config = GridMindConfig(
            BatteryConfig(1, 1, 1),
            grid=GridConfig(max_import_power_kw=0.3, max_export_power_kw=0.1),
        )
        with self.assertRaisesRegex(ValueError, "grid limits"):
            optimize_dispatch(
                config,
                make_inputs([0], [0.6], [0.10], [1.00]),
                OptimizationConfig(soc_step_kwh=0.5, terminal_soc_kwh=1.0),
            )

    def test_degradation_penalty_is_added_to_the_objective_only(self):
        config = GridMindConfig(BatteryConfig(1, 1, 1))
        result = optimize_dispatch(
            config,
            make_inputs([0, 1], [0, 0], [0.1, 1.0]),
            OptimizationConfig(soc_step_kwh=0.5, degradation_cost_per_kwh=0.2),
        )
        self.assertAlmostEqual(result.total_degradation_cost, 0.2)
        self.assertAlmostEqual(result.total_net_cost, 0.1)
        self.assertAlmostEqual(result.total_cost, 0.3)

    def test_high_degradation_penalty_suppresses_cycling(self):
        config = GridMindConfig(BatteryConfig(1, 1, 1))
        result = optimize_dispatch(
            config,
            make_inputs([0, 1], [0, 0], [0.1, 1.0]),
            OptimizationConfig(soc_step_kwh=0.5, degradation_cost_per_kwh=5.0),
        )
        self.assertAlmostEqual(result.total_degradation_cost, 0.0)
        self.assertEqual(result.intervals[0].battery_charge_kwh, 0.0)
        self.assertAlmostEqual(result.total_cost, 1.0)

    def test_rejects_invalid_degradation_penalty(self):
        for value in (-0.1, float("nan"), float("inf")):
            with self.subTest(value=value), self.assertRaisesRegex(ValueError, "degradation_cost_per_kwh"):
                OptimizationConfig(degradation_cost_per_kwh=value)
        with self.assertRaisesRegex(ValueError, "degradation_cost_per_kwh"):
            OptimizationConfig(degradation_cost_per_kwh=True)

    def test_state_of_health_reduces_the_usable_state_of_charge_window(self):
        config = GridMindConfig(BatteryConfig(2, 2, 2, state_of_health=0.5))
        with self.assertRaisesRegex(ValueError, "cannot exceed"):
            optimize_dispatch(
                config,
                make_inputs([0], [0], [0]),
                OptimizationConfig(terminal_soc_kwh=2),
            )
        result = optimize_dispatch(
            config,
            make_inputs([0, 0], [2, 0], [0, 0]),
            OptimizationConfig(
                soc_step_kwh=0.5, terminal_soc_kwh=1, allow_grid_charging=False
            ),
        )
        self.assertAlmostEqual(result.terminal_soc_kwh, 1.0)
        self.assertAlmostEqual(result.intervals[0].state_of_charge_kwh, 1.0)
        self.assertAlmostEqual(result.intervals[0].solar_curtailment_kwh, 1.0)


class AdvancedOptimizationConstraintTests(unittest.TestCase):
    def test_minimum_soc_schedule_preserves_reserve_each_interval(self):
        config = GridMindConfig(BatteryConfig(2, 2, 2, initial_soc_kwh=1.0))
        result = optimize_dispatch(
            config,
            make_inputs([1, 1, 1], [0, 0, 0], [0.2, 1.0, 1.0]),
            OptimizationConfig(
                soc_step_kwh=0.25,
                terminal_soc_kwh=0.5,
                minimum_soc_schedule_kwh=(0.75, 0.5, 0.5),
            ),
        )
        self.assertTrue(all(
            interval.state_of_charge_kwh + 1e-9 >= reserve
            for interval, reserve in zip(result.intervals, (0.75, 0.5, 0.5))
        ))
        self.assertAlmostEqual(result.terminal_soc_kwh, 0.5)

    def test_grid_charging_schedule_blocks_selected_intervals(self):
        config = GridMindConfig(BatteryConfig(1, 1, 1))
        result = optimize_dispatch(
            config,
            make_inputs([0, 1], [0, 0], [0.1, 1.0]),
            OptimizationConfig(
                soc_step_kwh=0.5,
                grid_charging_schedule=(False, True),
            ),
        )
        self.assertAlmostEqual(result.intervals[0].battery_charge_from_grid_kwh, 0.0)
        self.assertAlmostEqual(result.intervals[1].battery_charge_from_grid_kwh, 0.0)
        self.assertAlmostEqual(result.intervals[1].grid_import_kwh, 1.0)

    def test_grid_charging_schedule_can_enable_only_a_later_cheap_window(self):
        config = GridMindConfig(BatteryConfig(1, 1, 1))
        result = optimize_dispatch(
            config,
            make_inputs([0, 0, 1], [0, 0, 0], [1.0, 0.1, 1.0]),
            OptimizationConfig(
                soc_step_kwh=0.5,
                grid_charging_schedule=(False, True, False),
            ),
        )
        self.assertAlmostEqual(result.intervals[0].battery_charge_from_grid_kwh, 0.0)
        self.assertAlmostEqual(result.intervals[1].battery_charge_from_grid_kwh, 1.0)
        self.assertAlmostEqual(result.intervals[2].battery_discharge_kwh, 1.0)

    def test_rejects_reserve_schedule_with_wrong_horizon(self):
        with self.assertRaisesRegex(ValueError, "one value per input interval"):
            optimize_dispatch(
                GridMindConfig(BatteryConfig(1, 1, 1)),
                make_inputs([0, 0], [0, 0], [0, 0]),
                OptimizationConfig(minimum_soc_schedule_kwh=(0.5,)),
            )

    def test_rejects_grid_charging_schedule_with_wrong_horizon(self):
        with self.assertRaisesRegex(ValueError, "one value per input interval"):
            optimize_dispatch(
                GridMindConfig(BatteryConfig(1, 1, 1)),
                make_inputs([0, 0], [0, 0], [0, 0]),
                OptimizationConfig(grid_charging_schedule=(True,)),
            )

    def test_rejects_invalid_reserve_and_charging_schedule_values(self):
        for value in ((0.5, float("nan")), (0.5, -0.1), (0.5, True)):
            with self.subTest(value=value), self.assertRaisesRegex(ValueError, "minimum_soc_schedule_kwh"):
                OptimizationConfig(minimum_soc_schedule_kwh=value)
        with self.assertRaisesRegex(ValueError, "grid_charging_schedule values"):
            OptimizationConfig(grid_charging_schedule=(True, 1))

    def test_rejects_reserve_outside_battery_limits(self):
        with self.assertRaisesRegex(ValueError, "within the battery SOC limits"):
            optimize_dispatch(
                GridMindConfig(BatteryConfig(1, 1, 1)),
                make_inputs([0], [0], [0]),
                OptimizationConfig(minimum_soc_schedule_kwh=(1.1,)),
            )

    def test_terminal_soc_must_satisfy_final_reserve(self):
        with self.assertRaisesRegex(ValueError, "final scheduled minimum SOC"):
            optimize_dispatch(
                GridMindConfig(BatteryConfig(1, 1, 1)),
                make_inputs([0, 0], [0, 0], [0, 0]),
                OptimizationConfig(
                    terminal_soc_kwh=0.25,
                    minimum_soc_schedule_kwh=(0.5, 0.5),
                ),
            )

    def test_global_grid_charging_disable_overrides_schedule(self):
        config = GridMindConfig(BatteryConfig(1, 1, 1))
        result = optimize_dispatch(
            config,
            make_inputs([0, 1], [0, 0], [0.1, 1.0]),
            OptimizationConfig(
                allow_grid_charging=False,
                grid_charging_schedule=(True, True),
            ),
        )
        self.assertTrue(all(interval.battery_charge_from_grid_kwh == 0 for interval in result.intervals))


if __name__ == "__main__":
    unittest.main()

