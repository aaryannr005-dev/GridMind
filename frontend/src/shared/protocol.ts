export interface BatteryConfiguration {
  capacity_kwh: number;
  max_charge_power_kw: number;
  max_discharge_power_kw: number;
  charge_efficiency?: number;
  discharge_efficiency?: number;
  initial_soc_kwh?: number;
  min_soc_kwh?: number;
  max_soc_kwh?: number;
}

export interface RunHourlyScenarioPayload {
  start_date: string;
  demand_kwh: number[];
  solar_generation_kwh: number[];
  import_rate_per_kwh: number[];
  export_rate_per_kwh: number[];
  battery: BatteryConfiguration;
  currency?: string;
}

export interface RunHourlyScenarioRequest {
  operation: "run_hourly_scenario";
  payload: RunHourlyScenarioPayload;
}

export interface DesktopBridge {
  platform: string;
  runHourlyScenario(payload: RunHourlyScenarioPayload): Promise<GridMindScenarioReport>;
}

export interface EngineMetrics {
  currency: string;
  interval_count: number;
  total_demand_kwh: number;
  total_solar_generation_kwh: number;
  direct_solar_consumption_kwh: number;
  solar_to_battery_kwh: number;
  solar_self_consumption_kwh: number;
  solar_self_consumption_ratio: number | null;
  grid_import_kwh: number;
  grid_export_kwh: number;
  battery_charge_kwh: number;
  battery_discharge_kwh: number;
  initial_soc_kwh: number;
  final_soc_kwh: number;
  import_cost: number;
  export_credit: number;
  net_cost: number;
  energy_balance_valid: boolean;
  battery_constraints_valid: boolean;
  tariff_costs_valid: boolean;
  max_load_balance_error_kwh: number;
  max_solar_balance_error_kwh: number;
  max_soc_balance_error_kwh: number;
}

export interface EngineInterval {
  timestamp: string;
  demand_kwh: number;
  solar_generation_kwh: number;
  direct_solar_kwh: number;
  battery_charge_kwh: number;
  battery_discharge_kwh: number;
  grid_import_kwh: number;
  grid_export_kwh: number;
  state_of_charge_percent: number;
  import_cost: number;
  export_credit: number;
  net_cost: number;
  solar_curtailment_kwh: number;
  battery_charge_from_grid_kwh: number;
}

export interface EngineChart {
  title: string;
  description: string;
  svg: string;
}

export interface GridMindScenarioReport {
  scenario_fingerprint: string;
  period_start: string;
  period_end: string;
  interval_minutes: number;
  interval_count: number;
  duration_hours: number;
  currency: string;
  battery_capacity_kwh: number;
  baseline: EngineMetrics;
  gridmind: EngineMetrics | null;
  comparison: {
    baseline: EngineMetrics;
    optimized: EngineMetrics;
    cost_savings: number;
    cost_savings_percent: number | null;
    grid_import_reduction_kwh: number;
    grid_import_reduction_percent: number | null;
    solar_self_consumption_change_kwh: number;
    solar_self_consumption_change_percent: number | null;
    solar_export_change_kwh: number;
    solar_export_change_percent: number | null;
    battery_charge_change_kwh: number;
    battery_charge_change_percent: number | null;
    battery_discharge_change_kwh: number;
    battery_discharge_change_percent: number | null;
  } | null;
  baseline_intervals: EngineInterval[];
  gridmind_intervals: EngineInterval[] | null;
  baseline_hourly: unknown[] | null;
  gridmind_hourly: unknown[] | null;
  comparison_rows: unknown[];
  assumptions: string[];
  limitations: string[];
  charts: EngineChart[];
}

export type EngineSuccess = {
  id: string;
  ok: true;
  result: GridMindScenarioReport;
};

export type EngineFailure = {
  id: string | null;
  ok: false;
  error: { code: string; message: string };
};

export type EngineResponse = EngineSuccess | EngineFailure;

const batteryKeys = new Set([
  "capacity_kwh",
  "max_charge_power_kw",
  "max_discharge_power_kw",
  "charge_efficiency",
  "discharge_efficiency",
  "initial_soc_kwh",
  "min_soc_kwh",
  "max_soc_kwh",
]);

const requiredBatteryKeys = ["capacity_kwh", "max_charge_power_kw", "max_discharge_power_kw"] as const;
const arrayKeys = ["demand_kwh", "solar_generation_kwh", "import_rate_per_kwh", "export_rate_per_kwh"] as const;
const payloadKeys = new Set([
  "start_date",
  ...arrayKeys,
  "battery",
  "currency",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: Set<string>): boolean {
  return Object.keys(value).every((key) => allowed.has(key));
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function isRunHourlyScenarioPayload(value: unknown): value is RunHourlyScenarioPayload {
  if (!isRecord(value) || !hasOnlyKeys(value, payloadKeys)) return false;
  if (typeof value.start_date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value.start_date)) return false;
  if (value.currency !== undefined && typeof value.currency !== "string") return false;

  for (const key of arrayKeys) {
    const values = value[key];
    if (!Array.isArray(values) || values.length !== 24 || !values.every(isFiniteNumber)) return false;
  }

  const battery = value.battery;
  if (!isRecord(battery) || !hasOnlyKeys(battery, batteryKeys)) return false;
  if (!requiredBatteryKeys.every((key) => isFiniteNumber(battery[key]))) return false;
  return Object.entries(battery).every(([, item]) => isFiniteNumber(item));
}

export function isGridMindScenarioReport(value: unknown): value is GridMindScenarioReport {
  if (!isRecord(value)) return false;
  const finiteFields = (record: Record<string, unknown>, keys: readonly string[]) =>
    keys.every((key) => isFiniteNumber(record[key]));
  const nullableFiniteFields = (record: Record<string, unknown>, keys: readonly string[]) =>
    keys.every((key) => record[key] === null || isFiniteNumber(record[key]));
  const isMetrics = (metrics: unknown): metrics is EngineMetrics => {
    if (!isRecord(metrics)) return false;
    return typeof metrics.currency === "string"
      && isFiniteNumber(metrics.interval_count)
      && Number.isInteger(metrics.interval_count)
      && metrics.interval_count > 0
      && finiteFields(metrics, [
        "total_demand_kwh", "total_solar_generation_kwh", "direct_solar_consumption_kwh",
        "solar_to_battery_kwh", "solar_self_consumption_kwh", "grid_import_kwh", "grid_export_kwh",
        "battery_charge_kwh", "battery_discharge_kwh", "initial_soc_kwh", "final_soc_kwh",
        "import_cost", "export_credit", "net_cost", "max_load_balance_error_kwh",
        "max_solar_balance_error_kwh", "max_soc_balance_error_kwh",
      ])
      && nullableFiniteFields(metrics, ["solar_self_consumption_ratio"])
      && ["energy_balance_valid", "battery_constraints_valid", "tariff_costs_valid"]
        .every((key) => typeof metrics[key] === "boolean");
  };
  const isInterval = (interval: unknown): interval is EngineInterval => {
    if (!isRecord(interval)) return false;
    return typeof interval.timestamp === "string"
      && finiteFields(interval, [
        "demand_kwh", "solar_generation_kwh", "direct_solar_kwh", "battery_charge_kwh",
        "battery_discharge_kwh", "grid_import_kwh", "grid_export_kwh", "state_of_charge_percent",
        "import_cost", "export_credit", "net_cost", "solar_curtailment_kwh", "battery_charge_from_grid_kwh",
      ]);
  };
  const isComparison = (comparison: unknown): comparison is NonNullable<GridMindScenarioReport["comparison"]> => {
    if (!isRecord(comparison)) return false;
    return isMetrics(comparison.baseline)
      && isMetrics(comparison.optimized)
      && finiteFields(comparison, [
        "cost_savings", "grid_import_reduction_kwh", "solar_self_consumption_change_kwh",
        "solar_export_change_kwh", "battery_charge_change_kwh", "battery_discharge_change_kwh",
      ])
      && nullableFiniteFields(comparison, [
        "cost_savings_percent", "grid_import_reduction_percent", "solar_self_consumption_change_percent",
        "solar_export_change_percent", "battery_charge_change_percent", "battery_discharge_change_percent",
      ]);
  };
  if (typeof value.scenario_fingerprint !== "string"
    || typeof value.period_start !== "string"
    || typeof value.period_end !== "string"
    || typeof value.currency !== "string"
    || !isFiniteNumber(value.interval_minutes) || value.interval_minutes <= 0
    || !isFiniteNumber(value.interval_count) || !Number.isInteger(value.interval_count) || value.interval_count <= 0
    || !isFiniteNumber(value.duration_hours) || value.duration_hours <= 0
    || !isFiniteNumber(value.battery_capacity_kwh) || value.battery_capacity_kwh <= 0
    || !isMetrics(value.baseline)
    || (value.gridmind !== null && !isMetrics(value.gridmind))
    || (value.comparison !== null && !isComparison(value.comparison))
    || !Array.isArray(value.baseline_intervals) || !value.baseline_intervals.every(isInterval)
    || value.baseline_intervals.length !== value.interval_count
    || (value.gridmind_intervals !== null && (!Array.isArray(value.gridmind_intervals)
      || !value.gridmind_intervals.every(isInterval) || value.gridmind_intervals.length !== value.interval_count))
    || (value.baseline_hourly !== null && !Array.isArray(value.baseline_hourly))
    || (value.gridmind_hourly !== null && !Array.isArray(value.gridmind_hourly))
    || !Array.isArray(value.comparison_rows)
    || !Array.isArray(value.assumptions) || !value.assumptions.every((item) => typeof item === "string")
    || !Array.isArray(value.limitations) || !value.limitations.every((item) => typeof item === "string")
    || !Array.isArray(value.charts)
    || !value.charts.every((chart) => isRecord(chart)
      && typeof chart.title === "string"
      && typeof chart.description === "string"
      && typeof chart.svg === "string")) return false;

  return true;
}

export function decodeEngineResponse(value: unknown): EngineResponse {
  if (!isRecord(value) || typeof value.ok !== "boolean") {
    throw new Error("The engine returned a malformed response");
  }
  if (value.ok) {
    if (typeof value.id !== "string" || !isGridMindScenarioReport(value.result)) {
      throw new Error("The engine returned an invalid scenario report");
    }
    return value as unknown as EngineSuccess;
  }
  if ((value.id !== null && typeof value.id !== "string") || !isRecord(value.error)
    || typeof value.error.code !== "string" || typeof value.error.message !== "string") {
    throw new Error("The engine returned a malformed error response");
  }
  return value as unknown as EngineFailure;
}
