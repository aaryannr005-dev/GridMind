from dataclasses import replace
from datetime import datetime, timedelta, timezone
import unittest

from gridmind import (
    BatteryConfig,
    DemandSeries,
    GridMindConfig,
    InputData,
    ReferenceMeasurements,
    SolarSeries,
    TariffSeries,
    TimeSeriesPoint,
    simulate,
    validate_simulation_against_reference,
)

START = datetime(2026, 1, 1, tzinfo=timezone.utc)


def points(values, start=START):
    return tuple(TimeSeriesPoint(start + timedelta(hours=i), value) for i, value in enumerate(values))


def scenario():
    config = GridMindConfig(BatteryConfig(2, 1, 1))
    inputs = InputData(
        DemandSeries(points((1.0, 1.0, 0.5))),
        SolarSeries(points((0.0, 2.0, 0.0))),
        TariffSeries(points((0.3, 0.3, 0.3))),
    )
    return config, inputs, simulate(config, inputs)


class ReferenceMeasurementModelTests(unittest.TestCase):
    def test_requires_source_and_at_least_one_channel(self):
        with self.assertRaisesRegex(ValueError, "source_name"):
            ReferenceMeasurements("")
        with self.assertRaisesRegex(ValueError, "at least one"):
            ReferenceMeasurements("Site meter")

    def test_rejects_empty_negative_or_unsorted_measurements(self):
        with self.assertRaisesRegex(ValueError, "at least one measurement"):
            ReferenceMeasurements("Meter", demand_kwh=())
        with self.assertRaisesRegex(ValueError, "nonnegative"):
            ReferenceMeasurements("Meter", demand_kwh=points((1.0, -0.1)))
        unsorted = (
            TimeSeriesPoint(START + timedelta(hours=1), 1.0),
            TimeSeriesPoint(START, 1.0),
        )
        with self.assertRaisesRegex(ValueError, "strictly increasing"):
            ReferenceMeasurements("Meter", demand_kwh=unsorted)

    def test_rejects_non_point_entries(self):
        with self.assertRaisesRegex(ValueError, "TimeSeriesPoint"):
            ReferenceMeasurements("Meter", demand_kwh=(1.0,))


class SimulationValidationTests(unittest.TestCase):
    def test_exact_measurements_pass_with_zero_error(self):
        _, _, result = scenario()
        reference = ReferenceMeasurements(
            "Calibrated site meter",
            demand_kwh=points(tuple(i.demand_kwh for i in result.intervals)),
            solar_generation_kwh=points(tuple(i.solar_generation_kwh for i in result.intervals)),
            grid_import_kwh=points(tuple(i.grid_import_kwh for i in result.intervals)),
            grid_export_kwh=points(tuple(i.grid_export_kwh for i in result.intervals)),
            battery_soc_kwh=points(tuple(i.state_of_charge_kwh for i in result.intervals)),
        )
        report = validate_simulation_against_reference(
            result, reference, absolute_tolerance_kwh=0.0
        )
        self.assertTrue(report.within_tolerance)
        self.assertEqual(report.source_name, "Calibrated site meter")
        self.assertEqual(report.demand.measurement_count, 3)
        self.assertEqual(report.grid_import.mean_absolute_error_kwh, 0.0)
        self.assertEqual(report.battery_soc.maximum_absolute_error_kwh, 0.0)

    def test_reports_mae_rmse_bias_and_maximum_error(self):
        _, _, result = scenario()
        measured = tuple(i.grid_import_kwh for i in result.intervals)
        reference = ReferenceMeasurements(
            "Grid meter",
            grid_import_kwh=points((measured[0] + 0.2, measured[1] + 0.1, measured[2])),
        )
        report = validate_simulation_against_reference(
            result, reference, absolute_tolerance_kwh=0.15
        )
        channel = report.grid_import
        self.assertAlmostEqual(channel.mean_absolute_error_kwh, 0.1)
        self.assertAlmostEqual(channel.root_mean_square_error_kwh, (0.05 / 3) ** 0.5)
        self.assertAlmostEqual(channel.mean_bias_error_kwh, -0.1 / 3)
        self.assertAlmostEqual(channel.maximum_absolute_error_kwh, 0.2)
        self.assertFalse(channel.within_tolerance)
        self.assertFalse(report.within_tolerance)

    def test_only_supplied_channels_are_assessed(self):
        _, _, result = scenario()
        reference = ReferenceMeasurements(
            "PV meter",
            solar_generation_kwh=points(tuple(i.solar_generation_kwh for i in result.intervals)),
        )
        report = validate_simulation_against_reference(
            result, reference, absolute_tolerance_kwh=0.01
        )
        self.assertTrue(report.within_tolerance)
        self.assertIsNone(report.demand)
        self.assertIsNotNone(report.solar_generation)

    def test_rejects_shifted_or_incomplete_timestamp_alignment(self):
        _, _, result = scenario()
        reference = ReferenceMeasurements(
            "Demand meter",
            demand_kwh=points((1.0, 1.0, 0.5), START + timedelta(minutes=15)),
        )
        with self.assertRaisesRegex(ValueError, "timestamps must match"):
            validate_simulation_against_reference(
                result, reference, absolute_tolerance_kwh=0.1
            )
        short_reference = ReferenceMeasurements(
            "Demand meter", demand_kwh=points((1.0, 1.0))
        )
        with self.assertRaisesRegex(ValueError, "timestamps must match"):
            validate_simulation_against_reference(
                result, short_reference, absolute_tolerance_kwh=0.1
            )

    def test_equivalent_timezones_align_by_instant(self):
        _, _, result = scenario()
        local = tuple(
            TimeSeriesPoint(
                (interval.timestamp + timedelta(hours=8)).replace(tzinfo=timezone(timedelta(hours=8))),
                interval.demand_kwh,
            )
            for interval in result.intervals
        )
        report = validate_simulation_against_reference(
            result,
            ReferenceMeasurements("Local meter", demand_kwh=local),
            absolute_tolerance_kwh=0.0,
        )
        self.assertTrue(report.within_tolerance)

    def test_rejects_invalid_tolerance_and_result_types(self):
        _, _, result = scenario()
        reference = ReferenceMeasurements("Meter", demand_kwh=points((1.0, 1.0, 0.5)))
        for invalid in (-0.1, float("nan"), float("inf"), True):
            with self.subTest(invalid=invalid):
                with self.assertRaisesRegex(ValueError, "absolute_tolerance_kwh"):
                    validate_simulation_against_reference(
                        result, reference, absolute_tolerance_kwh=invalid
                    )
        with self.assertRaisesRegex(ValueError, "SimulationResult"):
            validate_simulation_against_reference(
                object(), reference, absolute_tolerance_kwh=0.1
            )

    def test_rejects_non_monotonic_result_timestamps(self):
        _, _, result = scenario()
        invalid = replace(
            result,
            intervals=(result.intervals[1], result.intervals[0], result.intervals[2]),
        )
        reference = ReferenceMeasurements(
            "Meter", demand_kwh=points((1.0, 1.0, 0.5))
        )
        with self.assertRaisesRegex(ValueError, "result timestamps"):
            validate_simulation_against_reference(
                invalid, reference, absolute_tolerance_kwh=0.1
            )


if __name__ == "__main__":
    unittest.main()
