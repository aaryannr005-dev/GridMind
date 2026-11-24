from datetime import datetime, timedelta, timezone
from xml.etree import ElementTree
from zoneinfo import ZoneInfo
import unittest

from gridmind import (
    BatteryConfig,
    DemandSeries,
    GridConfig,
    GridMindConfig,
    InputData,
    OptimizationConfig,
    PvConfig,
    SolarSeries,
    TariffSeries,
    TimeSeriesPoint,
    generate_report,
    optimize_dispatch,
    render_markdown,
    simulate,
)


START = datetime(2026, 1, 1, tzinfo=timezone.utc)


def point_series(values, step=timedelta(hours=1)):
    return tuple(TimeSeriesPoint(START + i*step, value) for i, value in enumerate(values))


def scenario(demand=(1, 0), solar=(0, 2), step=timedelta(hours=1)):
    inputs = InputData(
        DemandSeries(point_series(demand, step)),
        SolarSeries(point_series(solar, step)),
        TariffSeries(point_series((0.5,)*len(demand), step), point_series((0.1,)*len(demand), step)),
    )
    config = GridMindConfig(BatteryConfig(2, 1, 1), interval_minutes=int(step.total_seconds()/60))
    return config, inputs


class ReportingTests(unittest.TestCase):
    def test_generates_reproducible_report_with_actual_strategy_comparison(self):
        config, inputs = scenario()
        baseline = simulate(config, inputs)
        optimized = optimize_dispatch(config, inputs, OptimizationConfig(soc_step_kwh=0.5))
        report = generate_report(baseline, config, inputs, optimized)

        self.assertEqual(len(report.baseline_intervals), 2)
        self.assertEqual(len(report.baseline_hourly), 2)
        self.assertEqual(report.baseline.total_demand_kwh, 1)
        self.assertEqual(report.comparison.optimized.net_cost, report.gridmind.net_cost)
        self.assertEqual(report.comparison_rows[0].metric, "Grid imports")
        self.assertEqual(len(report.charts), 4)
        self.assertTrue(all(chart.svg.startswith("<svg") for chart in report.charts))
        self.assertTrue(all(ElementTree.fromstring(chart.svg).tag.endswith("svg") for chart in report.charts))
        self.assertEqual(report.scenario_fingerprint, generate_report(baseline, config, inputs, optimized).scenario_fingerprint)
        markdown = render_markdown(report)
        self.assertIn("Baseline vs GridMind", markdown)
        self.assertIn("Validation", markdown)
        self.assertIn("not measured outcomes", markdown)
        self.assertIn("Initial SOC", markdown)
        self.assertIn("Import cost", markdown)
        self.assertTrue(any("optimizer SOC resolution" in item for item in report.assumptions))

    def test_supports_baseline_only_and_marks_gridmind_as_unavailable(self):
        config, inputs = scenario()
        report = generate_report(simulate(config, inputs), config, inputs)

        self.assertIsNone(report.gridmind)
        self.assertIsNone(report.comparison)
        self.assertEqual(report.comparison_rows, ())
        self.assertEqual(len(report.charts), 3)
        self.assertIn("—", render_markdown(report))

    def test_subhourly_partial_day_is_grouped_without_fabricating_a_full_day(self):
        step = timedelta(minutes=30)
        config, inputs = scenario((1, 2, 3), (0, 0, 0), step)
        report = generate_report(simulate(config, inputs), config, inputs)

        self.assertEqual(report.duration_hours, 1.5)
        self.assertEqual(len(report.baseline_intervals), 3)
        self.assertEqual(len(report.baseline_hourly), 2)
        self.assertEqual(report.baseline_hourly[0].demand_kwh, 3)
        self.assertEqual(report.baseline_hourly[1].demand_kwh, 3)
        self.assertEqual(report.baseline_hourly[1].interval_count, 1)

    def test_longer_than_hour_interval_does_not_claim_hourly_breakdown(self):
        step = timedelta(hours=2)
        config, inputs = scenario((1, 2), (0, 0), step)
        report = generate_report(simulate(config, inputs), config, inputs)

        self.assertIsNone(report.baseline_hourly)
        self.assertEqual(len(report.baseline_intervals), 2)
        self.assertIn("no hourly split is inferred", " ".join(report.limitations))

    def test_non_divisor_interval_does_not_claim_hourly_breakdown(self):
        step = timedelta(minutes=45)
        config, inputs = scenario((1, 2), (0, 0), step)
        report = generate_report(simulate(config, inputs), config, inputs)

        self.assertIsNone(report.baseline_hourly)
        self.assertIn("Hourly aggregation is omitted", " ".join(report.limitations))

    def test_hourly_summaries_keep_repeated_daylight_saving_hours_distinct(self):
        local = ZoneInfo("America/New_York")
        times = (
            datetime(2025, 11, 2, 1, tzinfo=local, fold=0),
            datetime(2025, 11, 2, 1, tzinfo=local, fold=1),
        )
        points = lambda values: tuple(TimeSeriesPoint(t, value) for t, value in zip(times, values))
        inputs = InputData(
            DemandSeries(points((1, 2))),
            SolarSeries(points((0, 0))),
            TariffSeries(points((0.2, 0.3))),
        )
        config = GridMindConfig(BatteryConfig(1, 0, 0), interval_minutes=60)
        report = generate_report(simulate(config, inputs), config, inputs)

        self.assertEqual(len(report.baseline_hourly), 2)
        self.assertNotEqual(report.baseline_hourly[0].hour_start.utcoffset(), report.baseline_hourly[1].hour_start.utcoffset())
        self.assertIn("-0400", report.charts[0].svg)
        self.assertIn("-0500", report.charts[0].svg)

    def test_invalid_strategy_scenario_is_rejected_by_metrics_dependency(self):
        config, inputs = scenario()
        wrong = scenario((2, 0), (0, 2))[1]
        with self.assertRaisesRegex(ValueError, "match the supplied scenario"):
            generate_report(simulate(config, inputs), config, wrong)


class ReportingFidelityTests(unittest.TestCase):
    def _inputs(self):
        return InputData(
            DemandSeries(point_series((1, 0))),
            SolarSeries(point_series((0, 2))),
            TariffSeries(point_series((0.5, 0.5)), point_series((0.1, 0.1))),
        )

    def test_labels_health_grid_and_pv_assumptions_and_limitations(self):
        inputs = self._inputs()
        battery = BatteryConfig(2, 1, 1, state_of_health=0.5)
        config = GridMindConfig(
            battery,
            grid=GridConfig(max_import_power_kw=2.0, max_export_power_kw=1.0),
            pv=PvConfig(),
        )
        baseline = simulate(config, inputs)
        optimized = optimize_dispatch(
            config,
            inputs,
            OptimizationConfig(soc_step_kwh=0.5, degradation_cost_per_kwh=0.1),
        )
        report = generate_report(baseline, config, inputs, optimized)

        assumptions = " ".join(report.assumptions)
        limitations = " ".join(report.limitations)
        self.assertIn("state of health is 0.5", assumptions)
        self.assertIn("usable capacity", assumptions)
        self.assertIn("Grid import is capped at 2", assumptions)
        self.assertIn("Grid export is capped at 1", assumptions)
        self.assertIn("NOCT", assumptions)
        self.assertIn("static input", limitations)
        self.assertIn("not a full thermal", limitations)
        self.assertIn("per-interval power caps", limitations)

    def test_fingerprint_tracks_grid_health_and_pv_configuration(self):
        inputs = self._inputs()
        baseline_config = GridMindConfig(BatteryConfig(2, 1, 1))
        baseline = simulate(baseline_config, inputs)
        default = generate_report(baseline, baseline_config, inputs).scenario_fingerprint

        variants = (
            GridMindConfig(baseline_config.battery, grid=GridConfig(max_import_power_kw=5)),
            GridMindConfig(
                BatteryConfig(2, 1, 1, state_of_health=0.9), interval_minutes=60
            ),
            GridMindConfig(baseline_config.battery, pv=PvConfig()),
        )
        for config in variants:
            with self.subTest(config=config):
                self.assertNotEqual(
                    generate_report(baseline, config, inputs).scenario_fingerprint,
                    default,
                )


if __name__ == "__main__":
    unittest.main()

