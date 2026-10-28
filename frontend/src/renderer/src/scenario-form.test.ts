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
});
