# Phase 5C: Scenario sensitivity foundations

## Purpose

Phase 5C adds deterministic one-at-a-time sensitivity analysis. It lets an
analyst vary one scenario input dimension while keeping all other inputs fixed,
rerun the existing GridMind dispatch path, and quantify how selected outcomes
change relative to the unmodified baseline.

## Supported sensitivity dimensions

- Household demand energy per interval
- Solar generation energy per interval
- Import tariff per kWh
- Export tariff per kWh, when an export tariff series is supplied

Each dimension is scaled by positive finite multipliers. A multiplier of 1.0
represents the baseline input. Multiplier values must be unique.

## Supported outcome metrics

- Tariff net cost (import cost less export credit)
- Total grid import (kWh)
- Total grid export (kWh)
- Solar self-consumption ratio

The same run path is used for every point in a sweep: the self-consumption-first
simulator by default, or the dynamic-programming optimiser when explicit
`OptimizationConfig` options are supplied. The optimiser's degradation
penalty is not mixed into tariff net cost.

## Result and failure handling

Each point records its multiplier, metric value, absolute change, percentage
change, and feasibility. Percentage change is omitted when the baseline is
zero or the selected metric is undefined. A scenario that violates a hard
constraint, such as a grid import cap, is retained as an infeasible point with
its validation error; it is not silently discarded.

## Limitations

- This is one-at-a-time sensitivity, not a global search or probabilistic
  uncertainty analysis.
- Multipliers are user-selected deterministic stress cases, not calibrated
  probability ranges or forecasts.
- Only one input dimension changes per scenario. Interactions between demand,
  solar, tariffs, and equipment settings require separate scenario designs.
- Battery configuration and grid constraints remain fixed in this phase.
- Input scaling does not add weather data, smart-meter observations, or
  Malaysian household calibration.
- The analysis is for planning and comparison. It does not send commands to
  physical batteries or grid equipment.

## Acceptance criteria

- [x] Demand, solar generation, import tariff and export tariff sweeps.
- [x] Cost, grid import/export and solar self-consumption metrics.
- [x] Simulator and optional optimiser evaluation paths.
- [x] Explicit infeasible points for scenarios rejected by hard constraints.
- [x] Zero-baseline percentage handling and input validation.
- [x] Regression tests and public package exports.
- [ ] UI controls and visualisation of sensitivity results are a later product
  integration task.
