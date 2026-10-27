// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  decodeEngineResponse,
  isRunHourlyScenarioPayload,
  type RunHourlyScenarioPayload,
} from "./protocol";

function validPayload(): RunHourlyScenarioPayload {
  return {
    start_date: "2026-01-15",
    demand_kwh: Array(24).fill(1),
    solar_generation_kwh: Array(24).fill(0),
    import_rate_per_kwh: Array(24).fill(0.2),
    export_rate_per_kwh: Array(24).fill(0.05),
    battery: {
      capacity_kwh: 4,
      max_charge_power_kw: 2,
      max_discharge_power_kw: 2,
    },
  };
}

describe("desktop engine protocol", () => {
  it("accepts a complete bounded hourly scenario", () => {
    expect(isRunHourlyScenarioPayload(validPayload())).toBe(true);
  });

  it("rejects malformed, non-finite, or unexpected input fields", () => {
    const shortSeries = { ...validPayload(), demand_kwh: Array(23).fill(1) };
    const nonFinite = { ...validPayload(), demand_kwh: [Number.NaN, ...Array(23).fill(1)] };
    const extraField = { ...validPayload(), shell: "python -c ..." };
    expect(isRunHourlyScenarioPayload(shortSeries)).toBe(false);
    expect(isRunHourlyScenarioPayload(nonFinite)).toBe(false);
    expect(isRunHourlyScenarioPayload(extraField)).toBe(false);
  });

  it("decodes only structured engine success and failure messages", () => {
    const report = {
      scenario_fingerprint: "fingerprint",
      baseline: {},
      baseline_intervals: [],
      charts: [],
    };
    expect(decodeEngineResponse({ id: "request-1", ok: true, result: report })).toMatchObject({
      id: "request-1",
      ok: true,
    });
    expect(decodeEngineResponse({
      id: "request-2",
      ok: false,
      error: { code: "INVALID_SCENARIO", message: "Demand is invalid" },
    })).toMatchObject({ ok: false, error: { code: "INVALID_SCENARIO" } });
    expect(() => decodeEngineResponse({ id: "request-3", ok: true, result: "python output" })).toThrow(/invalid scenario report/i);
  });
});
