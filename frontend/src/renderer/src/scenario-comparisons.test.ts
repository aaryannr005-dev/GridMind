import { beforeEach, describe, expect, it } from "vitest";
import type { GridMindScenarioReport } from "../../shared/protocol";
import { createInitialScenarioValues } from "./scenario-form";
import {
  appendScenarioComparison,
  COMPARISON_STORAGE_KEY,
  createScenarioComparison,
  deleteScenarioComparison,
  loadScenarioComparisons,
  MAX_SAVED_COMPARISONS,
  saveScenarioComparisons,
  type SavedScenarioComparison,
} from "./scenario-comparisons";

const metrics = {
  currency: "MYR", interval_count: 24, total_demand_kwh: 18, total_solar_generation_kwh: 12,
  direct_solar_consumption_kwh: 8, solar_to_battery_kwh: 2, solar_self_consumption_kwh: 10,
  solar_self_consumption_ratio: 0.83, grid_import_kwh: 5, grid_export_kwh: 2,
  battery_charge_kwh: 2, battery_discharge_kwh: 1, initial_soc_kwh: 4, final_soc_kwh: 4,
  import_cost: 2.4, export_credit: 0.1, net_cost: 2.3,
  energy_balance_valid: true, battery_constraints_valid: true, grid_constraints_valid: true,
  tariff_costs_valid: true, max_load_balance_error_kwh: 0, max_solar_balance_error_kwh: 0,
  max_soc_balance_error_kwh: 0,
};

const report = {
  scenario_fingerprint: "comparison-test-fingerprint",
  period_start: "2026-02-01T00:00:00+08:00",
  battery_capacity_kwh: 10,
  currency: "MYR",
  baseline: metrics,
  gridmind: { ...metrics, net_cost: 1.9 },
  comparison: { cost_savings: 0.4 },
} as GridMindScenarioReport;

beforeEach(() => window.localStorage.clear());

describe("scenario comparison storage", () => {
  it("creates a compact snapshot from real report metrics and normalizes its label", () => {
    const snapshot = createScenarioComparison(report, "custom", null, "  High   solar  ");
    expect(snapshot.name).toBe("High solar");
    expect(snapshot.baseline.netCost).toBe(2.3);
    expect(snapshot.gridmind?.netCost).toBe(1.9);
    expect(snapshot.costSavings).toBe(0.4);
    expect(snapshot.batteryCapacityKwh).toBe(10);
  });

  it("retains signed tariff assumptions and nullable self-consumption metrics", () => {
    const scenario = createInitialScenarioValues();
    scenario.import_rate_per_kwh = Array(24).fill("-0.05");
    scenario.export_rate_per_kwh = Array(24).fill("0.02");
    scenario.grid.max_import_power_kw = "2";
    scenario.grid.max_export_power_kw = "1";
    const snapshot = createScenarioComparison(report, "custom", scenario, "Negative tariff case");
    snapshot.gridmind!.solarSelfConsumptionRatio = null;
    expect(snapshot.averageImportTariff).toBeCloseTo(-0.05);
    expect(snapshot.averageExportTariff).toBeCloseTo(0.02);
    expect(snapshot.maxImportPowerKw).toBe(2);
    expect(snapshot.maxExportPowerKw).toBe(1);
    expect(saveScenarioComparisons([snapshot])).toBe(true);
    expect(loadScenarioComparisons()[0].gridmind?.solarSelfConsumptionRatio).toBeNull();
  });

  it("persists validated snapshots and ignores malformed stored entries", () => {
    const snapshot = createScenarioComparison(report, "synthetic", null, "Reference");
    expect(saveScenarioComparisons([snapshot])).toBe(true);
    const stored = JSON.parse(window.localStorage.getItem(COMPARISON_STORAGE_KEY) ?? "[]") as unknown[];
    stored.push({ id: "broken", name: "Broken" });
    window.localStorage.setItem(COMPARISON_STORAGE_KEY, JSON.stringify(stored));
    expect(loadScenarioComparisons().map((item) => item.name)).toEqual(["Reference"]);
  });

  it("keeps only the newest five snapshots and supports deletion", () => {
    const snapshots = Array.from({ length: MAX_SAVED_COMPARISONS + 2 }, (_, index) =>
      createScenarioComparison(report, "custom", null, "Scenario " + index));
    const capped = snapshots.reduce<SavedScenarioComparison[]>(appendScenarioComparison, []);
    expect(capped).toHaveLength(MAX_SAVED_COMPARISONS);
    expect(capped[0].name).toBe("Scenario 2");
    expect(deleteScenarioComparison(capped, capped[0].id)).toHaveLength(MAX_SAVED_COMPARISONS - 1);
  });
});
