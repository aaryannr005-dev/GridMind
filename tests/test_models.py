from datetime import datetime, timezone, timedelta
import unittest

from gridmind import BatteryConfig, DemandSeries, GridMindConfig, InputData, SolarSeries, TariffSeries, TimeSeriesPoint

BASE = datetime(2026, 1, 1, tzinfo=timezone.utc)


def points(*values):
    return tuple(TimeSeriesPoint(BASE + timedelta(hours=i), value) for i, value in enumerate(values))


class TimeSeriesTests(unittest.TestCase):
    def test_rejects_naive_timestamp(self):
        with self.assertRaisesRegex(ValueError, "timezone-aware"):
            TimeSeriesPoint(datetime(2026, 1, 1), 1.0)

    def test_rejects_negative_demand(self):
        with self.assertRaisesRegex(ValueError, "nonnegative"):
            DemandSeries(points(1.0, -1.0))

    def test_rejects_non_increasing_timestamps(self):
        repeated = (TimeSeriesPoint(BASE, 1), TimeSeriesPoint(BASE, 2))
        with self.assertRaisesRegex(ValueError, "strictly increasing"):
            SolarSeries(repeated)

    def test_tariffs_allow_negative_credit(self):
        tariffs = TariffSeries(import_rates=points(0.4, 0.5), export_rates=points(-0.1, 0.0))
        self.assertEqual(tariffs.export_rates[0].value, -0.1)

    def test_input_series_must_be_aligned(self):
        demand, solar, tariffs = DemandSeries(points(1.0, 2.0)), SolarSeries(points(0.0, 1.0)), TariffSeries(points(0.3, 0.4))
        InputData(demand, solar, tariffs)
        shifted = SolarSeries((TimeSeriesPoint(BASE + timedelta(minutes=30), 0.0), TimeSeriesPoint(BASE + timedelta(minutes=90), 1.0)))
        with self.assertRaisesRegex(ValueError, "timestamps must match"):
            InputData(demand, shifted, tariffs)

    def test_input_data_reports_wrong_component_type(self):
        with self.assertRaisesRegex(ValueError, "DemandSeries"):
            InputData(None, None, None)

    def test_rejects_extremely_large_integer(self):
        with self.assertRaisesRegex(ValueError, "finite"):
            TimeSeriesPoint(BASE, 10**1000)


class ConfigurationTests(unittest.TestCase):
    def test_valid_configuration_normalizes_currency(self):
        battery = BatteryConfig(10, 5, 5, 0.95, 0.9, 2)
        self.assertEqual(GridMindConfig(battery, currency="myr").currency, "MYR")

    def test_rejects_invalid_battery_limits(self):
        with self.assertRaisesRegex(ValueError, "cannot exceed"):
            BatteryConfig(10, 5, 5, initial_soc_kwh=11)
        with self.assertRaisesRegex(ValueError, "min_soc_kwh"):
            BatteryConfig(10, 5, 5, initial_soc_kwh=1, min_soc_kwh=2)
        with self.assertRaisesRegex(ValueError, "capacity"):
            BatteryConfig(10, 5, 5, max_soc_kwh=11)
        with self.assertRaisesRegex(ValueError, "min_soc_kwh"):
            BatteryConfig(10, 5, 5, min_soc_kwh=4, max_soc_kwh=3)
        with self.assertRaisesRegex(ValueError, "interval"):
            BatteryConfig(10, 5, 5, charge_efficiency=0)

    def test_default_maximum_soc_is_capacity(self):
        self.assertEqual(BatteryConfig(10, 5, 5).max_soc_kwh, 10)

    def test_rejects_invalid_interval_and_currency(self):
        battery = BatteryConfig(10, 5, 5)
        with self.assertRaisesRegex(ValueError, "positive integer"):
            GridMindConfig(battery, interval_minutes=0)
        with self.assertRaisesRegex(ValueError, "ASCII"):
            GridMindConfig(battery, currency="ÄBC")
        with self.assertRaisesRegex(ValueError, "three-letter"):
            GridMindConfig(battery, currency="ringgit")


if __name__ == "__main__":
    unittest.main()
