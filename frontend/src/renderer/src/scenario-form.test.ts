// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createInitialScenarioValues, validateScenarioForm } from "./scenario-form";

describe("Simulation Lab validation", () => {
  it("converts the displayed synthetic sample into the typed engine payload", () => {
    const result = validateScenarioForm(createInitialScenarioValues());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.demand_kwh).toHaveLength(24);
    expect(result.payload.battery.capacity_kwh).toBe(10);
    expect(result.payload.currency).toBe("MYR");
  });

  it("allows negative tariffs but rejects invalid calendar dates and currency codes", () => {
    const values = createInitialScenarioValues();
    values.import_rate_per_kwh[0] = "-0.1";
    values.start_date = "2026-02-30";
    values.currency = "MY";
    const result = validateScenarioForm(values);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toContain("Choose a valid simulation date.");
    expect(result.errors).toContain("Currency must be a three-letter code such as MYR.");
    expect(result.errors.some((item) => item.includes("Import tariff at 00:00 MYT"))).toBe(false);
  });

  it("rejects inconsistent battery limits and non-finite values", () => {
    const values = createInitialScenarioValues();
    values.battery.max_soc_kwh = "11";
    values.battery.initial_soc_kwh = "Infinity";
    const result = validateScenarioForm(values);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toContain("Battery initial soc kwh must be a finite number.");
    expect(result.errors).toContain("Maximum battery charge cannot exceed battery capacity.");
  });

  it("rejects negative energy while accepting zero", () => {
    const values = createInitialScenarioValues();
    values.demand_kwh[1] = "-0.01";
    values.solar_generation_kwh[2] = "0";
    const result = validateScenarioForm(values);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toContain("Demand at 01:00 MYT must be at least 0.");
  });

  it("keeps Phase 2 defaults disabled and omits optional payload fields", () => {
    const values = createInitialScenarioValues();
    expect(values.battery_state_of_health).toBe("1");
    expect(values.grid).toEqual({ max_import_power_kw: "", max_export_power_kw: "" });
    expect(values.pv.enabled).toBe(false);
    expect(values.degradation_cost_per_kwh).toBe("0");

    const result = validateScenarioForm(values);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.grid).toBeUndefined();
    expect(result.payload.pv).toBeUndefined();
    expect(result.payload.ambient_temperature_c).toBeUndefined();
    expect(result.payload.solar_irradiance_w_m2).toBeUndefined();
    expect(result.payload.degradation_cost_per_kwh).toBeUndefined();
    expect(result.payload.battery.state_of_health).toBeUndefined();
  });

  it("treats blank grid limits as unlimited and accepts zero", () => {
    const values = createInitialScenarioValues();
    values.grid.max_import_power_kw = "  ";
    let result = validateScenarioForm(values);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.grid).toBeUndefined();

    values.grid.max_import_power_kw = "0";
    values.grid.max_export_power_kw = "0";
    result = validateScenarioForm(values);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.grid).toEqual({ max_import_power_kw: 0, max_export_power_kw: 0 });
  });

  it("rejects negative or non-finite grid limits", () => {
    const values = createInitialScenarioValues();
    values.grid.max_export_power_kw = "-1";
    let result = validateScenarioForm(values);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain("Grid maximum export power (kW) cannot be negative.");
    }

    values.grid.max_export_power_kw = "lots";
    result = validateScenarioForm(values);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain("Grid maximum export power (kW) must be a finite number or left blank for unlimited.");
    }
  });

  it("expands scalar PV weather to 24 hourly values and omits PV when disabled", () => {
    const values = createInitialScenarioValues();
    let result = validateScenarioForm(values);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.pv).toBeUndefined();

    values.pv.enabled = true;
    values.pv.ambient_temperature_c = "31.5";
    values.pv.solar_irradiance_w_m2 = "750";
    result = validateScenarioForm(values);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.pv).toEqual({
      reference_temperature_c: 25,
      noct_c: 45,
      temperature_coefficient_per_c: -0.004,
    });
    expect(result.payload.ambient_temperature_c).toEqual(Array(24).fill(31.5));
    expect(result.payload.solar_irradiance_w_m2).toEqual(Array(24).fill(750));
  });

  it("rejects invalid PV weather and positive temperature coefficients", () => {
    const values = createInitialScenarioValues();
    values.pv.enabled = true;
    values.pv.solar_irradiance_w_m2 = "-5";
    values.pv.temperature_coefficient_per_c = "0.01";
    const result = validateScenarioForm(values);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toContain("PV solar irradiance cannot be negative.");
    expect(result.errors).toContain("PV temperature coefficient must be zero or negative.");
  });

  it("validates state of health and maximum charge against usable capacity", () => {
    const values = createInitialScenarioValues();
    values.battery_state_of_health = "0.5";
    let result = validateScenarioForm(values);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain("Maximum battery charge cannot exceed usable battery capacity.");
    }

    values.battery.max_soc_kwh = "5";
    result = validateScenarioForm(values);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.battery.state_of_health).toBe(0.5);
    expect(result.payload.battery.max_soc_kwh).toBe(5);

    for (const invalid of ["0", "1.01", "-0.1"]) {
      values.battery_state_of_health = invalid;
      result = validateScenarioForm(values);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors).toContain("Battery state of health must be greater than 0 and at most 1.");
      }
    }
  });

  it("includes non-zero degradation costs and omits zero or blank values", () => {
    const values = createInitialScenarioValues();
    let result = validateScenarioForm(values);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.payload.degradation_cost_per_kwh).toBeUndefined();

    values.degradation_cost_per_kwh = "0.05";
    result = validateScenarioForm(values);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.payload.degradation_cost_per_kwh).toBe(0.05);

    values.degradation_cost_per_kwh = "0";
    result = validateScenarioForm(values);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.payload.degradation_cost_per_kwh).toBeUndefined();

    values.degradation_cost_per_kwh = "-0.01";
    result = validateScenarioForm(values);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain("Battery degradation cost cannot be negative.");
    }
  });
});
