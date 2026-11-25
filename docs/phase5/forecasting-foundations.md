# Phase 5A: Forecasting foundations

## Objective

Introduce deterministic, explainable forecast baselines that can later be
compared with more advanced models. This initial delivery does not claim
predictive accuracy, perform weather forecasting, or change the simulation
engine.

## Initial delivery

The gridmind.forecasting module provides:

- Persistence: repeat the most recent observed interval.
- Seasonal naive: repeat the most recent complete seasonal cycle (for example,
  24 hourly observations for a daily cycle).
- Rolling mean: repeat the mean of a caller-selected recent window.
- Timestamp-aligned evaluation using MAE, RMSE, mean bias error, maximum
  absolute error and WAPE. WAPE is omitted when actual total energy is zero.

Forecast inputs must be nonnegative, timezone-aware, strictly ordered and
uniformly spaced. Forecast timestamps begin one interval after the last
historical observation. Evaluation rejects missing, extra or misaligned actual
intervals.

## Important limitations

- Forecasts are point estimates only. No prediction interval is emitted
  because uncertainty calibration has not been established.
- No weather, irradiance, calendar, tariff, occupancy or external data is
  ingested. No network access is performed.
- Seasonal-naive forecasts require at least one complete caller-defined cycle.
- These baselines are references for backtesting, not evidence of household
  forecast accuracy. Evaluation must use held-out observations and preserve
  chronological order to avoid data leakage.
- Forecasts do not automatically populate scenario inputs or run simulations.

## Acceptance criteria

- [x] Transparent persistence, seasonal-naive and rolling-mean baselines.
- [x] Strict history cadence and forecast timestamp validation.
- [x] Exact alignment required for evaluation.
- [x] MAE, RMSE, bias, maximum absolute error and zero-safe WAPE.
- [x] No fabricated uncertainty bounds or accuracy claims.
- [ ] Chronological rolling-origin backtesting and baseline comparison.
- [ ] Forecast-to-simulation integration behind an explicit user action.
