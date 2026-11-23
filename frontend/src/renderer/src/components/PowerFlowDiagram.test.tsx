import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { EngineInterval } from "../../../shared/protocol";
import { computeFlowView, PowerFlowDiagram } from "./PowerFlowDiagram";

function interval(overrides: Partial<EngineInterval> = {}): EngineInterval {
  return {
    timestamp: "2026-01-15T13:00:00+08:00",
    demand_kwh: 0.7,
    solar_generation_kwh: 1.4,
    direct_solar_kwh: 0.5,
    battery_charge_kwh: 0.4,
    battery_discharge_kwh: 0,
    grid_import_kwh: 0,
    grid_export_kwh: 0.3,
    state_of_charge_percent: 65,
    import_cost: 0,
    export_credit: 0.015,
    net_cost: -0.015,
    solar_curtailment_kwh: 0,
    battery_charge_from_grid_kwh: 0,
    ...overrides,
  };
}

afterEach(cleanup);

describe("PowerFlowDiagram", () => {
  it("derives topology-facing kW values from one engine interval", () => {
    const view = computeFlowView([interval()], 60, 0);
    expect(view).toEqual({
      solarKw: 1.4,
      loadKw: 0.7,
      batteryKw: 0.4,
      gridKw: -0.3,
      soc: 65,
      modeLabel: "INTERVAL",
      clockLabel: "13:00",
    });
  });

  it("computes honest period averages with 60-minute intervals", () => {
    const intervals = [
      interval(),
      interval({ solar_generation_kwh: 2.6, demand_kwh: 2.1, battery_charge_kwh: 0.2, battery_discharge_kwh: 0.8, grid_import_kwh: 0.5, grid_export_kwh: 0, timestamp: "2026-01-15T14:00:00+08:00" }),
    ];
    const view = computeFlowView(intervals, 60, null);
    expect(view).not.toBeNull();
    expect(view!.solarKw).toBeCloseTo(2, 9);
    expect(view!.loadKw).toBeCloseTo(1.4, 9);
    expect(view!.batteryKw).toBeCloseTo(-0.1, 9);
    expect(view!.gridKw).toBeCloseTo(0.1, 9);
    expect(view!.modeLabel).toBe("PERIOD AVERAGE");
    expect(view!.clockLabel).toBeNull();
  });

  it("returns null for missing data instead of showing a diagram", () => {
    expect(computeFlowView([], 60, 0)).toBeNull();
    expect(computeFlowView([interval()], 0, 0)).toBeNull();
  });

  it("renders every recorded value in the accessible diagram label", () => {
    const second = interval({
      timestamp: "2026-01-15T14:00:00+08:00",
      solar_generation_kwh: 2.6,
      demand_kwh: 2.1,
      battery_charge_kwh: 0.2,
      battery_discharge_kwh: 0.8,
      grid_import_kwh: 0.5,
      grid_export_kwh: 0,
    });
    const { getByRole } = render(
      <PowerFlowDiagram intervals={[interval(), second]} intervalMinutes={60} playhead={1} playing={false} />,
    );
    const label = getByRole("img").getAttribute("aria-label") ?? "";
    expect(label).toContain("14:00");
    expect(label).toContain("solar 2.60 kW");
    expect(label).toContain("load 2.10 kW");
    expect(label).toContain("battery discharging 0.60 kW");
    expect(label).toContain("state of charge 65.0 percent");
    expect(label).toContain("grid importing 0.50 kW");
  });

  it("reports exporting instead of importing when grid power is negative", () => {
    const { getByRole } = render(
      <PowerFlowDiagram intervals={[interval()]} intervalMinutes={60} playhead={0} playing={true} />,
    );
    const label = getByRole("img").getAttribute("aria-label") ?? "";
    expect(label).toContain("grid exporting 0.30 kW");
  });
});
