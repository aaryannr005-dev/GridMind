from datetime import datetime, timezone, timedelta
import unittest
from zoneinfo import ZoneInfo

from gridmind import (
    BatteryConfig,
    DemandSeries,
    GridConfig,
    GridMindConfig,
    InputData,
    PvConfig,
    SolarSeries,
    TariffSeries,
    TimeSeriesPoint,
)

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

    def test_accepts_distinct_instants_in_repeated_daylight_saving_hour(self):
        local = ZoneInfo("America/New_York")
        first = TimeSeriesPoint(datetime(2025, 11, 2, 1, tzinfo=local, fold=0), 1)
        second = TimeSeriesPoint(datetime(2025, 11, 2, 1, tzinfo=local, fold=1), 2)
        self.assertEqual(len(DemandSeries((first, second)).points), 2)

    def test_rejects_series_alignment_at_different_daylight_saving_folds(self):
        local = ZoneInfo("America/New_York")
        first = TimeSeriesPoint(datetime(2025, 11, 2, 1, tzinfo=local, fold=0), 1)
        second = TimeSeriesPoint(datetime(2025, 11, 2, 1, tzinfo=local, fold=1), 1)
        with self.assertRaisesRegex(ValueError, "timestamps must match"):
            InputData(DemandSeries((first,)), SolarSeries((second,)), TariffSeries((first,)))

    def test_rejects_none_as_timeseries_input_with_value_error(self):
        with self.assertRaisesRegex(ValueError, "iterable"):
            DemandSeries(None)

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
        with self.assertRaisesRegex(ValueError, "datetime range"):
            GridMindConfig(battery, interval_minutes=10**1000)


class BatteryHealthTests(unittest.TestCase):
    def test_state_of_health_scales_usable_capacity_and_default_maximum(self):
        battery = BatteryConfig(10, 5, 5, state_of_health=0.8)
        self.assertAlmostEqual(battery.usable_capacity_kwh, 8.0)
        self.assertAlmostEqual(battery.max_soc_kwh, 8.0)

    def test_explicit_maximum_cannot_exceed_usable_capacity(self):
        with self.assertRaisesRegex(ValueError, "after state_of_health"):
            BatteryConfig(10, 5, 5, max_soc_kwh=9, state_of_health=0.8)

    def test_initial_soc_cannot_exceed_usable_capacity(self):
        with self.assertRaisesRegex(ValueError, "cannot exceed"):
            BatteryConfig(10, 5, 5, initial_soc_kwh=9, state_of_health=0.8)

    def test_rejects_state_of_health_outside_positive_fraction(self):
        for value in (0, -0.1, 1.1):
            with self.subTest(value=value), self.assertRaisesRegex(ValueError, "state_of_health"):
                BatteryConfig(10, 5, 5, state_of_health=value)
        with self.assertRaisesRegex(ValueError, "state_of_health must be a number"):
            BatteryConfig(10, 5, 5, state_of_health=True)


class GridConfigurationTests(unittest.TestCase):
    def test_defaults_are_unlimited(self):
        grid = GridConfig()
        self.assertIsNone(grid.max_import_power_kw)
        self.assertIsNone(grid.max_export_power_kw)

    def test_rejects_negative_or_nonfinite_limits(self):
        for name in ("max_import_power_kw", "max_export_power_kw"):
            for value in (-1, float("nan"), float("inf")):
                with self.subTest(name=name, value=value), self.assertRaises(ValueError):
                    GridConfig(**{name: value})
        with self.assertRaisesRegex(ValueError, "must be a number"):
            GridConfig(max_import_power_kw=True)

    def test_config_defaults_to_unlimited_grid_and_no_pv(self):
        config = GridMindConfig(BatteryConfig(1, 1, 1))
        self.assertIsInstance(config.grid, GridConfig)
        self.assertIsNone(config.pv)

    def test_config_rejects_wrong_grid_or_pv_type(self):
        battery = BatteryConfig(1, 1, 1)
        with self.assertRaisesRegex(ValueError, "GridConfig"):
            GridMindConfig(battery, grid=object())
        with self.assertRaisesRegex(ValueError, "PvConfig"):
            GridMindConfig(battery, pv=object())


class PvConfigurationTests(unittest.TestCase):
    def test_defaults_match_first_order_noct_model(self):
        pv = PvConfig()
        self.assertEqual(pv.reference_temperature_c, 25.0)
        self.assertEqual(pv.noct_c, 45.0)
        self.assertEqual(pv.temperature_coefficient_per_c, -0.004)

    def test_rejects_positive_or_nonfinite_coefficients(self):
        with self.assertRaisesRegex(ValueError, "zero or negative"):
            PvConfig(temperature_coefficient_per_c=0.001)
        with self.assertRaisesRegex(ValueError, "finite"):
            PvConfig(noct_c=float("nan"))


if __name__ == "__main__":
    unittest.main()

