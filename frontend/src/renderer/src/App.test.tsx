import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GridMindScenarioReport } from "../../shared/protocol";
import App from "./App";

const metrics = {
  currency: "MYR",
  interval_count: 24,
  total_demand_kwh: 20,
  total_solar_generation_kwh: 15,
  direct_solar_consumption_kwh: 8,
  solar_to_battery_kwh: 4,
  solar_self_consumption_kwh: 12,
  solar_self_consumption_ratio: 0.8,
  grid_import_kwh: 8,
  grid_export_kwh: 3,
  battery_charge_kwh: 4,
  battery_discharge_kwh: 3,
  initial_soc_kwh: 5,
  final_soc_kwh: 5,
  import_cost: 2,
  export_credit: 0.15,
  net_cost: 1.85,
  energy_balance_valid: true,
  battery_constraints_valid: true,
  tariff_costs_valid: true,
  max_load_balance_error_kwh: 0,
  max_solar_balance_error_kwh: 0,
  max_soc_balance_error_kwh: 0,
};

function interval(hour: number) {
  return {
    timestamp: "2026-01-15T" + hour.toString().padStart(2, "0") + ":00:00+08:00",
    demand_kwh: hour === 0 ? 0.55 : 0.5,
    solar_generation_kwh: hour === 12 ? 1.85 : 0,
    direct_solar_kwh: 0.2,
    battery_charge_kwh: 0.3,
    battery_discharge_kwh: 0,
    grid_import_kwh: 0.25,
    grid_export_kwh: 0,
    state_of_charge_percent: 50 + hour,
    import_cost: 0.05,
    export_credit: 0,
    net_cost: 0.05,
    solar_curtailment_kwh: 0,
    battery_charge_from_grid_kwh: 0,
  };
}

const report = {
  scenario_fingerprint: "sample-fingerprint",
  period_start: "2026-01-15T00:00:00+08:00",
  period_end: "2026-01-15T23:00:00+08:00",
  interval_minutes: 60,
  interval_count: 24,
  duration_hours: 24,
  currency: "MYR",
  battery_capacity_kwh: 10,
  baseline: metrics,
  gridmind: { ...metrics, net_cost: 1.2, grid_import_kwh: 6 },
  comparison: {
    baseline: metrics,
    optimized: { ...metrics, net_cost: 1.2, grid_import_kwh: 6 },
    cost_savings: 0.65,
    cost_savings_percent: 35,
    grid_import_reduction_kwh: 2,
    grid_import_reduction_percent: 25,
    solar_self_consumption_change_kwh: 1,
    solar_self_consumption_change_percent: 10,
    solar_export_change_kwh: -1,
    solar_export_change_percent: -20,
    battery_charge_change_kwh: 0.5,
    battery_charge_change_percent: 10,
    battery_discharge_change_kwh: 0.5,
    battery_discharge_change_percent: 10,
  },
  baseline_intervals: Array.from({ length: 24 }, (_, hour) => interval(hour)),
  gridmind_intervals: Array.from({ length: 24 }, (_, hour) => interval(hour)),
  baseline_hourly: [],
  gridmind_hourly: [],
  comparison_rows: [],
  assumptions: ["Synthetic demonstration inputs."],
  limitations: ["Does not model battery degradation."],
  charts: [],
} as GridMindScenarioReport;

const runHourlyScenario = vi.fn();

beforeEach(() => {
  window.localStorage.clear();
  runHourlyScenario.mockReset();
  runHourlyScenario.mockResolvedValue(report);
  Object.defineProperty(window, "gridmindDesktop", {
    configurable: true,
    value: { platform: "linux", runHourlyScenario },
  });
});

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window, "gridmindDesktop");
});

describe("GridMind desktop shell", () => {
  it("shows an honest empty dashboard before a scenario runs", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: /make every energy decision explainable/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "No scenario results yet" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Energy and battery profile" })).not.toBeInTheDocument();
  });

  it("marks the selected page in the accessible navigation", () => {
    render(<App />);

    expect(screen.getByRole("button", { name: "Overview" })).toHaveAttribute("aria-current", "page");
    fireEvent.click(screen.getByRole("button", { name: "Reports" }));
    expect(screen.getByRole("button", { name: "Reports" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("heading", { name: "Reports" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "No completed reports yet" })).toBeInTheDocument();
  });

  it("shows the interactive historical map viewer and current data provenance", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Energy map" }));
    expect(screen.getByText("Historical reference, not live grid data")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open Energy Commission source page/ })).toHaveAttribute("href", "https://www.st.gov.my/resources/performance-statistical-information-malaysian-electricity-supply-industry-2021");
    expect(screen.getByRole("link", { name: /Open MyGDI Explorer/ })).toHaveAttribute("href", "https://mygdix.mygeoportal.gov.my/");
    expect(screen.getByRole("link", { name: /Explore current statistics and download data/ })).toHaveAttribute("href", "https://open.dosm.gov.my/data-catalogue/electricity_supply");
    expect(screen.getByText(/OpenDOSM publishes monthly electricity supply by sector under CC BY 4\.0/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "CC BY 4.0" })).toHaveAttribute("href", "https://creativecommons.org/licenses/by/4.0/");
    expect(screen.getByRole("link", { name: /Open the 2022 publication page/ })).toHaveAttribute("href", "https://www.st.gov.my/maklumat-prestasi-statistik-industri-pembekalan-elektrik-malaysia-2022");
    fireEvent.click(screen.getByRole("button", { name: /View the historical map in GridMind/ }));
    expect(screen.getByTitle("Energy Commission 2021 electricity supply industry maps")).toHaveAttribute("src", "https://www.st.gov.my/sites/default/files/2026-02/ST_MAISPEM-2021-V15-30-Oct-2024.pdf");
    fireEvent.click(screen.getByRole("button", { name: "Close map" }));
    expect(screen.queryByTitle("Energy Commission 2021 electricity supply industry maps")).not.toBeInTheDocument();
  });

  it("shows the latest completed report with provenance and engine results", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Run sample scenario" }));
    await waitFor(() => expect(runHourlyScenario).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "Reports" }));

    expect(screen.getByRole("heading", { name: "Scenario record" })).toBeInTheDocument();
    expect(screen.getAllByText("sample-fingerprint")).toHaveLength(2);
    expect(screen.getByRole("heading", { name: "Energy and battery profile" })).toBeInTheDocument();
    expect(screen.getByText("Assumptions and model limitations")).toBeInTheDocument();
  });

  it("links the empty report page to the Simulation Lab", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Reports" }));
    fireEvent.click(screen.getByRole("button", { name: "Open Simulation Lab" }));
    expect(screen.getByRole("heading", { name: "Hourly energy profile" })).toBeInTheDocument();
  });

  it("persists Overview section preferences and leaves the full Reports view intact", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Run sample scenario" }));
    await waitFor(() => expect(runHourlyScenario).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "Preferences" }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Energy and battery charts/ }));

    expect(window.localStorage.getItem("gridmind.dashboard-preferences.v1")).toContain('"showCharts":false');
    expect(screen.getByText("Preferences saved on this device.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Overview" }));
    expect(screen.queryByRole("heading", { name: "Energy and battery profile" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reports" }));
    expect(screen.getByRole("heading", { name: "Energy and battery profile" })).toBeInTheDocument();
  });

  it("loads saved Overview preferences when the app starts", async () => {
    window.localStorage.setItem("gridmind.dashboard-preferences.v1", JSON.stringify({ showMetrics: true, showCharts: false, showComparison: true, showAssumptions: true }));
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Run sample scenario" }));
    await waitFor(() => expect(runHourlyScenario).toHaveBeenCalled());
    expect(await screen.findByText("+0.65 MYR")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Energy and battery profile" })).not.toBeInTheDocument();
  });

  it("shows the editable 24-hour Simulation Lab", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /^Simulation lab/ }));
    expect(screen.getByRole("heading", { name: "Hourly energy profile" })).toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: "Demand at 00:00 MYT" })).toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: "Export credit at 23:00 MYT" })).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(25);
  });

  it("shows the idle engine state across navigation", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Data sources" }));
    expect(screen.getByText("ENGINE IDLE")).toBeInTheDocument();
    expect(screen.getByText("NO SCENARIO LOADED")).toBeInTheDocument();
  });

  it("runs the labeled synthetic example and charts returned engine data", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Run sample scenario" }));

    await waitFor(() => expect(runHourlyScenario).toHaveBeenCalledWith(expect.objectContaining({
      start_date: "2026-01-15",
      currency: "MYR",
      demand_kwh: expect.arrayContaining([0.55]),
    })));
    expect(await screen.findByRole("heading", { name: "Energy and battery profile" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Demand and solar generation/i })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Grid imports by strategy/i })).toBeInTheDocument();
    expect(screen.getByText("+0.65 MYR")).toBeInTheDocument();
    expect(screen.getByText("SCENARIO LOADED · SYNTHETIC EXAMPLE")).toBeInTheDocument();
  });

  it("shows engine failures without inventing results", async () => {
    runHourlyScenario.mockRejectedValueOnce(new Error("Local Python engine unavailable"));
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Run sample scenario" }));

    expect(await screen.findByText(/Local Python engine unavailable/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "No scenario results yet" })).toBeInTheDocument();
  });

  it("validates edited input and displays local engine results for a custom scenario", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /^Simulation lab/ }));
    fireEvent.change(screen.getByRole("spinbutton", { name: "Demand at 00:00 MYT" }), { target: { value: "2.75" } });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Import tariff at 00:00 MYT" }), { target: { value: "-0.1" } });
    fireEvent.click(screen.getByRole("button", { name: "Validate and run scenario" }));

    await waitFor(() => expect(runHourlyScenario).toHaveBeenCalledWith(expect.objectContaining({
      demand_kwh: expect.arrayContaining([2.75]),
      import_rate_per_kwh: expect.arrayContaining([-0.1]),
      start_date: "2026-01-15",
    })));
    expect(await screen.findByRole("heading", { name: "Scenario results" })).toBeInTheDocument();
    expect(screen.getByText(/Your scenario inputs were sent to the local Python engine/)).toBeInTheDocument();
    expect(screen.getByText("SCENARIO LOADED · USER INPUTS")).toBeInTheDocument();
  });

  it("blocks invalid custom inputs before calling the engine", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /^Simulation lab/ }));
    fireEvent.change(screen.getByRole("spinbutton", { name: "Demand at 00:00 MYT" }), { target: { value: "-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Validate and run scenario" }));

    expect(screen.getByRole("alert")).toHaveTextContent(/Demand at 00:00 MYT must be at least 0/i);
    expect(runHourlyScenario).not.toHaveBeenCalled();
  });
});
