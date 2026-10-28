import type { RunHourlyScenarioPayload } from "../../shared/protocol";

// Mirrors the existing, explicitly synthetic Python dashboard example.
export const demoScenario: RunHourlyScenarioPayload = {
  start_date: "2026-01-15",
  demand_kwh: [0.55, 0.5, 0.48, 0.46, 0.48, 0.65, 0.95, 1.05, 0.9, 0.8, 0.75, 0.72, 0.7, 0.68, 0.7, 0.78, 0.9, 1.1, 1.35, 1.45, 1.3, 1.05, 0.8, 0.65],
  solar_generation_kwh: [0, 0, 0, 0, 0, 0, 0.05, 0.2, 0.55, 0.95, 1.35, 1.65, 1.85, 1.95, 1.85, 1.55, 1.1, 0.6, 0.2, 0.03, 0, 0, 0, 0],
  import_rate_per_kwh: Array.from({ length: 24 }, (_, hour) => hour >= 17 && hour <= 21 ? 0.3 : 0.22),
  export_rate_per_kwh: Array(24).fill(0.05),
  battery: {
    capacity_kwh: 10,
    max_charge_power_kw: 3,
    max_discharge_power_kw: 3,
    charge_efficiency: 0.95,
    discharge_efficiency: 0.95,
    initial_soc_kwh: 5,
    min_soc_kwh: 0,
    max_soc_kwh: 10,
  },
  currency: "MYR",
};
