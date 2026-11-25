from datetime import date
from io import StringIO
import unittest

from gridmind.public_data import (
    ELECTRICITY_CONSUMPTION,
    ELECTRICITY_SUPPLY,
    ObservationStatus,
    load_open_dosm_csv,
)
from gridmind.public_data_quality import DataQualityPolicy, evaluate_data_quality


class PublicDataQualityTests(unittest.TestCase):
    def load(self, text, dataset=ELECTRICITY_CONSUMPTION):
        return load_open_dosm_csv(dataset, StringIO(text))

    def test_reports_gaps_blanks_and_statuses_separately(self):
        series = self.load(
            "date,sector,consumption\n"
            "2025-12-01,total,10\n"
            "2026-01-01,total,\n"
            "2026-03-01,total,12\n"
            "2026-07-01,total,13\n"
        )
        report = evaluate_data_quality(series)
        self.assertEqual(report.observation_count, 4)
        self.assertEqual(report.numeric_value_count, 3)
        self.assertEqual(report.blank_value_count, 1)
        self.assertEqual(report.missing_period_count, 4)
        self.assertEqual(report.final_count, 1)
        self.assertEqual(report.provisional_count, 2)
        self.assertEqual(report.unknown_count, 1)
        category = report.categories[0]
        self.assertEqual(category.category, "total")
        self.assertEqual(category.first_period, date(2025, 12, 1))
        self.assertEqual(category.last_period, date(2026, 7, 1))
        self.assertEqual(category.expected_periods, 8)
        self.assertEqual(category.observed_rows, 4)
        self.assertEqual(category.row_completeness, 0.5)
        self.assertEqual(category.value_completeness, 3 / 8)

    def test_default_policy_uses_final_numeric_values_only(self):
        series = self.load(
            "date,sector,consumption\n"
            "2025-12-01,total,10\n"
            "2026-01-01,total,11\n"
            "2026-07-01,total,12\n"
        )
        report = evaluate_data_quality(series)
        selected = report.usable_observations(series)
        self.assertEqual([item.period for item in selected], [date(2025, 12, 1)])
        self.assertTrue(all(item.status is ObservationStatus.FINAL for item in selected))

    def test_policy_requires_explicit_opt_in_for_provisional_and_unknown(self):
        series = self.load(
            "date,sector,consumption\n"
            "2025-12-01,total,10\n"
            "2026-01-01,total,11\n"
            "2026-07-01,total,12\n"
        )
        report = evaluate_data_quality(series)
        selected = report.usable_observations(
            series, DataQualityPolicy(include_provisional=True, include_unknown=True)
        )
        self.assertEqual(len(selected), 3)

    def test_blank_values_never_become_usable_values(self):
        series = self.load(
            "date,sector,consumption\n"
            "2025-12-01,total,10\n"
            "2026-01-01,total,\n"
        )
        report = evaluate_data_quality(series)
        selected = report.usable_observations(
            series, DataQualityPolicy(include_provisional=True)
        )
        self.assertEqual(len(selected), 1)
        self.assertEqual(selected[0].value, 10.0)

    def test_rejects_report_for_different_dataset_and_invalid_policy(self):
        consumption = self.load("date,sector,consumption\n2025-12-01,total,10\n")
        supply = self.load(
            "date,sector,supply\n2025-12-01,total,10\n", ELECTRICITY_SUPPLY
        )
        report = evaluate_data_quality(consumption)
        with self.assertRaisesRegex(ValueError, "different dataset"):
            report.usable_observations(supply)
        with self.assertRaisesRegex(ValueError, "include_provisional"):
            DataQualityPolicy(include_provisional=1)
        with self.assertRaisesRegex(ValueError, "series must be"):
            evaluate_data_quality(object())


if __name__ == "__main__":
    unittest.main()
