"""Optional end-to-end checks for Streamlit's consumer-facing scenario form."""

from __future__ import annotations

from pathlib import Path

import pytest

streamlit = pytest.importorskip("streamlit", reason="install the optional desktop/dashboard extra")
from streamlit.testing.v1 import AppTest


APP = Path(__file__).resolve().parents[1] / "app.py"


def test_consumer_edits_profile_and_sees_real_scenario_results():
    app = AppTest.from_file(str(APP)).run(timeout=30)
    app.session_state["energy_profile"] = {
        "edited_rows": {0: {"Demand (kWh)": 2.0, "Import tariff (per kWh)": 0.5}},
        "added_rows": [],
        "deleted_rows": [],
    }
    app.button[0].click().run(timeout=30)

    assert not app.exception
    assert not app.error
    run = app.session_state["gridmind_run"]
    assert run.baseline.intervals[0].demand_kwh == 2.0
    assert run.report.comparison is not None
    assert len(run.report.charts) == 4
    assert len(run.report.baseline_intervals) == 24
    assert len(run.report.gridmind_intervals) == 24


def test_invalid_consumer_edit_shows_validation_and_clears_old_results():
    app = AppTest.from_file(str(APP)).run(timeout=30)
    app.session_state["energy_profile"] = {
        "edited_rows": {0: {"Demand (kWh)": -1.0}},
        "added_rows": [],
        "deleted_rows": [],
    }
    app.button[0].click().run(timeout=30)

    assert not app.exception
    assert "gridmind_run" not in app.session_state
    assert len(app.error) == 1
    assert "correct the scenario inputs" in app.error[0].value.lower()
