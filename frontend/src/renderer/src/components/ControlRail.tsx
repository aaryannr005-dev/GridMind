import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import type { GridMindScenarioReport, RunHourlyScenarioPayload } from "../../../shared/protocol";
import { formatClock, stepPlayhead } from "../playback";
import {
  applyFlatTariff,
  applyLoadProfile,
  applyTouTariff,
  loadProfiles,
  tariffRange,
  touPeakWindow,
  type LoadProfileId,
} from "../scenario-shaping";
import { validateScenarioForm, type GridFormKey, type PvFormValues, type ScenarioFormValues } from "../scenario-form";

export type StrategyId = "baseline" | "gridmind";

const speeds = [0.5, 1, 2, 4] as const;

interface ControlRailProps {
  report: GridMindScenarioReport | null;
  strategy: StrategyId;
  onStrategyChange: Dispatch<SetStateAction<StrategyId>>;
  playhead: number | null;
  onPlayheadChange: Dispatch<SetStateAction<number | null>>;
  playing: boolean;
  onPlayingChange: Dispatch<SetStateAction<boolean>>;
  speed: number;
  onSpeedChange: Dispatch<SetStateAction<number>>;
  values: ScenarioFormValues;
  onValuesChange: (values: ScenarioFormValues) => void;
  onRunScenario: (payload: RunHourlyScenarioPayload) => void;
  isRunning: boolean;
}

const unmodeledRows = [
  "Weather preset",
  "Wind speed",
];

export function ControlRail({
  report,
  strategy,
  onStrategyChange,
  playhead,
  onPlayheadChange,
  playing,
  onPlayingChange,
  speed,
  onSpeedChange,
  values,
  onValuesChange,
  onRunScenario,
  isRunning,
}: ControlRailProps) {
  const [railErrors, setRailErrors] = useState<string[]>([]);
  const [profileId, setProfileId] = useState<LoadProfileId>("demo");
  const [tariffMode, setTariffMode] = useState<"flat" | "tou">("flat");
  const [tariffForm, setTariffForm] = useState({
    rate: values.import_rate_per_kwh[0] ?? "0.22",
    offPeakRate: "0.22",
    exportRate: values.export_rate_per_kwh[0] ?? "0.05",
  });

  // Replay a completed engine run: step the recorded cursor while playing.
  useEffect(() => {
    if (!playing || !report) {
      onPlayingChange(false);
      return;
    }
    const id = window.setInterval(() => {
      onPlayheadChange((previous) => stepPlayhead(previous, report.interval_count, 1));
    }, 850 / speed);
    return () => window.clearInterval(id);
  }, [playing, report, speed, onPlayingChange, onPlayheadChange]);

  function runUpdated(updated: ScenarioFormValues): void {
    const validation = validateScenarioForm(updated);
    if (!validation.ok) {
      setRailErrors(validation.errors.slice(0, 4));
      return;
    }
    setRailErrors([]);
    onValuesChange(updated);
    onRunScenario(validation.payload);
  }

  function parseSeries(series: string[], name: string): number[] | null {
    const parsed = series.map(Number);
    if (!parsed.every((value) => Number.isFinite(value))) {
      setRailErrors([`${name} contains non-numeric values; fix them in the Simulation Lab.`]);
      return null;
    }
    return parsed;
  }

  function applyProfile(): void {
    const demand = parseSeries(values.demand_kwh, "Demand");
    if (!demand) return;
    const shaped = applyLoadProfile(profileId, demand);
    if (!shaped) {
      setRailErrors(["Demand must contain 24 finite interval values."]);
      return;
    }
    runUpdated({ ...values, demand_kwh: shaped.map(String) });
  }

  function applyTariffs(): void {
    const rate = Number(tariffForm.rate);
    const exportRate = Number(tariffForm.exportRate);
    const offPeakRate = Number(tariffForm.offPeakRate);
    const nextRates = tariffMode === "tou"
      ? applyTouTariff(rate, offPeakRate)
      : applyFlatTariff(rate);
    if (!nextRates.length || !Number.isFinite(exportRate)) {
      setRailErrors(["Tariff rates must be finite numbers."]);
      return;
    }
    runUpdated({
      ...values,
      import_rate_per_kwh: nextRates.map(String),
      export_rate_per_kwh: applyFlatTariff(exportRate).map(String),
    });
  }

  function updateGridLimit(key: GridFormKey, value: string): void {
    onValuesChange({ ...values, grid: { ...values.grid, [key]: value } });
  }

  function updatePv(patch: Partial<PvFormValues>): void {
    onValuesChange({ ...values, pv: { ...values.pv, ...patch } });
  }

  function applyCurrentInputs(): void {
    runUpdated(values);
  }

  const intervalCount = report?.interval_count ?? 0;
  const cursorClock = report && playhead !== null
    ? formatClock(report.baseline_intervals[Math.min(playhead, report.baseline_intervals.length - 1)].timestamp)
    : null;
  const gridMindAvailable = report?.gridmind_intervals != null && report.gridmind_intervals.length > 0;

  const importRange = tariffRange(values.import_rate_per_kwh.map(Number).filter(Number.isFinite));
  const exportRange = tariffRange(values.export_rate_per_kwh.map(Number).filter(Number.isFinite));

  const activeMetrics = strategy === "gridmind" && report?.gridmind ? report.gridmind : report?.baseline;
  const savings = strategy === "gridmind" && report?.comparison ? report.comparison.cost_savings : null;
  const currency = report?.currency ?? values.currency.toUpperCase();

  return (
    <aside className="rail" aria-label="Simulation controls">
      <section className="rail-section">
        <h2 className="rail-title">A · Simulation time</h2>
        {report ? (
          <>
            <div className="rail-readout">
              <span>{cursorClock ? `INTERVAL ${cursorClock} MYT` : "SUMMARY · ALL INTERVALS"}</span>
              <span className="mono">{`${intervalCount} × ${report.interval_minutes} min`}</span>
            </div>
            <input
              type="range"
              className="slider-input rail-scrubber"
              aria-label="Timeline scrubber"
              min={0}
              max={intervalCount - 1}
              value={playhead ?? 0}
              onChange={(event) => onPlayheadChange(event.currentTarget.valueAsNumber)}
            />
            <div className="rail-playback">
              <button type="button" className="rail-button" aria-label="Rewind to summary" onClick={() => { onPlayingChange(false); onPlayheadChange(null); }}>⏮</button>
              <button type="button" className="rail-button" aria-label="Previous interval" onClick={() => { onPlayingChange(false); onPlayheadChange((previous) => stepPlayhead(previous, intervalCount, -1)); }}>◀</button>
              <button type="button" className="rail-button rail-button-play" aria-label={playing ? "Pause replay" : "Play replay"} onClick={() => onPlayingChange(!playing)}>
                {playing ? "⏸" : "▶"}
              </button>
              <button type="button" className="rail-button" aria-label="Next interval" onClick={() => { onPlayingChange(false); onPlayheadChange((previous) => stepPlayhead(previous, intervalCount, 1)); }}>▶</button>
              <label className="rail-speed">
                <span className="visually-hidden">Replay speed</span>
                <select value={speed} onChange={(event) => onSpeedChange(Number(event.target.value))}>
                  {speeds.map((option) => <option key={option} value={option}>{option}×</option>)}
                </select>
              </label>
            </div>
            <p className="rail-note">Replay of the recorded engine run; the model is not resimulated.</p>
          </>
        ) : <p className="rail-note">Run a scenario to scrub its recorded intervals.</p>}
      </section>

      <section className="rail-section">
        <h2 className="rail-title">B · Grid connection</h2>
        <div className="rail-tariff-fields">
          <label>
            <span>Max import power (kW)</span>
            <input
              type="number"
              min="0"
              step="0.1"
              placeholder="Unlimited"
              aria-label="Grid maximum import power"
              value={values.grid.max_import_power_kw}
              onChange={(event) => updateGridLimit("max_import_power_kw", event.target.value)}
            />
          </label>
          <label>
            <span>Max export power (kW)</span>
            <input
              type="number"
              min="0"
              step="0.1"
              placeholder="Unlimited"
              aria-label="Grid maximum export power"
              value={values.grid.max_export_power_kw}
              onChange={(event) => updateGridLimit("max_export_power_kw", event.target.value)}
            />
          </label>
        </div>
        <button type="button" className="rail-apply" disabled={isRunning} onClick={applyCurrentInputs}>
          {isRunning ? "Engine running…" : "Apply grid limits & run"}
        </button>
        <p className="rail-note">Limits apply to each hourly interval. Leave blank for unlimited; 0 is a real limit. Export above the limit is curtailed, while import above it rejects the scenario.</p>
      </section>

      <section className="rail-section">
        <h2 className="rail-title">C · Environmental conditions</h2>
        <label className="rail-option">
          <input
            type="checkbox"
            checked={values.pv.enabled}
            onChange={(event) => updatePv({ enabled: event.target.checked })}
          />
          <span>
            <strong>PV temperature derating</strong>
            <small>Apply a NOCT cell-temperature model to the solar series before dispatch.</small>
          </span>
        </label>
        <div className="rail-tariff-fields">
          <label>
            <span>Ambient temperature (°C)</span>
            <input
              type="number"
              step="0.1"
              aria-label="Ambient temperature"
              disabled={!values.pv.enabled}
              value={values.pv.ambient_temperature_c}
              onChange={(event) => updatePv({ ambient_temperature_c: event.target.value })}
            />
          </label>
          <label>
            <span>Solar irradiance (W/m²)</span>
            <input
              type="number"
              min="0"
              step="1"
              aria-label="Solar irradiance"
              disabled={!values.pv.enabled}
              value={values.pv.solar_irradiance_w_m2}
              onChange={(event) => updatePv({ solar_irradiance_w_m2: event.target.value })}
            />
          </label>
        </div>
        <button type="button" className="rail-apply" disabled={isRunning} onClick={applyCurrentInputs}>
          {isRunning ? "Engine running…" : "Apply weather & run"}
        </button>
        <p className="rail-note">Weather inputs are assumed constant across all 24 intervals and are not live weather. Derating can only reduce solar output; it never adds generation.</p>
        <ul className="rail-list">
          {unmodeledRows.map((row) => (
            <li key={row}><span>{row}</span><span className="not-modeled">NOT MODELED</span></li>
          ))}
        </ul>
      </section>

      <section className="rail-section">
        <h2 className="rail-title">D · Load profile</h2>
        <fieldset className="rail-fieldset">
          <legend className="visually-hidden">Load profile preset</legend>
          {loadProfiles.map((preset) => (
            <label key={preset.id} className="rail-option">
              <input type="radio" name="load-profile" value={preset.id} checked={profileId === preset.id} onChange={() => setProfileId(preset.id)} />
              <span>
                <strong>{preset.label}</strong>
                <small>{preset.description}</small>
              </span>
            </label>
          ))}
        </fieldset>
        <button type="button" className="rail-apply" disabled={isRunning} onClick={applyProfile}>
          {isRunning ? "Engine running…" : "Apply profile & run"}
        </button>
        <p className="rail-note">Reshapes the 24 demand inputs. Daily energy stays the same; the real engine simulates the reshaped inputs.</p>
      </section>

      <section className="rail-section">
        <h2 className="rail-title">E · Energy management strategy</h2>
        <fieldset className="rail-fieldset">
          <legend className="visually-hidden">Dispatch strategy</legend>
          <label className="rail-option">
            <input type="radio" name="strategy" checked={strategy === "baseline"} onChange={() => onStrategyChange("baseline")} />
            <span>
              <strong>Self-consumption first</strong>
              <small>Greedy engine rule: solar serves load, then battery, export last.</small>
            </span>
          </label>
          <label className="rail-option">
            <input type="radio" name="strategy" checked={strategy === "gridmind"} disabled={!gridMindAvailable} onChange={() => onStrategyChange("gridmind")} />
            <span>
              <strong>Cost-optimised (GridMind)</strong>
              <small>Dynamic-programming dispatch minimizing modeled cost under tariffs.</small>
            </span>
          </label>
        </fieldset>
        {strategy === "gridmind" && <p className="rail-note">Charts and readouts show the optimizer's recorded dispatch; the optimizer only shifts charging toward cheap periods within its power and capacity limits.</p>}
      </section>

      <section className="rail-section">
        <h2 className="rail-title">F · Electricity tariffs</h2>
        <dl className="rail-readout rail-readout-grid">
          <div><dt>Import range</dt><dd className="mono">{importRange ? `${importRange.min}–${importRange.max}` : "—"}</dd></div>
          <div><dt>Export range</dt><dd className="mono">{exportRange ? `${exportRange.min}–${exportRange.max}` : "—"}</dd></div>
        </dl>
        <label className="rail-select">
          <span>Tariff mode</span>
          <select value={tariffMode} onChange={(event) => setTariffMode(event.target.value as "flat" | "tou")}>
            <option value="flat">Flat rate (all intervals)</option>
            <option value="tou">Evening TOU ({`${touPeakWindow.start}:00–${touPeakWindow.end}:00`} peak)</option>
          </select>
        </label>
        <div className="rail-tariff-fields">
          <label>
            <span>{tariffMode === "tou" ? "Peak rate" : "Import rate"} ({currency}/kWh)</span>
            <input type="number" step="0.01" value={tariffForm.rate} aria-label="Import tariff rate" onChange={(event) => setTariffForm({ ...tariffForm, rate: event.target.value })} />
          </label>
          {tariffMode === "tou" && (
            <label>
              <span>Off-peak rate ({currency}/kWh)</span>
              <input type="number" step="0.01" value={tariffForm.offPeakRate} aria-label="Off-peak import tariff rate" onChange={(event) => setTariffForm({ ...tariffForm, offPeakRate: event.target.value })} />
            </label>
          )}
          <label>
            <span>Export credit ({currency}/kWh)</span>
            <input type="number" step="0.01" value={tariffForm.exportRate} aria-label="Export tariff rate" onChange={(event) => setTariffForm({ ...tariffForm, exportRate: event.target.value })} />
          </label>
        </div>
        <button type="button" className="rail-apply" disabled={isRunning} onClick={applyTariffs}>
          {isRunning ? "Engine running…" : "Apply tariffs & run"}
        </button>
        <p className="rail-note">Overwrites the 24 tariff inputs; per-interval edits remain possible in the Simulation Lab.</p>
      </section>

      <section className="rail-section">
        <h2 className="rail-title">G · Battery health and degradation</h2>
        <div className="rail-tariff-fields">
          <label>
            <span>State of health (0–1]</span>
            <input
              type="number"
              min="0"
              max="1"
              step="0.01"
              aria-label="Battery state of health"
              value={values.battery_state_of_health}
              onChange={(event) => onValuesChange({ ...values, battery_state_of_health: event.target.value })}
            />
          </label>
          <label>
            <span>Degradation penalty ({currency}/kWh)</span>
            <input
              type="number"
              min="0"
              step="0.001"
              aria-label="Battery degradation penalty"
              value={values.degradation_cost_per_kwh}
              onChange={(event) => onValuesChange({ ...values, degradation_cost_per_kwh: event.target.value })}
            />
          </label>
        </div>
        <button type="button" className="rail-apply" disabled={isRunning} onClick={applyCurrentInputs}>
          {isRunning ? "Engine running…" : "Apply battery health & run"}
        </button>
        <p className="rail-note">State of health statically scales usable capacity; calendar and cycle ageing are not modelled. The degradation penalty affects only the optimiser objective, not tariff costs or reported savings.</p>
      </section>

      <section className="rail-section">
        <h2 className="rail-title">H · Financial settings</h2>
        {activeMetrics ? (
          <dl className="rail-readout rail-readout-grid">
            <div><dt>Grid import cost</dt><dd className="mono">{activeMetrics.import_cost.toFixed(2)} {currency}</dd></div>
            <div><dt>Export revenue</dt><dd className="mono">{activeMetrics.export_credit.toFixed(2)} {currency}</dd></div>
            <div><dt>Net electricity cost</dt><dd className="mono">{activeMetrics.net_cost.toFixed(2)} {currency}</dd></div>
            <div>
              <dt>Savings vs baseline</dt>
              <dd className="mono">{savings !== null ? `${savings >= 0 ? "+" : "−"}${Math.abs(savings).toFixed(2)} ${currency}` : "not applicable"}</dd>
            </div>
          </dl>
        ) : <p className="rail-note">Run a scenario to see engine-calculated costs.</p>}
        <p className="rail-note">Costs are modeled estimates from the scenario tariffs, never measured bills. Savings exclude the degradation penalty.</p>
      </section>

      {railErrors.length > 0 && (
        <div className="rail-errors" role="alert">
          <strong>Inputs were not applied:</strong>
          <ul>{railErrors.map((message) => <li key={message}>{message}</li>)}</ul>
        </div>
      )}
    </aside>
  );
}
