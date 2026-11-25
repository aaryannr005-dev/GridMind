# Phase 5B: Reserve-aware battery optimisation

## Objective

Extend the existing discrete dynamic-programming dispatch optimiser with
explicit operating schedules. The optimiser must respect user-defined
state-of-charge reserves and grid-charging windows while retaining physical
battery, tariff, and grid constraints.

## Delivered scope

- `OptimizationConfig.minimum_soc_schedule_kwh`: optional immutable tuple
  with one minimum end-of-interval battery SOC target per input interval.
  Values must remain within the battery's configured SOC limits.
- `OptimizationConfig.grid_charging_schedule`: optional immutable tuple of
  booleans, one per interval. A false entry prohibits grid energy from charging
  the battery during that interval. Solar charging remains available when
  physically possible.
- The existing global `allow_grid_charging=False` setting overrides the
  per-interval schedule.
- The dynamic-programming candidate search enforces each interval's reserve
  floor, and the requested terminal SOC must satisfy the final reserve.
- Schedule lengths are checked against the exact optimisation horizon. Invalid
  types, values, or SOC bounds are rejected instead of silently coerced.

## Interpretation and limitations

- Reserve values apply to the state of charge at the end of each interval.
- Grid-charging windows are hard permissions, not a price forecast. The
  optimiser still decides whether charging is economically useful.
- This is finite-horizon, perfect-input optimisation: demand, solar and tariffs
  supplied to the optimiser are treated as known for the requested horizon.
  Forecast uncertainty and rolling-horizon replanning are not introduced here.
- The SOC search remains discretised. Results are approximate at the selected
  `soc_step_kwh`. When comparing against a known-feasible baseline at the same
  terminal SOC, its interval SOC trajectory can be supplied as
  `baseline_soc_schedule_kwh`; those points are added to the search grid so
  discretisation cannot exclude the reference schedule.
- These schedules are planning constraints for simulation, not commands sent
  to a physical battery or inverter.

## Acceptance criteria

- [x] Per-interval minimum SOC reserve schedule.
- [x] Per-interval grid-charging permission schedule.
- [x] Global grid-charging disable remains authoritative.
- [x] Horizon length, value type, and battery-bound validation.
- [x] Terminal SOC respects the final reserve.
- [x] Regression tests for reserve enforcement and scheduled charging.
- [ ] Forecast-aware rolling-horizon optimisation and explicit replanning.
- [ ] Scenario sensitivity and robustness analysis.
