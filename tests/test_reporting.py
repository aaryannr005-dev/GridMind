from datetime import datetime, timedelta, timezone
from xml.etree import ElementTree
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

    def test_invalid_strategy_scenario_is_rejected_by_metrics_dependency(self):
        config, inputs = scenario()
        wrong = scenario((2, 0), (0, 2))[1]
        with self.assertRaisesRegex(ValueError, "match the supplied scenario"):
            generate_report(simulate(config, inputs), config, wrong)


if __name__ == "__main__":
    unittest.main()
