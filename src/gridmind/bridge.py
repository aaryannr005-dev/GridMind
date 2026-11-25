"""Bounded JSON-lines sidecar protocol for the local desktop application.

The bridge delegates every calculation to the existing dashboard adapter and
Python engine. Standard output is reserved for protocol messages; diagnostics
are written to standard error.
"""

from __future__ import annotations

from dataclasses import fields, is_dataclass
from datetime import date, datetime
from enum import Enum
import json
import logging
import sys
from typing import BinaryIO, TextIO

from .dashboard import build_hourly_scenario, run_hourly_scenario
from .scenario_analysis import SensitivityMetric, SensitivityParameter, run_sensitivity_analysis
from .optimizer import OptimizationConfig
from .simulation import simulate
from .models import BatteryConfig, GridConfig, PvConfig


MAX_REQUEST_BYTES = 1_000_000
_REQUEST_KEYS = {"id", "operation", "payload"}
_REQUIRED_PAYLOAD_KEYS = {
    "start_date",
    "demand_kwh",
    "solar_generation_kwh",
    "import_rate_per_kwh",
    "export_rate_per_kwh",
    "battery",
}
_PAYLOAD_KEYS = _REQUIRED_PAYLOAD_KEYS | {
    "currency",
    "grid",
    "pv",
    "ambient_temperature_c",
    "solar_irradiance_w_m2",
    "degradation_cost_per_kwh",
}
_BATTERY_KEYS = {
    "capacity_kwh",
    "max_charge_power_kw",
    "max_discharge_power_kw",
    "charge_efficiency",
    "discharge_efficiency",
    "initial_soc_kwh",
    "min_soc_kwh",
    "max_soc_kwh",
    "state_of_health",
}
_GRID_KEYS = {"max_import_power_kw", "max_export_power_kw"}
_PV_KEYS = {"reference_temperature_c", "noct_c", "temperature_coefficient_per_c"}
_WEATHER_KEYS = ("ambient_temperature_c", "solar_irradiance_w_m2")


class BridgeError(Exception):
    """An expected request or engine error safe to return to the renderer."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


def _is_object(value: object) -> bool:
    return isinstance(value, dict) and all(isinstance(key, str) for key in value)


def _is_number(value: object) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _validate_request(request: object) -> tuple[str, str, dict[str, object]]:
    if not _is_object(request):
        raise BridgeError("INVALID_REQUEST", "Request must be a JSON object")
    if set(request) != _REQUEST_KEYS:
        raise BridgeError("INVALID_REQUEST", "Request must contain only id, operation, and payload")

    request_id = request["id"]
    if not isinstance(request_id, str) or not request_id or len(request_id) > 128:
        raise BridgeError("INVALID_REQUEST", "Request id must be a non-empty string of at most 128 characters")
    operation = request["operation"]
    if operation not in {"run_hourly_scenario", "run_sensitivity_analysis"}:
        raise BridgeError("UNKNOWN_OPERATION", "This engine operation is not supported")

    payload = request["payload"]
    if not _is_object(payload):
        raise BridgeError("INVALID_REQUEST", "Scenario payload must be a JSON object")
    if operation == "run_sensitivity_analysis":
        if set(payload) != {"scenario", "parameter", "multipliers", "metric", "strategy"}:
            raise BridgeError("INVALID_REQUEST", "Sensitivity payload has missing or unsupported fields")
        if not isinstance(payload["scenario"], dict):
            raise BridgeError("INVALID_SCENARIO", "scenario must be a valid hourly scenario payload")
        _validate_request({"id": request_id, "operation": "run_hourly_scenario", "payload": payload["scenario"]})
        if payload["parameter"] not in {item.value for item in SensitivityParameter}:
            raise BridgeError("INVALID_SCENARIO", "parameter is not supported for sensitivity analysis")
        if payload["metric"] not in {item.value for item in SensitivityMetric}:
            raise BridgeError("INVALID_SCENARIO", "metric is not supported for sensitivity analysis")
        if payload["strategy"] not in {"baseline", "gridmind"}:
            raise BridgeError("INVALID_SCENARIO", "strategy must be baseline or gridmind")
        multipliers = payload["multipliers"]
        if not isinstance(multipliers, list) or not 2 <= len(multipliers) <= 9:
            raise BridgeError("INVALID_SCENARIO", "multipliers must contain between 2 and 9 values")
        return request_id, operation, payload
    required = _REQUIRED_PAYLOAD_KEYS
    if not required.issubset(payload) or set(payload) - _PAYLOAD_KEYS:
        raise BridgeError("INVALID_REQUEST", "Scenario payload has missing or unsupported fields")

    start_date = payload["start_date"]
    if not isinstance(start_date, str):
        raise BridgeError("INVALID_SCENARIO", "start_date must use YYYY-MM-DD format")
    try:
        parsed_date = date.fromisoformat(start_date)
    except ValueError as exc:
        raise BridgeError("INVALID_SCENARIO", "start_date must use YYYY-MM-DD format") from exc
    if parsed_date.isoformat() != start_date:
        raise BridgeError("INVALID_SCENARIO", "start_date must use YYYY-MM-DD format")

    battery = payload["battery"]
    if not _is_object(battery) or not {"capacity_kwh", "max_charge_power_kw", "max_discharge_power_kw"}.issubset(battery):
        raise BridgeError("INVALID_SCENARIO", "battery must include capacity and charge/discharge power limits")
    if set(battery) - _BATTERY_KEYS:
        raise BridgeError("INVALID_REQUEST", "Battery configuration contains unsupported fields")
    if "currency" in payload and not isinstance(payload["currency"], str):
        raise BridgeError("INVALID_SCENARIO", "currency must be a string")

    grid = payload.get("grid")
    if grid is not None:
        if not _is_object(grid) or set(grid) - _GRID_KEYS:
            raise BridgeError("INVALID_REQUEST", "grid contains unsupported fields")
        if any(value is not None and not _is_number(value) for value in grid.values()):
            raise BridgeError("INVALID_SCENARIO", "grid limits must be numbers or null")
    pv = payload.get("pv")
    if pv is not None:
        if not _is_object(pv) or set(pv) - _PV_KEYS:
            raise BridgeError("INVALID_REQUEST", "pv contains unsupported fields")
        if not all(_is_number(value) for value in pv.values()):
            raise BridgeError("INVALID_SCENARIO", "pv parameters must be numbers")
    degradation = payload.get("degradation_cost_per_kwh")
    if degradation is not None and not _is_number(degradation):
        raise BridgeError(
            "INVALID_SCENARIO", "degradation_cost_per_kwh must be a number"
        )
    for name in _WEATHER_KEYS:
        if name in payload:
            values = payload[name]
            if (
                not isinstance(values, list)
                or len(values) != 24
                or not all(_is_number(value) for value in values)
            ):
                raise BridgeError(
                    "INVALID_SCENARIO",
                    f"{name} must contain exactly 24 numeric values",
                )

    for name in ("demand_kwh", "solar_generation_kwh", "import_rate_per_kwh", "export_rate_per_kwh"):
        values = payload[name]
        if not isinstance(values, list) or len(values) != 24:
            raise BridgeError("INVALID_SCENARIO", f"{name} must contain exactly 24 hourly values")

    return request_id, operation, payload


def _json_value(value: object) -> object:
    if is_dataclass(value) and not isinstance(value, type):
        return {field.name: _json_value(getattr(value, field.name)) for field in fields(value)}
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Enum):
        return _json_value(value.value)
    if isinstance(value, (tuple, list)):
        return [_json_value(item) for item in value]
    if isinstance(value, dict):
        return {str(key): _json_value(item) for key, item in value.items()}
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    raise TypeError(f"Unsupported response value: {type(value).__name__}")


def handle_request(request: object) -> dict[str, object]:
    """Validate one request, run the existing engine, and return a report DTO."""

    request_id: str | None = None
    try:
        if _is_object(request):
            candidate_id = request.get("id")
            if isinstance(candidate_id, str) and candidate_id and len(candidate_id) <= 128:
                request_id = candidate_id
        request_id, operation, payload = _validate_request(request)
        try:
            if operation == "run_sensitivity_analysis":
                scenario = payload["scenario"]
                battery = BatteryConfig(**scenario["battery"])
                grid = GridConfig(**scenario["grid"]) if scenario.get("grid") is not None else None
                pv = PvConfig(**scenario["pv"]) if scenario.get("pv") is not None else None
                config, inputs = build_hourly_scenario(
                    scenario["demand_kwh"], scenario["solar_generation_kwh"],
                    scenario["import_rate_per_kwh"], scenario["export_rate_per_kwh"],
                    start_date=date.fromisoformat(scenario["start_date"]), battery=battery,
                    currency=scenario.get("currency", "MYR"), grid=grid, pv=pv,
                    ambient_temperature_c=scenario.get("ambient_temperature_c"),
                    solar_irradiance_w_m2=scenario.get("solar_irradiance_w_m2"),
                )
                options = None
                if payload["strategy"] == "gridmind":
                    baseline = simulate(config, inputs)
                    options = OptimizationConfig(
                        soc_step_kwh=max(battery.capacity_kwh / 200, 0.01),
                        terminal_soc_kwh=baseline.intervals[-1].state_of_charge_kwh,
                        baseline_soc_schedule_kwh=tuple(item.state_of_charge_kwh for item in baseline.intervals),
                        degradation_cost_per_kwh=scenario.get("degradation_cost_per_kwh", 0.0),
                    )
                result = run_sensitivity_analysis(
                    config, inputs, parameter=SensitivityParameter(payload["parameter"]),
                    multipliers=payload["multipliers"], metric=SensitivityMetric(payload["metric"]),
                    optimization_options=options,
                )
                return {"id": request_id, "ok": True, "result": _json_value(result)}
            battery = BatteryConfig(**payload["battery"])
            grid = (
                GridConfig(**payload["grid"])
                if payload.get("grid") is not None
                else None
            )
            pv = (
                PvConfig(**payload["pv"])
                if payload.get("pv") is not None
                else None
            )
            run = run_hourly_scenario(
                payload["demand_kwh"],
                payload["solar_generation_kwh"],
                payload["import_rate_per_kwh"],
                payload["export_rate_per_kwh"],
                start_date=date.fromisoformat(payload["start_date"]),
                battery=battery,
                currency=payload.get("currency", "MYR"),
                grid=grid,
                pv=pv,
                ambient_temperature_c=payload.get("ambient_temperature_c"),
                solar_irradiance_w_m2=payload.get("solar_irradiance_w_m2"),
                degradation_cost_per_kwh=payload.get("degradation_cost_per_kwh", 0.0),
            )
        except (TypeError, ValueError, OverflowError) as exc:
            raise BridgeError("INVALID_SCENARIO", str(exc)) from exc
        return {"id": request_id, "ok": True, "result": _json_value(run.report)}
    except BridgeError as exc:
        return {"id": request_id, "ok": False, "error": {"code": exc.code, "message": str(exc)}}
    except Exception:
        logging.exception("Unexpected GridMind engine bridge failure")
        return {
            "id": request_id,
            "ok": False,
            "error": {"code": "ENGINE_ERROR", "message": "The engine could not complete this scenario"},
        }


def _response_line(response: dict[str, object]) -> str:
    try:
        return json.dumps(response, allow_nan=False, separators=(",", ":")) + "\n"
    except (TypeError, ValueError):
        return json.dumps(
            {
                "id": response.get("id"),
                "ok": False,
                "error": {"code": "ENGINE_ERROR", "message": "The engine returned an invalid response"},
            },
            separators=(",", ":"),
        ) + "\n"


def run_stdio(stdin: BinaryIO, stdout: TextIO) -> None:
    """Serve newline-delimited JSON requests without writing logs to stdout."""

    while True:
        raw = stdin.readline(MAX_REQUEST_BYTES + 1)
        if not raw:
            return
        if len(raw) > MAX_REQUEST_BYTES:
            while raw and not raw.endswith(b"\n"):
                raw = stdin.readline(MAX_REQUEST_BYTES + 1)
            stdout.write(_response_line({
                "id": None,
                "ok": False,
                "error": {"code": "REQUEST_TOO_LARGE", "message": "Request exceeds the 1 MB limit"},
            }))
            stdout.flush()
            continue
        try:
            request = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            response = {
                "id": None,
                "ok": False,
                "error": {"code": "MALFORMED_JSON", "message": "Request must be one UTF-8 JSON object per line"},
            }
        else:
            response = handle_request(request)
        stdout.write(_response_line(response))
        stdout.flush()


def main() -> None:
    logging.basicConfig(stream=sys.stderr, level=logging.ERROR)
    run_stdio(sys.stdin.buffer, sys.stdout)


if __name__ == "__main__":
    main()
