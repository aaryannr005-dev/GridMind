import type { GridMindScenarioReport } from "../../shared/protocol";
import type { ScenarioFormValues } from "./scenario-form";

export const COMPARISON_STORAGE_KEY = "gridmind.scenario-comparisons.v1";
export const MAX_SAVED_COMPARISONS = 5;

export interface ComparisonMetrics {
  importCost: number;
  exportCredit: number;
  netCost: number;
  gridImportKwh: number;
  gridExportKwh: number;
  solarSelfConsumptionRatio: number;
  batteryChargeKwh: number;
  batteryDischargeKwh: number;
}

export interface SavedScenarioComparison {
  id: string;
  name: string;
  savedAt: string;
  source: "synthetic" | "custom";
  scenarioFingerprint: string;
  periodStart: string;
  currency: string;
  demandKwh: number;
  solarGenerationKwh: number;
  batteryCapacityKwh: number;
  batteryStateOfHealth: number;
  baseline: ComparisonMetrics;
  gridmind: ComparisonMetrics | null;
  costSavings: number | null;
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isMetrics(value: unknown): value is ComparisonMetrics {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return finite(item.importCost) && finite(item.exportCredit) && finite(item.netCost)
    && finite(item.gridImportKwh) && finite(item.gridExportKwh)
    && finite(item.solarSelfConsumptionRatio) && finite(item.batteryChargeKwh)
    && finite(item.batteryDischargeKwh);
}

export function isSavedScenarioComparison(value: unknown): value is SavedScenarioComparison {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === "string" && item.id.length > 0
    && typeof item.name === "string" && item.name.length > 0
    && typeof item.savedAt === "string"
    && (item.source === "synthetic" || item.source === "custom")
    && typeof item.scenarioFingerprint === "string"
    && typeof item.periodStart === "string"
    && typeof item.currency === "string"
    && finite(item.demandKwh) && item.demandKwh >= 0
    && finite(item.solarGenerationKwh) && item.solarGenerationKwh >= 0
    && finite(item.batteryCapacityKwh) && item.batteryCapacityKwh > 0
    && finite(item.batteryStateOfHealth) && item.batteryStateOfHealth > 0 && item.batteryStateOfHealth <= 1
    && isMetrics(item.baseline)
    && (item.gridmind === null || isMetrics(item.gridmind))
    && (item.costSavings === null || finite(item.costSavings));
}

export function loadScenarioComparisons(): SavedScenarioComparison[] {
  try {
    const raw = window.localStorage.getItem(COMPARISON_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isSavedScenarioComparison).slice(-MAX_SAVED_COMPARISONS);
  } catch {
    return [];
  }
}

export function saveScenarioComparisons(items: SavedScenarioComparison[]): boolean {
  try {
    window.localStorage.setItem(
      COMPARISON_STORAGE_KEY,
      JSON.stringify(items.filter(isSavedScenarioComparison).slice(-MAX_SAVED_COMPARISONS)),
    );
    return true;
  } catch {
    return false;
  }
}

function metricSnapshot(report: GridMindScenarioReport["baseline"]): ComparisonMetrics {
  return {
    importCost: report.import_cost,
    exportCredit: report.export_credit,
    netCost: report.net_cost,
    gridImportKwh: report.grid_import_kwh,
    gridExportKwh: report.grid_export_kwh,
    solarSelfConsumptionRatio: report.solar_self_consumption_ratio,
    batteryChargeKwh: report.battery_charge_kwh,
    batteryDischargeKwh: report.battery_discharge_kwh,
  };
}

export function createScenarioComparison(
  report: GridMindScenarioReport,
  source: "synthetic" | "custom",
  scenario: ScenarioFormValues | null,
  name: string,
): SavedScenarioComparison {
  const batteryCapacityKwh = Number(scenario?.battery.capacity_kwh ?? report.battery_capacity_kwh);
  const stateOfHealth = Number(scenario?.battery_state_of_health ?? 1);
  return {
    id: Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 9),
    name: name.trim().replace(/\s+/g, " ").slice(0, 36) || "Saved scenario",
    savedAt: new Date().toISOString(),
    source,
    scenarioFingerprint: report.scenario_fingerprint,
    periodStart: report.period_start,
    currency: report.currency,
    demandKwh: report.baseline.total_demand_kwh,
    solarGenerationKwh: report.baseline.total_solar_generation_kwh,
    batteryCapacityKwh: Number.isFinite(batteryCapacityKwh) && batteryCapacityKwh > 0
      ? batteryCapacityKwh : report.battery_capacity_kwh,
    batteryStateOfHealth: Number.isFinite(stateOfHealth) && stateOfHealth > 0 && stateOfHealth <= 1
      ? stateOfHealth : 1,
    baseline: metricSnapshot(report.baseline),
    gridmind: report.gridmind ? metricSnapshot(report.gridmind) : null,
    costSavings: report.comparison?.cost_savings ?? null,
  };
}

export function appendScenarioComparison(
  items: SavedScenarioComparison[],
  snapshot: SavedScenarioComparison,
): SavedScenarioComparison[] {
  return [...items.filter((item) => item.id !== snapshot.id), snapshot].slice(-MAX_SAVED_COMPARISONS);
}

export function deleteScenarioComparison(
  items: SavedScenarioComparison[],
  id: string,
): SavedScenarioComparison[] {
  return items.filter((item) => item.id !== id);
}
