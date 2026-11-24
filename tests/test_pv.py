from datetime import datetime, timezone
import unittest

from gridmind import PvConfig
from gridmind.pv import (
    apply_temperature_derating,
    cell_temperature_c,
    temperature_derate_factor,
)


class PvDeratingTests(unittest.TestCase):
    def test_cell_temperature_matches_noct_standard_conditions(self):
        pv = PvConfig()
        self.assertAlmostEqual(cell_temperature_c(20, 800, pv), 45.0)
        self.assertAlmostEqual(cell_temperature_c(20, 0, pv), 20.0)

    def test_reference_cell_temperature_has_no_derating(self):
        pv = PvConfig()
        self.assertAlmostEqual(temperature_derate_factor(25, 0, pv), 1.0)

    def test_hot_conditions_derate_and_cold_conditions_never_amplify(self):
        pv = PvConfig()
        # 30 °C ambient at 800 W/m² gives a 55 °C cell: 1 - 0.004 × 30 = 0.88.
        self.assertAlmostEqual(temperature_derate_factor(30, 800, pv), 0.88)
        # A cold cell would imply a factor above 1, capped so derating cannot
        # create generation beyond the supplied solar input.
        self.assertEqual(temperature_derate_factor(-10, 800, pv), 1.0)

    def test_zero_coefficient_disables_derating(self):
        pv = PvConfig(temperature_coefficient_per_c=0.0)
        self.assertEqual(temperature_derate_factor(60, 1200, pv), 1.0)

    def test_series_derating_preserves_alignment(self):
        pv = PvConfig()
        result = apply_temperature_derating(
            [2.0, 1.0], [30.0, 25.0], [800.0, 0.0], pv
        )
        self.assertAlmostEqual(result[0], 1.76)
        self.assertAlmostEqual(result[1], 1.0)

    def test_rejects_mismatched_lengths_and_invalid_values(self):
        pv = PvConfig()
        with self.assertRaisesRegex(ValueError, "equal lengths"):
            apply_temperature_derating([1.0], [30.0, 31.0], [800.0], pv)
        with self.assertRaisesRegex(ValueError, "nonnegative"):
            apply_temperature_derating([1.0], [30.0], [-1.0], pv)
        with self.assertRaisesRegex(ValueError, "nonnegative"):
            apply_temperature_derating([-1.0], [30.0], [800.0], pv)
        with self.assertRaisesRegex(ValueError, "finite"):
            apply_temperature_derating([1.0], [float("nan")], [800.0], pv)

    def test_rejects_positive_temperature_coefficient(self):
        with self.assertRaisesRegex(ValueError, "zero or negative"):
            PvConfig(temperature_coefficient_per_c=0.01)


if __name__ == "__main__":
    unittest.main()
