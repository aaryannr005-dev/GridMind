from datetime import date
from io import StringIO
import unittest

from gridmind.public_data import (
    ELECTRICITY_CONSUMPTION,
    ELECTRICITY_SUPPLY,
    ObservationStatus,
    load_open_dosm_csv,
)


class OpenDosmImportTests(unittest.TestCase):
    def load(self, text, dataset=ELECTRICITY_CONSUMPTION):
        return load_open_dosm_csv(dataset, StringIO(text))

    def test_consumption_csv_preserves_source_values_and_provenance(self):
        result = self.load(
            "date,sector,consumption\n"
            "2025-12-01,total,120.5\n"
            "2026-01-01,total,130.25\n"
        )
        self.assertEqual(result.metadata.unit, "million kWh")
        self.assertEqual(result.metadata.geographic_coverage, "Malaysia (national aggregate)")
        self.assertEqual(result.metadata.license_name, "Creative Commons Attribution 4.0 International (CC BY 4.0)")
        self.assertEqual(result.metadata.license_url, "https://creativecommons.org/licenses/by/4.0/")
        self.assertEqual(result.metadata.data_as_of, date(2026, 6, 30))
        self.assertEqual(result.metadata.last_updated, date(2026, 10, 8))
        self.assertEqual(result.metadata.metadata_checked_on, date(2026, 10, 24))
        self.assertIn("N/A", result.metadata.next_update)
        self.assertEqual([item.value for item in result.observations], [120.5, 130.25])
        self.assertEqual(result.period_start, date(2025, 12, 1))
        self.assertEqual(result.period_end, date(2026, 1, 1))
        self.assertEqual(result.observations[0].status, ObservationStatus.FINAL)
        self.assertEqual(result.observations[1].status, ObservationStatus.PROVISIONAL)
        self.assertEqual(result.missing_periods, ())

    def test_supply_uses_its_own_value_column_and_sector_vocabulary(self):
        result = self.load(
            "date,sector,supply\n2026-06-01,local_public,12.0\n",
            ELECTRICITY_SUPPLY,
        )
        self.assertEqual(result.metadata.value_column, "supply")
        self.assertEqual(result.observations[0].category, "local_public")
        self.assertEqual(result.observations[0].status, ObservationStatus.PROVISIONAL)

    def test_blank_values_are_retained_and_absent_months_are_reported(self):
        result = self.load(
            "date,sector,consumption\n"
            "2026-01-01,total,10\n"
            "2026-02-01,total,\n"
            "2026-04-01,total,12\n"
        )
        self.assertIsNone(result.observations[1].value)
        self.assertEqual(result.missing_value_count, 1)
        self.assertEqual([(gap.period, gap.category) for gap in result.missing_periods], [(date(2026, 3, 1), "total")])

    def test_blank_lines_and_zero_are_valid(self):
        result = self.load("date,sector,consumption\n\n2025-01-01,total,0\n")
        self.assertEqual(result.observations[0].value, 0.0)

    def test_dates_after_verified_snapshot_have_unknown_status(self):
        result = self.load("date,sector,consumption\n2026-07-01,total,1\n")
        self.assertEqual(result.observations[0].status, ObservationStatus.UNKNOWN)

    def test_rejects_missing_or_duplicate_headers(self):
        for text in (
            "date,sector\n2026-01-01,total\n",
            "date,sector,sector,consumption\n2026-01-01,total,total,1\n",
        ):
            with self.subTest(text=text), self.assertRaises(ValueError):
                self.load(text)

    def test_rejects_non_month_start_dates_and_unknown_categories(self):
        for text in (
            "date,sector,consumption\n2026-01-02,total,1\n",
            "date,sector,consumption\n2026-01-01,household,1\n",
        ):
            with self.subTest(text=text), self.assertRaises(ValueError):
                self.load(text)

    def test_rejects_duplicate_month_category_rows(self):
        with self.assertRaisesRegex(ValueError, "duplicates"):
            self.load("date,sector,consumption\n2026-01-01,total,1\n2026-01-01,total,2\n")

    def test_rejects_invalid_numeric_values(self):
        for value in ("not-a-number", "NaN", "inf", "-inf", "-1", "-1e-400", "1e-400"):
            with self.subTest(value=value), self.assertRaises(ValueError):
                self.load(f"date,sector,consumption\n2026-01-01,total,{value}\n")

    def test_rejects_truncated_rows_and_malformed_csv(self):
        for text in (
            "date,sector,consumption\n2026-01-01,total\n",
            'date,sector,consumption\n2026-01-01,"total,1\n',
        ):
            with self.subTest(text=text), self.assertRaises(ValueError):
                self.load(text)

    def test_rejects_empty_or_wrong_stream(self):
        for text in ("", "date,sector,consumption\n"):
            with self.subTest(text=text), self.assertRaises(ValueError):
                self.load(text)
        with self.assertRaisesRegex(ValueError, "readable text stream"):
            load_open_dosm_csv(ELECTRICITY_CONSUMPTION, object())
        read_only = type("ReadOnly", (), {"read": lambda self: ""})()
        with self.assertRaisesRegex(ValueError, "readable text stream"):
            load_open_dosm_csv(ELECTRICITY_CONSUMPTION, read_only)
        with self.assertRaisesRegex(ValueError, "metadata must be DatasetMetadata"):
            type(ELECTRICITY_CONSUMPTION)(metadata=None)


if __name__ == "__main__":
    unittest.main()
