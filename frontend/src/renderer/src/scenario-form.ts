import type { BatteryConfiguration, RunHourlyScenarioPayload } from "../../shared/protocol";
import { demoScenario } from "./demo-scenario";

export type ScenarioSeriesKey = "demand_kwh" | "solar_generation_kwh" | "import_rate_per_kwh" | "export_rate_per_kwh";
export type BatteryFormKey = "capacity_kwh" | "max_charge_power_kw" | "max_discharge_power_kw"
  | "charge_efficiency" | "discharge_efficiency" | "initial_soc_kwh" | "min_soc_kwh" | "max_soc_kwh";

export interface ScenarioFormValues {
  start_date: string;
  currency: string;
  demand_kwh: string[];
  solar_generation_kwh: string[];
  import_rate_per_kwh: string[];
  export_rate_per_kwh: string[];
  battery: Record<BatteryFormKey, string>;
}

export type ScenarioFormValidation =
  | { ok: true; payload: RunHourlyScenarioPayload }
  | { ok: false; errors: string[] };

export function createInitialScenarioValues(): ScenarioFormValues {
  return {
    start_date: demoScenario.start_date,
    currency: demoScenario.currency ?? "MYR",
    demand_kwh: demoScenario.demand_kwh.map(String),
    solar_generation_kwh: demoScenario.solar_generation_kwh.map(String),
    import_rate_per_kwh: demoScenario.import_rate_per_kwh.map(String),
    export_rate_per_kwh: demoScenario.export_rate_per_kwh.map(String),
    battery: {
      capacity_kwh: String(demoScenario.battery.capacity_kwh),
      max_charge_power_kw: String(demoScenario.battery.max_charge_power_kw),
      max_discharge_power_kw: String(demoScenario.battery.max_discharge_power_kw),
      charge_efficiency: String(demoScenario.battery.charge_efficiency),
      discharge_efficiency: String(demoScenario.battery.discharge_efficiency),
      initial_soc_kwh: String(demoScenario.battery.initial_soc_kwh),
      min_soc_kwh: String(demoScenario.battery.min_soc_kwh),
      max_soc_kwh: String(demoScenario.battery.max_soc_kwh),
    },
  };
}

function isCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  return day <= daysInMonth;
}

function readNumber(value: string, field: string, errors: string[]): number | null {
  if (!value.trim()) {
    errors.push(field + " is required.");
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    errors.push(field + " must be a finite number.");
    return null;
  }
  return parsed;
}

function readSeries(
  values: string[],
  name: string,
  minimum: number | null,
  errors: string[],
): number[] | null {
  if (values.length !== 24) {
    errors.push(name + " must have exactly 24 hourly values.");
    return null;
  }
  const result: number[] = [];
  values.forEach((value, index) => {
    const label = name + " at " + index.toString().padStart(2, "0") + ":00 MYT";
    const parsed = readNumber(value, label, errors);
    if (parsed === null) return;
    if (minimum !== null && parsed < minimum) {
      errors.push(label + " must be at least " + minimum + ".");
      return;
    }
    result.push(parsed);
  });
  return result.length === 24 ? result : null;
}

export function validateScenarioForm(values: ScenarioFormValues): ScenarioFormValidation {
  const errors: string[] = [];
  if (!isCalendarDate(values.start_date)) errors.push("Choose a valid simulation date.");
  const currency = values.currency.trim();
  if (!/^[A-Za-z]{3}$/.test(currency)) errors.push("Currency must be a three-letter code such as MYR.");

  const demand = readSeries(values.demand_kwh, "Demand", 0, errors);
  const solar = readSeries(values.solar_generation_kwh, "Solar generation", 0, errors);
  const importRates = readSeries(values.import_rate_per_kwh, "Import tariff", null, errors);
  const exportRates = readSeries(values.export_rate_per_kwh, "Export credit", null, errors);

  const batteryValues = {} as Record<BatteryFormKey, number>;
  const batteryFields: BatteryFormKey[] = [
    "capacity_kwh", "max_charge_power_kw", "max_discharge_power_kw",
    "charge_efficiency", "discharge_efficiency", "initial_soc_kwh", "min_soc_kwh", "max_soc_kwh",
  ];
  for (const key of batteryFields) {
    const parsed = readNumber(values.battery[key], "Battery " + key.replaceAll("_", " "), errors);
    if (parsed !== null) batteryValues[key] = parsed;
  }
  if (Number.isFinite(batteryValues.capacity_kwh) && batteryValues.capacity_kwh <= 0) {
    errors.push("Battery capacity must be greater than zero.");
  }
  for (const key of ["max_charge_power_kw", "max_discharge_power_kw", "min_soc_kwh", "max_soc_kwh", "initial_soc_kwh"] as const) {
    if (Number.isFinite(batteryValues[key]) && batteryValues[key] < 0) errors.push("Battery " + key.replaceAll("_", " ") + " cannot be negative.");
  }
  for (const key of ["charge_efficiency", "discharge_efficiency"] as const) {
    if (Number.isFinite(batteryValues[key]) && (batteryValues[key] <= 0 || batteryValues[key] > 1)) {
      errors.push("Battery " + key.replaceAll("_", " ") + " must be greater than 0 and at most 1.");
    }
  }
  if (Number.isFinite(batteryValues.min_soc_kwh) && Number.isFinite(batteryValues.max_soc_kwh)
    && batteryValues.min_soc_kwh > batteryValues.max_soc_kwh) {
    errors.push("Minimum battery charge cannot exceed maximum charge.");
  }
  if (Number.isFinite(batteryValues.capacity_kwh) && Number.isFinite(batteryValues.max_soc_kwh)
    && batteryValues.max_soc_kwh > batteryValues.capacity_kwh) {
    errors.push("Maximum battery charge cannot exceed battery capacity.");
  }
  if (Number.isFinite(batteryValues.initial_soc_kwh) && Number.isFinite(batteryValues.min_soc_kwh)
    && batteryValues.initial_soc_kwh < batteryValues.min_soc_kwh) {
    errors.push("Starting battery charge cannot be below minimum charge.");
  }
  if (Number.isFinite(batteryValues.initial_soc_kwh) && Number.isFinite(batteryValues.max_soc_kwh)
    && batteryValues.initial_soc_kwh > batteryValues.max_soc_kwh) {
    errors.push("Starting battery charge cannot exceed maximum charge.");
  }

  if (errors.length || !demand || !solar || !importRates || !exportRates) return { ok: false, errors };
  const battery: BatteryConfiguration = {
    capacity_kwh: batteryValues.capacity_kwh,
    max_charge_power_kw: batteryValues.max_charge_power_kw,
    max_discharge_power_kw: batteryValues.max_discharge_power_kw,
    charge_efficiency: batteryValues.charge_efficiency,
    discharge_efficiency: batteryValues.discharge_efficiency,
    initial_soc_kwh: batteryValues.initial_soc_kwh,
    min_soc_kwh: batteryValues.min_soc_kwh,
    max_soc_kwh: batteryValues.max_soc_kwh,
  };
  return {
    ok: true,
    payload: {
      start_date: values.start_date,
      currency: currency.toUpperCase(),
      demand_kwh: demand,
      solar_generation_kwh: solar,
      import_rate_per_kwh: importRates,
      export_rate_per_kwh: exportRates,
      battery,
    },
  };
}
