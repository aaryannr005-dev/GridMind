import importlib.util
import os
import unittest

os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")

if importlib.util.find_spec("PySide6") is not None:
    from PySide6.QtWidgets import QApplication

    from gridmind.desktop import GridMindWindow
else:
    QApplication = None
    GridMindWindow = None


@unittest.skipIf(QApplication is None, "install the optional desktop extra to run Qt tests")
class DesktopAppTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.app = QApplication.instance() or QApplication([])

    def setUp(self):
        self.window = GridMindWindow()

    def tearDown(self):
        self.window.close()

    def test_default_scenario_populates_metrics_charts_and_intervals(self):
        self.window.run_scenario()

        self.assertIsNotNone(self.window.last_run)
        self.assertEqual(self.window.metrics_table.rowCount(), 14)
        self.assertGreater(self.window.comparison_table.rowCount(), 0)
        self.assertEqual(self.window.baseline_table.rowCount(), 24)
        self.assertEqual(self.window.gridmind_table.rowCount(), 24)
        self.assertGreater(len(self.window.chart_widgets), 0)
        self.assertIn("Scenario complete", self.window.status.text())

    def test_invalid_edit_shows_error_and_clears_stale_results(self):
        self.window.run_scenario()
        self.assertIsNotNone(self.window.last_run)

        self.window.profile_table.item(0, 1).setText("")
        self.window.run_scenario()

        self.assertIsNone(self.window.last_run)
        self.assertIn("is required", self.window.status.text())
        self.assertEqual(self.window.metrics_table.rowCount(), 0)
        self.assertEqual(self.window.baseline_table.rowCount(), 0)


if __name__ == "__main__":
    unittest.main()
