from __future__ import annotations

from datetime import date
from io import BytesIO, StringIO
import json
import unittest

from gridmind.bridge import MAX_REQUEST_BYTES, handle_request, run_stdio
from gridmind.dashboard import run_hourly_scenario
from gridmind.models import BatteryConfig, GridConfig, PvConfig


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

    def test_accepts_fidelity_fields_and_matches_direct_engine_run(self):
        request = scenario_request(
            grid={"max_import_power_kw": 2.0, "max_export_power_kw": 1.0},
            pv={"noct_c": 45.0},
            ambient_temperature_c=[30.0] * 24,
            solar_irradiance_w_m2=[800.0] * 24,
            degradation_cost_per_kwh=0.01,
            battery={
                "capacity_kwh": 4.0,
                "max_charge_power_kw": 2.0,
                "max_discharge_power_kw": 2.0,
                "state_of_health": 0.9,
            },
        )
        payload = request["payload"]
        result = handle_request(request)

        expected = run_hourly_scenario(
            payload["demand_kwh"],
            payload["solar_generation_kwh"],
            payload["import_rate_per_kwh"],
            payload["export_rate_per_kwh"],
            start_date=date.fromisoformat(payload["start_date"]),
            battery=BatteryConfig(**payload["battery"]),
            grid=GridConfig(**payload["grid"]),
            pv=PvConfig(),
            ambient_temperature_c=payload["ambient_temperature_c"],
            solar_irradiance_w_m2=payload["solar_irradiance_w_m2"],
            degradation_cost_per_kwh=payload["degradation_cost_per_kwh"],
        ).report

        self.assertTrue(result["ok"])
        self.assertEqual(
            result["result"]["scenario_fingerprint"], expected.scenario_fingerprint
        )

    def test_rejects_invalid_fidelity_field_shapes(self):
        invalid_grid = scenario_request(
            grid={"max_import_power_kw": 1.0, "command": 1}
        )
        self.assertEqual(
            handle_request(invalid_grid)["error"]["code"], "INVALID_REQUEST"
        )

        non_numeric_grid = scenario_request(grid={"max_import_power_kw": "1"})
        self.assertEqual(
            handle_request(non_numeric_grid)["error"]["code"], "INVALID_SCENARIO"
        )

        short_weather = scenario_request(
            pv={},
            ambient_temperature_c=[30.0] * 23,
            solar_irradiance_w_m2=[800.0] * 24,
        )
        self.assertEqual(
            handle_request(short_weather)["error"]["code"], "INVALID_SCENARIO"
        )

        health_above_one = scenario_request(
            battery={
                "capacity_kwh": 4.0,
                "max_charge_power_kw": 2.0,
                "max_discharge_power_kw": 2.0,
                "state_of_health": 1.5,
            }
        )
        self.assertEqual(
            handle_request(health_above_one)["error"]["code"], "INVALID_SCENARIO"
        )

        pv_without_weather = scenario_request(pv={})
        self.assertEqual(
            handle_request(pv_without_weather)["error"]["code"], "INVALID_SCENARIO"
        )

    def test_import_cap_failure_is_reported_as_invalid_scenario(self):
        request = scenario_request(grid={"max_import_power_kw": 0.5})
        result = handle_request(request)
        self.assertEqual(result["error"]["code"], "INVALID_SCENARIO")
        self.assertIn("grid import exceeds", result["error"]["message"])


if __name__ == "__main__":
    unittest.main()
