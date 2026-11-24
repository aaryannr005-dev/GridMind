// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  decodeEngineResponse,
  isRunHourlyScenarioPayload,
  type RunHourlyScenarioPayload,
} from "./protocol";
import { validScenarioReport } from "./protocol.fixtures";

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

  it("accepts valid Phase 2 grid, PV, weather, SoH and degradation fields", () => {
    const payload: RunHourlyScenarioPayload = {
      ...validPayload(),
      battery: { ...validPayload().battery, state_of_health: 0.8 },
      grid: { max_import_power_kw: 5, max_export_power_kw: 0 },
      pv: { reference_temperature_c: 25, noct_c: 45, temperature_coefficient_per_c: -0.004 },
      ambient_temperature_c: Array(24).fill(30),
      solar_irradiance_w_m2: Array(24).fill(800),
      degradation_cost_per_kwh: 0.02,
    };
    expect(isRunHourlyScenarioPayload(payload)).toBe(true);
    expect(isRunHourlyScenarioPayload({ ...validPayload(), grid: { max_import_power_kw: null } })).toBe(true);
    expect(isRunHourlyScenarioPayload({
      ...validPayload(),
      battery: { ...validPayload().battery, state_of_health: 1 },
    })).toBe(true);
    expect(isRunHourlyScenarioPayload({ ...validPayload(), degradation_cost_per_kwh: 0 })).toBe(true);
  });

  it("rejects malformed grid, PV and weather payloads", () => {
    const base = validPayload();
    expect(isRunHourlyScenarioPayload({ ...base, grid: { max_import_power_kw: -1 } })).toBe(false);
    expect(isRunHourlyScenarioPayload({ ...base, grid: { max_import_power_kw: Number.NaN } })).toBe(false);
    expect(isRunHourlyScenarioPayload({ ...base, grid: { max_import_power_kw: "5" } })).toBe(false);
    expect(isRunHourlyScenarioPayload({ ...base, grid: { max_import_power_kw: 5, tariff: 1 } })).toBe(false);
    expect(isRunHourlyScenarioPayload({ ...base, pv: { noct_c: 45, unexpected: 1 } })).toBe(false);
    expect(isRunHourlyScenarioPayload({ ...base, pv: { temperature_coefficient_per_c: 0.01 } })).toBe(false);
    expect(isRunHourlyScenarioPayload({ ...base, pv: { noct_c: "45" } })).toBe(false);
    expect(isRunHourlyScenarioPayload({ ...base, pv: { noct_c: 45 } })).toBe(false);
    expect(isRunHourlyScenarioPayload({ ...base, ambient_temperature_c: Array(24).fill(30) })).toBe(false);
    expect(isRunHourlyScenarioPayload({
      ...base,
      pv: {},
      ambient_temperature_c: Array(23).fill(30),
      solar_irradiance_w_m2: Array(24).fill(800),
    })).toBe(false);
    expect(isRunHourlyScenarioPayload({
      ...base,
      pv: {},
      ambient_temperature_c: Array(24).fill(30),
      solar_irradiance_w_m2: Array(24).fill(-1),
    })).toBe(false);
    expect(isRunHourlyScenarioPayload({
      ...base,
      pv: {},
      ambient_temperature_c: Array(24).fill(30),
      solar_irradiance_w_m2: [Number.NaN, ...Array(23).fill(800)],
    })).toBe(false);
  });

  it("rejects invalid state of health and degradation costs", () => {
    for (const state_of_health of [0, -0.1, 1.1, Number.NaN, "0.9"]) {
      expect(isRunHourlyScenarioPayload({
        ...validPayload(),
        battery: { ...validPayload().battery, state_of_health },
      })).toBe(false);
    }
    for (const degradation_cost_per_kwh of [-0.01, Number.NaN, "0.02"]) {
      expect(isRunHourlyScenarioPayload({ ...validPayload(), degradation_cost_per_kwh })).toBe(false);
    }
  });

  it("decodes only structured engine success and failure messages", () => {
    expect(decodeEngineResponse({ id: "request-1", ok: true, result: validScenarioReport() })).toMatchObject({
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

  it("rejects incomplete reports and malformed nested interval values", () => {
    const incomplete = { scenario_fingerprint: "fingerprint", baseline: {}, baseline_intervals: [], charts: [] };
    const malformed = structuredClone(validScenarioReport()) as unknown as Record<string, unknown>;
    const intervals = malformed.baseline_intervals as Record<string, unknown>[];
    intervals[0].state_of_charge_percent = "not-a-number";
    expect(() => decodeEngineResponse({ id: "request-4", ok: true, result: incomplete })).toThrow(/invalid scenario report/i);
    expect(() => decodeEngineResponse({ id: "request-5", ok: true, result: malformed })).toThrow(/invalid scenario report/i);
  });
});
