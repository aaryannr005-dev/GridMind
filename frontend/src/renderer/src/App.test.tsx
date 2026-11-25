import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GridMindScenarioReport } from "../../shared/protocol";
import App from "./App";
import { COMPARISON_STORAGE_KEY, createScenarioComparison, saveScenarioComparisons } from "./scenario-comparisons";

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
  grid_constraints_valid: true,
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
  gridmind: { ...metrics, import_cost: 1.35, net_cost: 1.2, grid_import_kwh: 6 },
  comparison: {
    baseline: metrics,
    optimized: { ...metrics, import_cost: 1.35, net_cost: 1.2, grid_import_kwh: 6 },
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
const runSensitivityAnalysis = vi.fn();

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem("gridmind.profile.name.v1", "Test User");
  runHourlyScenario.mockReset();
  runHourlyScenario.mockResolvedValue(report);
  runSensitivityAnalysis.mockReset();
  runSensitivityAnalysis.mockResolvedValue({
    parameter: "demand", metric: "net_cost", currency: "MYR", baseline_value: 1.85,
    points: [0.5, 0.75, 1, 1.25, 1.5].map((multiplier) => ({
      multiplier, metric_value: 1.85 * multiplier, absolute_change: 1.85 * (multiplier - 1),
      percentage_change: (multiplier - 1) * 100, feasible: true, error: null,
    })),
  });
  Object.defineProperty(window, "gridmindDesktop", {
    configurable: true,
    value: { platform: "linux", runHourlyScenario, runSensitivityAnalysis },
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(window, "gridmindDesktop");
});

describe("GridMind first-run onboarding", () => {
  it("asks for a name on first launch and saves it locally before opening the dashboard", () => {
    window.localStorage.removeItem("gridmind.profile.name.v1");
    render(<App />);

    expect(screen.getByRole("heading", { name: "A clearer view of your energy." })).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Your name" }), { target: { value: "  Alex   Tan  " } });
    fireEvent.click(screen.getByRole("button", { name: /Continue to GridMind/ }));

    expect(window.localStorage.getItem("gridmind.profile.name.v1")).toBe("Alex Tan");
    expect(screen.getByRole("heading", { name: "Welcome back, Alex Tan." })).toBeInTheDocument();
  });

  it("allows the display name to be edited from Settings", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Display name" }), { target: { value: "Ari" } });
    fireEvent.click(screen.getByRole("button", { name: "Save name" }));

    expect(window.localStorage.getItem("gridmind.profile.name.v1")).toBe("Ari");
    fireEvent.click(screen.getByRole("button", { name: "Dashboard" }));
    expect(screen.getByRole("heading", { name: "Welcome back, Ari." })).toBeInTheDocument();
  });
});

describe("GridMind desktop shell", () => {
  it("shows an honest empty dashboard before a scenario runs", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "Welcome back, Test User." })).toBeInTheDocument();
    expect(screen.getByText("LATEST RUN")).toBeInTheDocument();
    expect(screen.getAllByText("Not started")).toHaveLength(2);
    expect(screen.getByRole("heading", { name: "Your first energy scenario starts here." })).toBeInTheDocument();
    expect(screen.getByText("Set your assumptions")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "No scenario results yet" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Energy and battery profile" })).not.toBeInTheDocument();
  });

  it("updates the dashboard summary from completed engine output", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Run sample scenario" }));

    await waitFor(() => expect(runHourlyScenario).toHaveBeenCalled());
    expect(await screen.findByText("Synthetic demonstration run")).toBeInTheDocument();
    expect(screen.getAllByText("Completed")).toHaveLength(2);
    expect(screen.getAllByText("24 × 60 min")).toHaveLength(2);
    expect(screen.getAllByText("Self-consumption first")).toHaveLength(2);
  });

  it("marks the selected page in the accessible navigation", () => {
    render(<App />);

    expect(screen.getByRole("button", { name: "Dashboard" })).toHaveAttribute("aria-current", "page");
    fireEvent.click(screen.getByRole("button", { name: "Analytics" }));
    expect(screen.getByRole("button", { name: "Analytics" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("heading", { name: "Reports" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "No completed reports yet" })).toBeInTheDocument();
  });

  it("shows the interactive historical map viewer and current data provenance", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Data & Maps" }));
    expect(screen.getByText("Historical reference, not live grid data")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open Energy Commission source page/ })).toHaveAttribute("href", "https://www.st.gov.my/resources/performance-statistical-information-malaysian-electricity-supply-industry-2021");
    expect(screen.getByRole("link", { name: /Open MyGDI Explorer/ })).toHaveAttribute("href", "https://mygdix.mygeoportal.gov.my/");
    expect(screen.getByRole("link", { name: /Explore current statistics and download data/ })).toHaveAttribute("href", "https://open.dosm.gov.my/data-catalogue/electricity_supply");
    expect(screen.getByText(/OpenDOSM publishes monthly electricity supply by sector under/)).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole("button", { name: "Analytics" }));

    expect(screen.getByRole("heading", { name: "Scenario record" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "How the system behaved" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Interval energy profile" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Tariff cost breakdown" })).toBeInTheDocument();
    expect(screen.getByText("Import charges")).toBeInTheDocument();
    expect(screen.getByText("Export credits")).toBeInTheDocument();
    expect(screen.getByText("Net tariff cost")).toBeInTheDocument();
    expect(screen.getByText("1.35 MYR")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Line chart comparing demand, solar generation and grid imports/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Baseline demand coverage" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Dispatch comparison" })).toBeInTheDocument();
    expect(screen.getAllByText("sample-fingerprint")).toHaveLength(2);
    expect(screen.getByRole("heading", { name: "Energy and battery profile" })).toBeInTheDocument();
    expect(screen.getByText("Assumptions and model limitations")).toBeInTheDocument();
  });

  it("links the empty report page to the Simulation Lab", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Analytics" }));
    fireEvent.click(screen.getByRole("button", { name: "Open Simulation Lab" }));
    expect(screen.getByRole("heading", { name: "Hourly energy profile" })).toBeInTheDocument();
  });

  it("persists Overview section preferences and leaves the full Reports view intact", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Run sample scenario" }));
    await waitFor(() => expect(runHourlyScenario).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Energy and battery charts/ }));

    expect(window.localStorage.getItem("gridmind.dashboard-preferences.v1")).toContain('"showCharts":false');
    expect(screen.getByText("Dashboard preferences saved on this device.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Dashboard" }));
    expect(screen.queryByRole("heading", { name: "Energy and battery profile" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Analytics" }));
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

    fireEvent.click(screen.getByRole("button", { name: /^Simulation/ }));
    expect(screen.getByRole("heading", { name: "Hourly energy profile" })).toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: "Demand at 00:00 MYT" })).toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: "Export credit at 23:00 MYT" })).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(25);
  });

  it("exposes the full Phase 2 scenario configuration in the Simulation Lab", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /^Simulation/ }));

    expect(screen.getByRole("heading", { name: "Grid import and export limits" })).toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: "Maximum grid import power (kW)" })).toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: "Maximum grid export power (kW)" })).toBeInTheDocument();

    fireEvent.change(screen.getByRole("spinbutton", { name: "Maximum grid import power (kW)" }), { target: { value: "0" } });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Maximum grid export power (kW)" }), { target: { value: "2.5" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /Enable PV temperature derating/ }));
    fireEvent.change(screen.getByRole("spinbutton", { name: "Ambient temperature (°C)" }), { target: { value: "32" } });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Solar irradiance (W/m²)" }), { target: { value: "900" } });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Battery degradation penalty (currency/kWh)" }), { target: { value: "0.05" } });
    fireEvent.click(screen.getByRole("button", { name: "Validate and run scenario" }));

    await waitFor(() => expect(runHourlyScenario).toHaveBeenCalledWith(expect.objectContaining({
      grid: { max_import_power_kw: 0, max_export_power_kw: 2.5 },
      ambient_temperature_c: Array(24).fill(32),
      solar_irradiance_w_m2: Array(24).fill(900),
      degradation_cost_per_kwh: 0.05,
    })));
  });

  it("shows the idle engine state across navigation", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Data & Maps" }));
    expect(screen.getByRole("heading", { name: "Energy map" })).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole("button", { name: /^Simulation/ }));
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
    fireEvent.click(screen.getByRole("button", { name: /^Simulation/ }));
    fireEvent.change(screen.getByRole("spinbutton", { name: "Demand at 00:00 MYT" }), { target: { value: "-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Validate and run scenario" }));

    expect(screen.getByRole("alert")).toHaveTextContent(/Demand at 00:00 MYT must be at least 0/i);
    expect(runHourlyScenario).not.toHaveBeenCalled();
  });

  it("renders the Phase 2 control rail sections and unmodelled weather rows", () => {
    render(<App />);

    for (const title of [
      "A · Simulation time",
      "B · Grid connection",
      "C · Environmental conditions",
      "D · Load profile",
      "E · Energy management strategy",
      "F · Electricity tariffs",
      "G · Battery health and degradation",
      "H · Financial settings",
    ]) {
      expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    }
    expect(screen.getByText("Weather preset")).toBeInTheDocument();
    expect(screen.getByText("Wind speed")).toBeInTheDocument();
    expect(screen.getAllByText("NOT MODELED")).toHaveLength(2);
  });

  it("applies zero and limited grid connection settings from the control rail", async () => {
    render(<App />);

    fireEvent.change(screen.getByRole("spinbutton", { name: "Grid maximum import power" }), { target: { value: "0" } });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Grid maximum export power" }), { target: { value: "2.5" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply grid limits & run" }));

    await waitFor(() => expect(runHourlyScenario).toHaveBeenCalledWith(expect.objectContaining({
      grid: { max_import_power_kw: 0, max_export_power_kw: 2.5 },
    })));
  });

  it("applies PV derating and expands weather inputs from the control rail", async () => {
    render(<App />);

    const ambient = screen.getByRole("spinbutton", { name: "Ambient temperature" });
    expect(ambient).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: /PV temperature derating/ }));
    expect(ambient).toBeEnabled();
    fireEvent.change(ambient, { target: { value: "32" } });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Solar irradiance" }), { target: { value: "900" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply weather & run" }));

    await waitFor(() => expect(runHourlyScenario).toHaveBeenCalledWith(expect.objectContaining({
      pv: { reference_temperature_c: 25, noct_c: 45, temperature_coefficient_per_c: -0.004 },
      ambient_temperature_c: Array(24).fill(32),
      solar_irradiance_w_m2: Array(24).fill(900),
    })));
  });

  it("validates SoH against usable capacity and applies degradation costs in the control rail", async () => {
    render(<App />);

    const soh = screen.getByRole("spinbutton", { name: "Battery state of health" });
    fireEvent.change(soh, { target: { value: "0.5" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply battery health & run" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/usable battery capacity/i);
    expect(runHourlyScenario).not.toHaveBeenCalled();

    fireEvent.change(soh, { target: { value: "1" } });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Battery degradation penalty" }), { target: { value: "0.05" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply battery health & run" }));

    await waitFor(() => expect(runHourlyScenario).toHaveBeenCalledWith(expect.objectContaining({
      degradation_cost_per_kwh: 0.05,
    })));
  });

  it("shows battery state of health at 100% and updates usable capacity in the Simulation Lab", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /^Simulation/ }));

    const soh = screen.getByRole("spinbutton", { name: "Battery state of health" });
    expect(soh).toHaveValue(1);
    expect(screen.getAllByText("10.00 kWh")).toHaveLength(2);

    fireEvent.change(soh, { target: { value: "0.8" } });
    expect(screen.getAllByText("8.00 kWh")).toHaveLength(2);
  });

  it("rejects invalid SoH and maximum charge combinations in the Simulation Lab", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /^Simulation/ }));

    const soh = screen.getByRole("spinbutton", { name: "Battery state of health" });
    fireEvent.change(soh, { target: { value: "0.5" } });
    fireEvent.click(screen.getByRole("button", { name: "Validate and run scenario" }));

    expect(runHourlyScenario).not.toHaveBeenCalled();
    expect(screen.getAllByText("Maximum battery charge cannot exceed usable battery capacity.")).toHaveLength(2);
    expect(soh).toHaveAttribute("aria-invalid", "true");

    fireEvent.change(soh, { target: { value: "1.1" } });
    fireEvent.click(screen.getByRole("button", { name: "Validate and run scenario" }));

    expect(runHourlyScenario).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/state of health must be greater than 0 and at most 1/i);
  });

  it("sends a valid Simulation Lab SoH and reduced maximum charge to the engine", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /^Simulation/ }));

    fireEvent.change(screen.getByRole("spinbutton", { name: "Battery state of health" }), { target: { value: "0.5" } });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Maximum charge" }), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Validate and run scenario" }));

    await waitFor(() => expect(runHourlyScenario).toHaveBeenCalledWith(expect.objectContaining({
      battery: expect.objectContaining({ capacity_kwh: 10, max_soc_kwh: 5, state_of_health: 0.5 }),
    })));
  });
  it("keeps tariff charts tied to the completed run and flags edited inputs as stale", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Run sample scenario" }));
    await waitFor(() => expect(runHourlyScenario).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: /^Simulation/ }));
    fireEvent.change(screen.getByRole("spinbutton", { name: "Import tariff at 00:00 MYT" }), { target: { value: "0.99" } });
    expect(screen.getByText("Scenario inputs changed since the latest run.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Dashboard" }));
    fireEvent.click(screen.getByRole("tab", { name: "Tariffs" }));
    const tariffPanel = screen.getByRole("tabpanel", { name: "Tariffs" });
    fireEvent.click(tariffPanel.querySelector("summary")!);
    const tariffRows = Array.from(tariffPanel.querySelectorAll("tr"));
    const midnightTariffRow = tariffRows.find((row) => row.textContent?.includes("00:00"));
    expect(midnightTariffRow).toBeDefined();
    expect(midnightTariffRow).toHaveTextContent("0.22");
    expect(midnightTariffRow).not.toHaveTextContent("0.99");
  });

  it("passes the exact Control Rail input snapshot with its completed run", async () => {
    render(<App />);
    fireEvent.change(screen.getByRole("spinbutton", { name: "Grid maximum import power" }), { target: { value: "1.7" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply grid limits & run" }));
    await waitFor(() => expect(runHourlyScenario).toHaveBeenCalledWith(expect.objectContaining({
      grid: { max_import_power_kw: 1.7 },
    })));
    expect(screen.queryByText(/Scenario inputs changed since the latest run/i)).not.toBeInTheDocument();
  });


  it("shows a reproducible report snapshot and supports print-to-PDF", async () => {
    const print = vi.fn();
    vi.stubGlobal("print", print);
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Run sample scenario" }));
    await waitFor(() => expect(runHourlyScenario).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "Analytics" }));

    expect(screen.getByRole("heading", { name: "What changed?" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Configuration snapshot" })).toBeInTheDocument();
    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(screen.getByText("10.00 kWh")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Print / Save as PDF" }));
    expect(print).toHaveBeenCalledOnce();
  });

  it("keeps exported report results tied to the completed run when inputs become stale", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Run sample scenario" }));
    await waitFor(() => expect(runHourlyScenario).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: /^Simulation/ }));
    fireEvent.change(screen.getByRole("spinbutton", { name: "Import tariff at 00:00 MYT" }), { target: { value: "0.99" } });
    fireEvent.click(screen.getByRole("button", { name: "Analytics" }));

    expect(screen.getByText(/Exported files will preserve these completed results/)).toBeInTheDocument();
    expect(screen.getByText("+0.65 MYR")).toBeInTheDocument();
  });


  it("provides a keyboard-accessible skip link to the main workspace", () => {
    render(<App />);
    const skipLink = screen.getByRole("link", { name: "Skip to main content" });
    expect(skipLink).toHaveAttribute("href", "#main-content");
    expect(document.getElementById("main-content")).toHaveAttribute("tabindex", "-1");
  });

  it("clears an old engine error when the user edits scenario inputs", async () => {
    runHourlyScenario.mockRejectedValueOnce(new Error("Local Python engine unavailable"));
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Run sample scenario" }));
    expect(await screen.findByText(/Local Python engine unavailable/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^Simulation/ }));
    fireEvent.change(screen.getByRole("spinbutton", { name: "Demand at 00:00 MYT" }), { target: { value: "0.7" } });
    expect(screen.queryByText(/Local Python engine unavailable/)).not.toBeInTheDocument();
  });

  it("compares saved scenarios against a selectable reference with signed metric deltas", () => {
    const reference = createScenarioComparison(report, "custom", null, "Reference run");
    const comparisonReport = {
      ...report,
      gridmind: { ...report.gridmind!, net_cost: 0.9, grid_import_kwh: 4, solar_self_consumption_ratio: 0.9 },
      comparison: { ...report.comparison!, cost_savings: 0.95 },
    };
    const alternative = createScenarioComparison(comparisonReport, "custom", null, "Higher solar");
    expect(saveScenarioComparisons([reference, alternative])).toBe(true);

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Analytics" }));

    const referenceSelect = screen.getByRole("combobox", { name: "Compare changes against" });
    expect(referenceSelect).toHaveValue(reference.id);
    expect(screen.getByText("−0.30 MYR")).toBeInTheDocument();
    expect(screen.getByText("−2.00 kWh")).toBeInTheDocument();
    expect(screen.getByText("+10.0 pp")).toBeInTheDocument();

    fireEvent.change(referenceSelect, { target: { value: alternative.id } });
    expect(screen.getByText("+0.30 MYR")).toBeInTheDocument();
  });

  it("saves completed engine reports as local comparison snapshots and supports removal", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Run sample scenario" }));
    await waitFor(() => expect(runHourlyScenario).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "Analytics" }));

    fireEvent.change(screen.getByRole("textbox", { name: "Name this completed run" }), { target: { value: "Reference run" } });
    fireEvent.click(screen.getByRole("button", { name: "Save comparison snapshot" }));

    expect((await screen.findAllByText("Reference run")).length).toBeGreaterThan(0);
    const stored = JSON.parse(window.localStorage.getItem(COMPARISON_STORAGE_KEY) ?? "[]") as Array<{ name: string; baseline: { netCost: number } }>;
    expect(stored).toHaveLength(1);
    expect(stored[0].name).toBe("Reference run");
    expect(stored[0].baseline.netCost).toBe(1.85);

    fireEvent.click(screen.getByRole("button", { name: "Remove Reference run from comparison library" }));
    expect(screen.queryByText("Reference run")).not.toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem(COMPARISON_STORAGE_KEY) ?? "[]")).toHaveLength(0);
  });

  it("keeps the CSV object URL alive briefly after starting the download", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Run sample scenario" }));
    await waitFor(() => expect(runHourlyScenario).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "Analytics" }));

    const createObjectURL = vi.fn().mockReturnValue("blob:gridmind-report");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
    let scheduledRevoke: (() => void) | undefined;
    const timeoutSpy = vi.spyOn(window, "setTimeout").mockImplementation((callback, delay) => {
      if (delay === 1000 && typeof callback === "function") scheduledRevoke = callback as () => void;
      return 0 as unknown as ReturnType<typeof window.setTimeout>;
    });

    fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(revokeObjectURL).not.toHaveBeenCalled();
    expect(timeoutSpy).toHaveBeenCalledWith(expect.any(Function), 1000);
    timeoutSpy.mockRestore();
    const csvBlob = createObjectURL.mock.calls[0][0] as Blob;
    const csvText = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(csvBlob);
    });
    expect(csvText).toContain("baseline_import_cost,2");
    expect(csvText).toContain("baseline_export_credit,0.15");
    expect(csvText).toContain("gridmind_import_cost,1.35");
    expect(csvText).toContain("baseline_net_cost,1.85");
    expect(csvText).toContain("modeled_cost_savings,0.65");
    expect(csvText).toContain("baseline_import_cost");
    expect(csvText).toContain("baseline_energy_balance_valid,true");
    expect(csvText).toContain("assumption_01,Synthetic demonstration inputs.");
    expect(csvText).toContain("limitation_01,Does not model battery degradation.");

    expect(revokeObjectURL).not.toHaveBeenCalled();
    scheduledRevoke?.();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:gridmind-report");
  });

});

describe("GridMind sensitivity analysis", () => {
  it("runs the engine sensitivity operation from the Simulation Lab and renders returned points", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /^Simulation/ }));
    fireEvent.click(screen.getByRole("button", { name: "Run sensitivity sweep" }));

    await waitFor(() => expect(runSensitivityAnalysis).toHaveBeenCalledWith(expect.objectContaining({
      parameter: "demand",
      metric: "net_cost",
      strategy: "gridmind",
      multipliers: [0.5, 0.75, 1, 1.25, 1.5],
      scenario: expect.objectContaining({ start_date: "2026-01-15", currency: "MYR" }),
    })));
    expect((await screen.findAllByText("1.85 MYR")).length).toBeGreaterThan(1);
    expect(screen.getAllByText("50%")).toHaveLength(2);
    expect(screen.getAllByText("150%")).toHaveLength(2);
  });

  it("keeps infeasible sensitivity cases visible without presenting them as zero outcomes", async () => {
    runSensitivityAnalysis.mockResolvedValueOnce({
      parameter: "demand",
      metric: "net_cost",
      currency: "MYR",
      baseline_value: 1.85,
      points: [
        { multiplier: 0.5, metric_value: 1, absolute_change: -0.85, percentage_change: -45.9, feasible: true, error: null },
        { multiplier: 1.5, metric_value: null, absolute_change: null, percentage_change: null, feasible: false, error: "grid import exceeds configured maximum" },
      ],
    });
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /^Simulation/ }));
    fireEvent.click(screen.getByRole("button", { name: "Run sensitivity sweep" }));

    expect((await screen.findAllByText("Infeasible")).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/Infeasible cases remain visible/)).toBeInTheDocument();
    expect(screen.getByTitle("grid import exceeds configured maximum")).toBeInTheDocument();
  });

});
