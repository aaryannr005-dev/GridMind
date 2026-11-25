import type { EngineMetrics, GridMindScenarioReport } from "../../shared/protocol";

const STORAGE_KEY = "gridmind.saved-scenarios.v1";
export const MAX_SAVED_SCENARIOS = 8;

export interface SavedScenarioMetrics {\n  total_demand_kwh: number;\n  total_solar_generation_kwh: number;\n  solar_self_consumption_ratio: number | null;\n  grid_import_kwh: number;\n  grid_export_kwh: number;\n  battery_charge_kwh: number;\n  battery_discharge_kwh: number;\n  import_cost: number;\n  export_credit: number;\n  net_cost: number;\n}\n\nexport interface SavedScenario {
  id: string;
  name: string;
  saved_at: string;
  scenario_fingerprint: string;
  period_start: string;
  period_end: string;
  interval_minutes: number;
  interval_count: number;
  currency: string;
  baseline: Pick<EngineMetrics,
    "total_demand_kwh" | "total_solar_generation_kwh" | "solar_self_consumption_ratio"
    | "grid_import_kwh" | "grid_export_kwh" | "battery_charge_kwh"
    | "battery_discharge_kwh" | "import_cost" | "export_credit" | "net_cost">;
  gridmind: SavedScenario["baseline"] | null;
  cost_savings: number | null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isMetrics(value: unknown): value is SavedScenario["baseline"] {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return ["total_demand_kwh", "total_solar_generation_kwh", "grid_import_kwh", "grid_export_kwh",
    "battery_charge_kwh", "battery_discharge_kwh", "import_cost", "export_credit", "net_cost"]
    .every((key) => isFiniteNumber(item[key]))
    && (item.solar_self_consumption_ratio === null || isFiniteNumber(item.solar_self_consumption_ratio));
}

function isSavedScenario(value: unknown): value is SavedScenario {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === "string" && typeof item.name === "string"
    && typeof item.saved_at === "string" && typeof item.scenario_fingerprint === "string"
    && typeof item.period_start === "string" && typeof item.period_end === "string"
    && typeof item.currency === "string" && isFiniteNumber(item.interval_minutes)
    && isFiniteNumber(item.interval_count) && isMetrics(item.baseline)
    && (item.gridmind === null || isMetrics(item.gridmind))
    && (item.cost_savings === null || isFiniteNumber(item.cost_savings));
}

export function loadSavedScenarios(): SavedScenario[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isSavedScenario).slice(0, MAX_SAVED_SCENARIOS);
  } catch {
    return [];
  }
}

export function saveScenario(report: GridMindScenarioReport, name: string): SavedScenario[] {
  const normalizedName = name.trim().replace(/\\s+/g, " ").slice(0, 48);
  if (!normalizedName) throw new Error("Enter a name for this comparison case.");
  const current = loadSavedScenarios();
  if (current.length >= MAX_SAVED_SCENARIOS) {
    throw new Error("The comparison library is full. Remove a saved case before adding another.");
  }
  const pickMetrics = (metrics: EngineMetrics): SavedScenario["baseline"] => ({
    total_demand_kwh: metrics.total_demand_kwh,
    total_solar_generation_kwh: metrics.total_solar_generation_kwh,
    solar_self_consumption_ratio: metrics.solar_self_consumption_ratio,
    grid_import_kwh: metrics.grid_import_kwh,
    grid_export_kwh: metrics.grid_export_kwh,
    battery_charge_kwh: metrics.battery_charge_kwh,
    battery_discharge_kwh: metrics.battery_discharge_kwh,
    import_cost: metrics.import_cost,
    export_credit: metrics.export_credit,
    net_cost: metrics.net_cost,
  });
  const saved: SavedScenario = {
    id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now()) + "-" + String(current.length),
    name: normalizedName,
    saved_at: new Date().toISOString(),
    scenario_fingerprint: report.scenario_fingerprint,
    period_start: report.period_start,
    period_end: report.period_end,
    interval_minutes: report.interval_minutes,
    interval_count: report.interval_count,
    currency: report.currency,
    baseline: pickMetrics(report.baseline),
    gridmind: report.gridmind ? pickMetrics(report.gridmind) : null,
    cost_savings: report.comparison?.cost_savings ?? null,
  };
  const next = [saved, ...current];
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    throw new Error("The browser could not save this case. Check available local storage.");
  }
  return next;
}

export function removeSavedScenario(id: string): SavedScenario[] {
  const next = loadSavedScenarios().filter((item) => item.id !== id);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    throw new Error("The comparison library could not be updated.");
  }
  return next;
}
