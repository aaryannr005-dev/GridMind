import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ComparisonPage } from "./ComparisonPage";
import type { SavedScenario } from "../saved-scenarios";

function scenario(id: string, name: string, netCost: number, currency = "MYR"): SavedScenario {
  const metrics = {
    total_demand_kwh: 20,
    total_solar_generation_kwh: 15,
    solar_self_consumption_ratio: 0.8,
    grid_import_kwh: 8,
    grid_export_kwh: 3,
    battery_charge_kwh: 4,
    battery_discharge_kwh: 3,
    import_cost: netCost + 0.15,
    export_credit: 0.15,
    net_cost: netCost,
  };
  return {
    id, name, saved_at: "2026-11-25T12:00:00.000Z",
    scenario_fingerprint: id, period_start: "2026-01-15T00:00:00+08:00",
    period_end: "2026-01-16T00:00:00+08:00", interval_minutes: 60,
    interval_count: 24, currency, baseline: metrics,
    gridmind: { ...metrics, net_cost: netCost - 0.4, grid_import_kwh: netCost < 1.5 ? 4 : 6 },
    cost_savings: 0.4,
  };
}

describe("ComparisonPage", () => {
  it("compares saved optimised outcomes and calculates signed differences", () => {
    const cases = [scenario("a", "Case A", 1.85), scenario("b", "Case B", 1.25)];
    render(<ComparisonPage scenarios={cases} onScenariosChange={vi.fn()} />);

    expect(screen.getByText("1.45 MYR")).toBeInTheDocument();
    expect(screen.getByText("0.85 MYR")).toBeInTheDocument();
    expect(screen.getByText("−0.60 MYR")).toBeInTheDocument();
    expect(screen.getByText("−2.00 kWh")).toBeInTheDocument();
  });

  it("does not calculate a misleading delta across different currencies", () => {
    const cases = [scenario("a", "Case A", 1.85), scenario("b", "Case B", 1.25, "USD")];
    render(<ComparisonPage scenarios={cases} onScenariosChange={vi.fn()} />);

    expect(screen.getAllByText("Different currencies").length).toBeGreaterThan(0);
    expect(screen.getByText(/no exchange-rate conversion is applied/i)).toBeInTheDocument();
  });

  it("can switch the comparison from optimised outcomes to baseline outcomes", () => {
    const cases = [scenario("a", "Case A", 1.85), scenario("b", "Case B", 1.25)];
    render(<ComparisonPage scenarios={cases} onScenariosChange={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Dispatch result"), { target: { value: "baseline" } });
    expect(screen.getByText("1.85 MYR")).toBeInTheDocument();
    expect(screen.getByText("1.25 MYR")).toBeInTheDocument();
    expect(screen.getByText("−0.60 MYR")).toBeInTheDocument();
  });
});
