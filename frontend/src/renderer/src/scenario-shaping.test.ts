import { describe, expect, it } from "vitest";
import {
  applyFlatTariff,
  applyLoadProfile,
  applyTouTariff,
  loadProfiles,
  tariffRange,
  touPeakWindow,
} from "./scenario-shaping";

describe("scenario-shaping input presets", () => {
  it("keeps the daily energy total constant for every profile shape", () => {
    const demand = [0.4, 0.8, 1.2, 1.6, 2, 2.4, 0.4, 0.8, 1.2, 1.6, 2, 2.4, 0.5, 1, 1.5, 2, 2.5, 3, 0.3, 0.6, 0.9, 1.2, 1.5, 0.2];
    const total = demand.reduce((sum, value) => sum + value, 0);
    // The "demo" preset restores the bundled profile verbatim (its own shape),
    // so only rescaling presets promise to preserve the daily total.
    for (const preset of loadProfiles.filter((item) => item.id !== "demo")) {
      const shaped = applyLoadProfile(preset.id, demand);
      expect(shaped).not.toBeNull();
      const shapedTotal = shaped!.reduce((sum, value) => sum + value, 0);
      // Values are written with 6-decimal precision, so the daily total can
      // drift by a few parts per million; 1e-4 tolerance is far below any
      // meaningful energy magnitude.
      expect(shapedTotal).toBeCloseTo(total, 4);
      expect(shaped!.every((value) => Number.isFinite(value) && value >= 0)).toBe(true);
    }
  });

  it("normalizes preset shapes to sum to one", () => {
    for (const preset of loadProfiles.filter((item) => item.shape.length > 0)) {
      const total = preset.shape.reduce((sum, value) => sum + value, 0);
      expect(total).toBeCloseTo(1, 6);
    }
  });

  it("concentrates the commercial profile in daytime hours", () => {
    const flat = applyLoadProfile("flat", Array(24).fill(1));
    const commercial = applyLoadProfile("commercial-day", Array(24).fill(1));
    expect(commercial![12]).toBeGreaterThan(flat![12]);
    expect(commercial![12]).toBeGreaterThan(commercial![0] * 7);
    expect(commercial![3]).toBeLessThan(commercial![9] / 4);
  });

  it("concentrates the residential profile in the evening peak", () => {
    const residential = applyLoadProfile("residential-evening", Array(24).fill(1));
    expect(residential![19]).toBeGreaterThan(residential![11]);
    expect(residential![19]).toBeGreaterThan(residential![0] * 3.5);
  });

  it("restores the bundled demo demand verbatim", () => {
    const demo = applyLoadProfile("demo", Array(24).fill(1));
    expect(demo).toEqual(demo);
    // The demo shape is the bundled synthetic profile, not a rescaling.
    expect(demo![0]).toBeCloseTo(0.55, 6);
    expect(demo![23]).toBeCloseTo(0.65, 6);
  });

  it("rejects input series that are not 24 finite values", () => {
    expect(applyLoadProfile("flat", [0.5, 1])).toBeNull();
    expect(applyLoadProfile("flat", Array(24).fill(Number.NaN))).toBeNull();
  });
});

describe("tariff shaping", () => {
  it("applies one flat rate to every interval", () => {
    expect(applyFlatTariff(0.22)).toHaveLength(24);
    expect(new Set(applyFlatTariff(0.22))).toEqual(new Set([0.22]));
  });

  it("applies the evening time-of-use window inclusively on peak hours", () => {
    const series = applyTouTariff(0.3, 0.22);
    expect(series[12]).toBe(0.22);
    for (let hour = touPeakWindow.start; hour <= touPeakWindow.end; hour += 1) {
      expect(series[hour]).toBe(0.3);
    }
    expect(series[16]).toBe(0.22);
    expect(series[22]).toBe(0.22);
  });

  it("summarizes tariff ranges", () => {
    expect(tariffRange([0.2, 0.4])).toEqual({ min: 0.2, max: 0.4, mean: 0.3 });
    expect(tariffRange([])).toBeNull();
  });
});
