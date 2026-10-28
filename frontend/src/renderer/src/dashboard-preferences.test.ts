// @vitest-environment node
import { describe, expect, it } from "vitest";
import { DEFAULT_DASHBOARD_PREFERENCES, parseDashboardPreferences } from "./dashboard-preferences";

describe("dashboard preference parsing", () => {
  it("returns all sections enabled for missing or malformed values", () => {
    expect(parseDashboardPreferences(null)).toEqual(DEFAULT_DASHBOARD_PREFERENCES);
    expect(parseDashboardPreferences("bad data")).toEqual(DEFAULT_DASHBOARD_PREFERENCES);
  });

  it("keeps valid saved switches and defaults missing fields", () => {
    expect(parseDashboardPreferences({ showCharts: false, showMetrics: false, extra: true })).toEqual({
      showMetrics: false, showCharts: false, showComparison: true, showAssumptions: true,
    });
  });
});
