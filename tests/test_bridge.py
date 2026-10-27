from __future__ import annotations

from datetime import date
from io import BytesIO, StringIO
import json
import unittest

from gridmind.bridge import MAX_REQUEST_BYTES, handle_request, run_stdio
from gridmind.dashboard import run_hourly_scenario
from gridmind.models import BatteryConfig


def scenario_request(**changes):
    payload = {
        "start_date": "2026-01-15",
        "demand_kwh": [1.0] * 24,
        "solar_generation_kwh": [0.0] * 24,
        "import_rate_per_kwh": [0.2] * 24,
        "export_rate_per_kwh": [0.05] * 24,
        "battery": {
            "capacity_kwh": 4.0,
            "max_charge_power_kw": 2.0,
            "max_discharge_power_kw": 2.0,
        },
    }
    payload.update(changes)
    return {"id": "test-1", "operation": "run_hourly_scenario", "payload": payload}


class EngineBridgeTests(unittest.TestCase):
    def test_report_matches_existing_python_engine_outputs(self):
        request = scenario_request()
        payload = request["payload"]
        result = handle_request(request)

        expected = run_hourly_scenario(
            payload["demand_kwh"],
            payload["solar_generation_kwh"],
            payload["import_rate_per_kwh"],
            payload["export_rate_per_kwh"],
            start_date=date.fromisoformat(payload["start_date"]),
            battery=BatteryConfig(**payload["battery"]),
        ).report

        self.assertTrue(result["ok"])
        self.assertEqual(result["id"], "test-1")
        report = result["result"]
        self.assertEqual(report["scenario_fingerprint"], expected.scenario_fingerprint)
        self.assertEqual(report["baseline"]["grid_import_kwh"], expected.baseline.grid_import_kwh)
        self.assertEqual(report["baseline"]["net_cost"], expected.baseline.net_cost)
        self.assertEqual(report["gridmind"]["grid_import_kwh"], expected.gridmind.grid_import_kwh)
        self.assertEqual(report["comparison"]["cost_savings"], expected.comparison.cost_savings)
        self.assertEqual(report["baseline_intervals"][0]["timestamp"], "2026-01-15T00:00:00+08:00")
        self.assertTrue(report["charts"])

    def test_rejects_unknown_operations_and_fields(self):
        unknown_operation = scenario_request()
        unknown_operation["operation"] = "execute_python"
        self.assertEqual(handle_request(unknown_operation)["error"]["code"], "UNKNOWN_OPERATION")

        extra_field = scenario_request()
        extra_field["payload"]["command"] = "not allowed"
        self.assertEqual(handle_request(extra_field)["error"]["code"], "INVALID_REQUEST")

    def test_validation_errors_are_structured_and_keep_the_request_id(self):
        invalid = scenario_request(demand_kwh=[1.0] * 23)
        result = handle_request(invalid)
        self.assertEqual(result["id"], "test-1")
        self.assertFalse(result["ok"])
        self.assertEqual(result["error"]["code"], "INVALID_SCENARIO")
        self.assertIn("exactly 24", result["error"]["message"])

    def test_rejects_boolean_energy_and_invalid_battery_limits(self):
        invalid_energy = scenario_request(demand_kwh=[True] + [1.0] * 23)
        self.assertEqual(handle_request(invalid_energy)["error"]["code"], "INVALID_SCENARIO")

        invalid_battery = scenario_request(battery={
            "capacity_kwh": 1.0,
            "max_charge_power_kw": -1.0,
            "max_discharge_power_kw": 2.0,
        })
        self.assertEqual(handle_request(invalid_battery)["error"]["code"], "INVALID_SCENARIO")

    def test_stdio_isolates_malformed_line_and_continues(self):
        valid = json.dumps(scenario_request()).encode("utf-8") + b"\n"
        source = BytesIO(b"not json\n" + valid)
        output = StringIO()

        run_stdio(source, output)

        responses = [json.loads(line) for line in output.getvalue().splitlines()]
        self.assertEqual(len(responses), 2)
        self.assertEqual(responses[0]["error"]["code"], "MALFORMED_JSON")
        self.assertEqual(responses[1]["id"], "test-1")
        self.assertTrue(responses[1]["ok"])

    def test_stdio_rejects_oversized_line_and_continues(self):
        valid = json.dumps(scenario_request()).encode("utf-8") + b"\n"
        source = BytesIO(b" " * (MAX_REQUEST_BYTES + 1) + b"\n" + valid)
        output = StringIO()

        run_stdio(source, output)

        responses = [json.loads(line) for line in output.getvalue().splitlines()]
        self.assertEqual(responses[0]["error"]["code"], "REQUEST_TOO_LARGE")
        self.assertEqual(responses[1]["id"], "test-1")
        self.assertTrue(responses[1]["ok"])


if __name__ == "__main__":
    unittest.main()
