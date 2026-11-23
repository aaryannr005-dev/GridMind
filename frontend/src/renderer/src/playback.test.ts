import { describe, expect, it } from "vitest";
import { clampPlayhead, formatClock, formatDate, stepPlayhead } from "./playback";

describe("playback cursor helpers", () => {
  it("extracts clock and date from engine timestamps", () => {
    expect(formatClock("2026-01-15T07:30:00+08:00")).toBe("07:30");
    expect(formatDate("2026-01-15T07:30:00+08:00")).toBe("2026-01-15");
    expect(formatClock("not-a-timestamp")).toBeNull();
    expect(formatDate("not-a-timestamp")).toBeNull();
  });

  it("steps forward from the summary state into the first interval", () => {
    expect(stepPlayhead(null, 24, 1)).toBe(0);
  });

  it("steps backward from the summary state into the last interval", () => {
    expect(stepPlayhead(null, 24, -1)).toBe(23);
  });

  it("wraps around both ends of the series", () => {
    expect(stepPlayhead(0, 24, -1)).toBe(23);
    expect(stepPlayhead(23, 24, 1)).toBe(0);
  });

  it("keeps a null cursor when the series is empty", () => {
    expect(stepPlayhead(null, 0, 1)).toBeNull();
  });

  it("clamps stale cursors from a previous run", () => {
    expect(clampPlayhead(3, 24)).toBe(3);
    expect(clampPlayhead(99, 24)).toBe(23);
    expect(clampPlayhead(-2, 24)).toBe(0);
    expect(clampPlayhead(null, 24)).toBeNull();
  });
});
