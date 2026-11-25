import type { GridMindScenarioReport } from "./protocol";

const metrics = {
  currency: "MYR", interval_count: 24, total_demand_kwh: 24, total_solar_generation_kwh: 0,
  direct_solar_consumption_kwh: 0, solar_to_battery_kwh: 0, solar_self_consumption_kwh: 0,
  solar_self_consumption_ratio: null, grid_import_kwh: 24, grid_export_kwh: 0, battery_charge_kwh: 0,
  battery_discharge_kwh: 0, initial_soc_kwh: 0, final_soc_kwh: 0, import_cost: 4.8, export_credit: 0,
  net_cost: 4.8, energy_balance_valid: true, battery_constraints_valid: true, grid_constraints_valid: true, tariff_costs_valid: true,
  max_load_balance_error_kwh: 0, max_solar_balance_error_kwh: 0, max_soc_balance_error_kwh: 0,
};

export function validScenarioReport(): GridMindScenarioReport {
  const baselineIntervals = Array.from({ length: 24 }, (_, hour) => ({
    timestamp: `2026-01-15T${hour.toString().padStart(2, "0")}:00:00+08:00`,
    demand_kwh: 1, solar_generation_kwh: 0, direct_solar_kwh: 0, battery_charge_kwh: 0,
    battery_discharge_kwh: 0, grid_import_kwh: 1, grid_export_kwh: 0, state_of_charge_percent: 0,
    import_cost: 0.2, export_credit: 0, net_cost: 0.2, solar_curtailment_kwh: 0,
    battery_charge_from_grid_kwh: 0,
  }));
  const optimized = { ...metrics };
  return {
    scenario_fingerprint: "test-fingerprint", period_start: baselineIntervals[0].timestamp,
    period_end: baselineIntervals[23].timestamp, interval_minutes: 60, interval_count: 24,
    duration_hours: 24, currency: "MYR", battery_capacity_kwh: 4, baseline: metrics, gridmind: optimized,
    comparison: {
      baseline: metrics, optimized, cost_savings: 0, cost_savings_percent: 0,
      grid_import_reduction_kwh: 0, grid_import_reduction_percent: 0,
      solar_self_consumption_change_kwh: 0, solar_self_consumption_change_percent: null,
      solar_export_change_kwh: 0, solar_export_change_percent: null,
      battery_charge_change_kwh: 0, battery_charge_change_percent: null,
      battery_discharge_change_kwh: 0, battery_discharge_change_percent: null,
    },
    baseline_intervals: baselineIntervals, gridmind_intervals: baselineIntervals,
    baseline_hourly: null, gridmind_hourly: null, comparison_rows: [], assumptions: [], limitations: [], charts: [],
  };
}
