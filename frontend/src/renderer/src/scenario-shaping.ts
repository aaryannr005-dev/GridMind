/**
 * Input-shaping helpers for the control rail.
 *
 * These functions reshape scenario INPUT series (demand, tariffs) before they
 * are sent to the real Python engine. They never fabricate simulation output:
 * a shaped input only changes what the engine is asked to simulate.
 */

import { demoScenario } from "./demo-scenario";

export type LoadProfileId =
  | "demo"
  | "residential-evening"
  | "commercial-day"
  | "industrial-base"
  | "flat";

export interface LoadProfilePreset {
  id: LoadProfileId;
  label: string;
  /** Shown under the preset name so the shape is never ambiguous. */
  description: string;
  /** Relative share of each interval; normalized to sum to 1 before use. */
  shape: number[];
}

const residentialShape = [
  0.020, 0.020, 0.020, 0.020, 0.020, 0.030, 0.055, 0.065, 0.055, 0.045,
  0.040, 0.040, 0.045, 0.040, 0.040, 0.045, 0.040, 0.060, 0.075, 0.085,
  0.070, 0.038, 0.017, 0.015,
];

const commercialShape = [
  0.010, 0.010, 0.010, 0.010, 0.010, 0.015, 0.020, 0.045, 0.070, 0.080,
  0.080, 0.080, 0.075, 0.080, 0.080, 0.078, 0.078, 0.052, 0.034, 0.024,
  0.019, 0.016, 0.014, 0.010,
];

const industrialShape = [
  0.038, 0.038, 0.038, 0.038, 0.038, 0.038, 0.038, 0.049, 0.049, 0.049,
  0.049, 0.049, 0.049, 0.049, 0.049, 0.038, 0.038, 0.038, 0.038, 0.038,
  0.038, 0.038, 0.038, 0.038,
];

export const loadProfiles: LoadProfilePreset[] = [
  {
    id: "demo",
    label: "Demo house",
    description: "Morning routine plus a strong evening peak (the bundled example).",
    shape: [],
  },
  {
    id: "residential-evening",
    label: "Residential, evening peak",
    description: "Morning bump and a dominant 18:00–21:00 peak after sunset.",
    shape: residentialShape,
  },
  {
    id: "commercial-day",
    label: "Commercial, daytime",
    description: "Load concentrated between 08:00 and 17:00, low overnight.",
    shape: commercialShape,
  },
  {
    id: "industrial-base",
    label: "Industrial, base load",
    description: "Nearly flat high base load around the clock.",
    shape: industrialShape,
  },
  {
    id: "flat",
    label: "Flat, even",
    description: "Daily energy spread evenly across all 24 intervals.",
    shape: Array(24).fill(1 / 24),
  },
];

function normalize(shape: number[]): number[] {
  const total = shape.reduce((sum, value) => sum + value, 0);
  return shape.map((value) => value / total);
}

function round6(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

/**
 * Reshape a demand series so its interval distribution follows the preset
 * while keeping the daily total identical. Returns null when the input series
 * is not 24 finite values.
 */
export function applyLoadProfile(
  id: LoadProfileId,
  demand: number[],
): number[] | null {
  if (demand.length !== 24 || !demand.every((value) => Number.isFinite(value))) {
    return null;
  }
  const preset = loadProfiles.find((item) => item.id === id);
  if (!preset) return null;
  const dailyTotal = demand.reduce((sum, value) => sum + value, 0);
  if (id === "demo") {
    // The synthetic example IS its own golden shape; restore it verbatim.
    return demoScenario.demand_kwh.map(round6);
  }
  const shape = normalize(preset.shape);
  return shape.map((share) => round6(share * dailyTotal));
}

/** Overwrite every interval with one flat rate. */
export function applyFlatTariff(rate: number, count = 24): number[] {
  if (!Number.isFinite(rate) || count <= 0) return [];
  return Array.from({ length: count }, () => round6(rate));
}

/** Peak hours of the bundled time-of-use example, inclusive. */
export const touPeakWindow = { start: 17, end: 21 } as const;

/** Evening time-of-use pattern: `peak` inside the window, off-peak elsewhere. */
export function applyTouTariff(peak: number, offPeak: number, count = 24): number[] {
  if (!Number.isFinite(peak) || !Number.isFinite(offPeak) || count <= 0) return [];
  return Array.from({ length: count }, (_, hour) =>
    round6(hour >= touPeakWindow.start && hour <= touPeakWindow.end ? peak : offPeak),
  );
}

/** Range summary of a tariff series for compact readouts. */
export function tariffRange(values: number[]): { min: number; max: number; mean: number } | null {
  if (values.length === 0 || !values.every((value) => Number.isFinite(value))) return null;
  const min = values.reduce((a, b) => Math.min(a, b), values[0]);
  const max = values.reduce((a, b) => Math.max(a, b), values[0]);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return { min: round6(min), max: round6(max), mean: round6(mean) };
}
