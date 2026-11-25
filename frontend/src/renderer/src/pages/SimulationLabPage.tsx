import { useEffect, useRef, useState, type FormEvent } from "react";
import type { GridMindScenarioReport, RunHourlyScenarioPayload, RunSensitivityAnalysisPayload, SensitivityReport } from "../../../shared/protocol";
import { ScenarioResults } from "./HomePage";
import { FeedbackState } from "../components/FeedbackState";
import { SliderNumberField } from "../components/SliderNumberField";\nimport { SensitivityAnalysisPanel } from "./SensitivityAnalysisPanel";
import {
  validateScenarioForm,
  type BatteryFormKey,
  type ScenarioFormValues,
  type ScenarioSeriesKey,
} from "../scenario-form";

interface SimulationLabPageProps {
  values: ScenarioFormValues;
  report: GridMindScenarioReport | null;
  reportSource: "synthetic" | "custom" | null;
  isRunning: boolean;
  error: string | null;
  onValuesChange: (values: ScenarioFormValues) => void;
  onRun: (payload: RunHourlyScenarioPayload) => void;
  onReset: () => void;
}

const seriesColumns: { key: ScenarioSeriesKey; label: string; short: string; minimum: number | null }[] = [
  { key: "demand_kwh", label: "Demand (kWh)", short: "Demand", minimum: 0 },
  { key: "solar_generation_kwh", label: "Solar generation (kWh)", short: "Solar generation", minimum: 0 },
  { key: "import_rate_per_kwh", label: "Import tariff (currency/kWh)", short: "Import tariff", minimum: null },
  { key: "export_rate_per_kwh", label: "Export credit (currency/kWh)", short: "Export credit", minimum: null },
];

const batteryFields: { key: BatteryFormKey; label: string; unit: string; min: number }[] = [
  { key: "capacity_kwh", label: "Battery capacity", unit: "kWh", min: 0 },
  { key: "max_charge_power_kw", label: "Maximum charge power", unit: "kW", min: 0 },
  { key: "max_discharge_power_kw", label: "Maximum discharge power", unit: "kW", min: 0 },
  { key: "charge_efficiency", label: "Charge efficiency", unit: "fraction", min: 0 },
  { key: "discharge_efficiency", label: "Discharge efficiency", unit: "fraction", min: 0 },
  { key: "initial_soc_kwh", label: "Starting charge", unit: "kWh", min: 0 },
  { key: "min_soc_kwh", label: "Minimum charge", unit: "kWh", min: 0 },
  { key: "max_soc_kwh", label: "Maximum charge", unit: "kWh", min: 0 },
];

const batteryErrorTerms: Record<BatteryFormKey, string[]> = {
  capacity_kwh: ["battery capacity"],
  max_charge_power_kw: ["battery max charge power"],
  max_discharge_power_kw: ["battery max discharge power"],
  charge_efficiency: ["battery charge efficiency"],
  discharge_efficiency: ["battery discharge efficiency"],
  initial_soc_kwh: ["battery initial soc", "starting battery charge"],
  min_soc_kwh: ["battery min soc", "minimum battery charge"],
  max_soc_kwh: ["battery max soc", "maximum battery charge"],
};

/**
 * Slider ranges are convenience aids for pointer adjustments. The paired numeric
 * entry accepts any exact value the engine accepts, so the slider never limits
 * scenario expressiveness. Efficiency fields use a finer step than energy fields.
 */
const batterySliderSpec: Record<BatteryFormKey, { max: number; step: number }> = {
  capacity_kwh: { max: 20, step: 0.1 },
  max_charge_power_kw: { max: 10, step: 0.1 },
  max_discharge_power_kw: { max: 10, step: 0.1 },
  charge_efficiency: { max: 1, step: 0.01 },
  discharge_efficiency: { max: 1, step: 0.01 },
  initial_soc_kwh: { max: 20, step: 0.1 },
  min_soc_kwh: { max: 20, step: 0.1 },
  max_soc_kwh: { max: 20, step: 0.1 },
};

function enteredTotal(series: string[]): number | null {
  if (series.length !== 24 || series.some((value) => !value.trim() || !Number.isFinite(Number(value)))) return null;
  return series.reduce((total, value) => total + Number(value), 0);
}

function formatEnergy(value: number | null): string {
  return value === null ? "Incomplete" : value.toFixed(2) + " kWh";
}

export function SimulationLabPage({
  values, report, reportSource, isRunning, error, onValuesChange, onRun, onReset,
}: SimulationLabPageProps) {
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const errorSummary = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (validationErrors.length > 0) errorSummary.current?.focus();
  }, [validationErrors]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = validateScenarioForm(values);
    if (!result.ok) {
      setValidationErrors(result.errors);
      return;
    }
    setValidationErrors([]);
    onRun(result.payload);
  }

  function updateSeries(key: ScenarioSeriesKey, index: number, value: string) {
    const next = values[key].slice();
    next[index] = value;
    onValuesChange({ ...values, [key]: next });
    setValidationErrors([]);
  }

  function updateBattery(key: BatteryFormKey, value: string) {
    onValuesChange({ ...values, battery: { ...values.battery, [key]: value } });
    setValidationErrors([]);
  }

  function updateGrid(key: "max_import_power_kw" | "max_export_power_kw", value: string) {
    onValuesChange({ ...values, grid: { ...values.grid, [key]: value } });
    setValidationErrors([]);
  }

  function updatePv<K extends keyof ScenarioFormValues["pv"]>(key: K, value: ScenarioFormValues["pv"][K]) {
    onValuesChange({ ...values, pv: { ...values.pv, [key]: value } });
    setValidationErrors([]);
  }

  function updateStateOfHealth(value: string) {
    onValuesChange({ ...values, battery_state_of_health: value });
    setValidationErrors([]);
  }

  const nominalCapacity = Number(values.battery.capacity_kwh);
  const stateOfHealth = Number(values.battery_state_of_health);
  const validStateOfHealth = values.battery_state_of_health.trim() !== ""
    && Number.isFinite(stateOfHealth) && stateOfHealth > 0 && stateOfHealth <= 1;
  const usableCapacity = values.battery.capacity_kwh.trim() !== ""
    && Number.isFinite(nominalCapacity) && nominalCapacity > 0 && validStateOfHealth
    ? nominalCapacity * stateOfHealth
    : null;
  const demandTotal = enteredTotal(values.demand_kwh);
  const solarTotal = enteredTotal(values.solar_generation_kwh);
  const sohInvalid = validationErrors.some((issue) => {
    const text = issue.toLowerCase();
    return text.includes("state of health") || text.includes("usable battery capacity");
  });
  const usableCapacityErrors = validationErrors.filter((issue) =>
    issue.toLowerCase().includes("usable battery capacity"));
  const errorListId = "scenario-validation-errors";\n  const sensitivityScenario = validateScenarioForm(values);
  const gridImportInvalid = validationErrors.some((issue) => issue.startsWith("Grid maximum import power"));
  const gridExportInvalid = validationErrors.some((issue) => issue.startsWith("Grid maximum export power"));
  const pvInvalid = (term: string) => validationErrors.some((issue) => issue.toLowerCase().includes(term));
  const degradationInvalid = validationErrors.some((issue) => issue.startsWith("Battery degradation cost"));

  return <div className="page-stack simulation-lab">
    <header className="simulation-intro">
      <div className="simulation-intro-copy">
        <span className="eyebrow">SCENARIO WORKSPACE · LOCAL MODEL</span>
        <h1>Simulation lab</h1>
        <p>Shape a full day of household energy inputs, define the equipment and grid constraints, then run both strategies through the local Python engine.</p>
      </div>
      <div className={`simulation-run-indicator ${isRunning ? "is-running" : report ? "has-report" : ""}`} role="status">
        <span aria-hidden="true" />
        <div><strong>{isRunning ? "Calculating scenario" : report ? "Latest run available" : "Ready to configure"}</strong><small>{isRunning ? "Running locally on this device" : report ? "Results reflect the last completed run" : "No calculations are running"}</small></div>
      </div>
    </header>

    <section className="simulation-snapshot" aria-label="Scenario input summary">
      <div className="simulation-snapshot-card"><span>DAILY DEMAND ENTERED</span><strong>{formatEnergy(demandTotal)}</strong><small>Sum of 24 hourly demand values</small></div>
      <div className="simulation-snapshot-card"><span>SOLAR GENERATION ENTERED</span><strong>{formatEnergy(solarTotal)}</strong><small>Sum of 24 hourly generation values</small></div>
      <div className="simulation-snapshot-card"><span>USABLE BATTERY CAPACITY</span><strong>{usableCapacity !== null ? usableCapacity.toFixed(2) + " kWh" : "Incomplete"}</strong><small>{usableCapacity !== null ? `${nominalCapacity} kWh nominal · ${(stateOfHealth * 100).toFixed(0)}% state of health` : "Check capacity and state of health"}</small></div>
    </section>

    <FeedbackState kind="info" title="Local scenario estimates">
      Energy values are kWh per hourly interval, tariffs are currency per kWh, and the date uses Malaysia Time (MYT, UTC+08:00). A zero is valid, blank grid limits mean unlimited, and negative tariffs are allowed by the engine. Inputs stay in memory for this app session only.
    </FeedbackState>
    {error && <FeedbackState kind="warning" title="The scenario could not be completed">{error + " Review the inputs and try again."}</FeedbackState>}
    {validationErrors.length > 0 && <div className="validation-summary" id={errorListId} role="alert" tabIndex={-1} ref={errorSummary}>
      <strong>Correct these input issues before running the scenario:</strong>
      <ul>{validationErrors.slice(0, 8).map((item) => <li key={item}>{item}</li>)}</ul>
      {validationErrors.length > 8 && <p>{validationErrors.length - 8} additional issues also need attention.</p>}
    </div>}

    <form onSubmit={submit} noValidate>
      <section className="form-section simulation-section" aria-labelledby="scenario-details-title">
        <div className="form-section-heading"><div><span className="eyebrow">01 · SCENARIO</span><h2 id="scenario-details-title">Date and currency</h2><p className="section-description">Set the local simulation day and the currency used for all tariff and cost outputs.</p></div><button className="secondary-button" type="button" onClick={() => { onReset(); setValidationErrors([]); }}>Restore synthetic sample</button></div>
        <div className="form-settings-grid">
          <label className="form-control">Simulation date (MYT)<input type="date" value={values.start_date} aria-invalid={validationErrors.some((issue) => issue.includes("simulation date"))} onChange={(event) => { onValuesChange({ ...values, start_date: event.target.value }); setValidationErrors([]); }} /></label>
          <label className="form-control">Currency code<input type="text" maxLength={3} autoCapitalize="characters" value={values.currency} aria-describedby="currency-help" aria-invalid={validationErrors.some((issue) => issue.startsWith("Currency"))} onChange={(event) => { onValuesChange({ ...values, currency: event.target.value }); setValidationErrors([]); }} /><small id="currency-help">Three-letter code, for example MYR. Tariffs and costs use this code.</small></label>
        </div>
      </section>

      <section className="form-section simulation-section" aria-labelledby="hourly-profile-title">
        <div className="form-section-heading"><div><span className="eyebrow">02 · INPUT PROFILE</span><h2 id="hourly-profile-title">Hourly energy profile</h2><p className="section-description">Edit the demand, solar generation and tariff assumptions for each of the 24 hourly intervals.</p></div><span className="subtle-label">24 HOURS · MYT</span></div>
        <p className="form-help">The initial values are a synthetic demonstration profile. They are not measured household or facility data. All four series must contain exactly 24 finite values.</p>
        <div className="hourly-table-wrap"><table className="hourly-input-table"><caption>Energy per hourly interval and tariff per kWh</caption><thead><tr><th scope="col">Hour (MYT)</th>{seriesColumns.map((column) => <th key={column.key} scope="col">{column.label}</th>)}</tr></thead>
          <tbody>{Array.from({ length: 24 }, (_, index) => <tr key={index}><th scope="row">{index.toString().padStart(2, "0")}:00</th>
            {seriesColumns.map((column) => <td key={column.key}><label className="visually-hidden" htmlFor={column.key + "-" + index}>{column.short} at {index.toString().padStart(2, "0")}:00 MYT</label><input id={column.key + "-" + index} type="number" inputMode="decimal" step="any" min={column.minimum ?? undefined} value={values[column.key][index]} aria-invalid={validationErrors.some((issue) => issue.startsWith(column.short + " at " + index.toString().padStart(2, "0")))} onChange={(event) => updateSeries(column.key, index, event.target.value)} /></td>)}
          </tr>)}</tbody>
        </table></div>
      </section>

      <section className="form-section simulation-section" aria-labelledby="grid-settings-title">
        <div className="form-section-heading"><div><span className="eyebrow">03 · GRID CONNECTION</span><h2 id="grid-settings-title">Grid import and export limits</h2><p className="section-description">Model the maximum power that can flow between the property and the electricity grid.</p></div><span className="subtle-label">OPTIONAL CONSTRAINTS</span></div>
        <div className="form-settings-grid">
          <label className="form-control">Maximum grid import power (kW)<input type="number" min="0" step="any" inputMode="decimal" placeholder="Unlimited" aria-label="Maximum grid import power (kW)" value={values.grid.max_import_power_kw} aria-invalid={gridImportInvalid || undefined} aria-describedby="grid-import-help" onChange={(event) => updateGrid("max_import_power_kw", event.target.value)} /><small id="grid-import-help">Leave blank for unlimited imports. Enter 0 to prohibit grid imports.</small></label>
          <label className="form-control">Maximum grid export power (kW)<input type="number" min="0" step="any" inputMode="decimal" placeholder="Unlimited" aria-label="Maximum grid export power (kW)" value={values.grid.max_export_power_kw} aria-invalid={gridExportInvalid || undefined} aria-describedby="grid-export-help" onChange={(event) => updateGrid("max_export_power_kw", event.target.value)} /><small id="grid-export-help">Leave blank for unlimited exports. Enter 0 to prohibit grid exports.</small></label>
        </div>
      </section>

      <section className="form-section simulation-section" aria-labelledby="pv-settings-title">
        <div className="form-section-heading"><div><span className="eyebrow">04 · SOLAR CONDITIONS</span><h2 id="pv-settings-title">PV temperature derating</h2><p className="section-description">Optionally adjust solar output using a temperature-based PV model.</p></div><span className="subtle-label">{values.pv.enabled ? "ENABLED" : "DISABLED"}</span></div>
        <label className="simulation-toggle"><input type="checkbox" checked={values.pv.enabled} onChange={(event) => updatePv("enabled", event.target.checked)} /><span><strong>Enable PV temperature derating</strong><small>Uses ambient temperature and irradiance to estimate temperature-related output loss.</small></span></label>
        <div className={`simulation-advanced-fields ${values.pv.enabled ? "" : "is-disabled"}`} aria-label="PV temperature model parameters">
          <label className="form-control">Reference cell temperature (°C)<input type="number" step="any" value={values.pv.reference_temperature_c} disabled={!values.pv.enabled} aria-invalid={pvInvalid("pv reference temperature")} onChange={(event) => updatePv("reference_temperature_c", event.target.value)} /></label>
          <label className="form-control">Nominal operating cell temperature (°C)<input type="number" step="any" value={values.pv.noct_c} disabled={!values.pv.enabled} aria-invalid={pvInvalid("nominal operating cell temperature")} onChange={(event) => updatePv("noct_c", event.target.value)} /></label>
          <label className="form-control">Temperature coefficient (per °C)<input type="number" step="any" value={values.pv.temperature_coefficient_per_c} disabled={!values.pv.enabled} aria-invalid={pvInvalid("pv temperature coefficient")} onChange={(event) => updatePv("temperature_coefficient_per_c", event.target.value)} /></label>
          <label className="form-control">Ambient temperature (°C)<input type="number" step="any" value={values.pv.ambient_temperature_c} disabled={!values.pv.enabled} aria-invalid={pvInvalid("pv ambient temperature")} aria-describedby="pv-weather-help" onChange={(event) => updatePv("ambient_temperature_c", event.target.value)} /></label>
          <label className="form-control">Solar irradiance (W/m²)<input type="number" min="0" step="any" value={values.pv.solar_irradiance_w_m2} disabled={!values.pv.enabled} aria-invalid={pvInvalid("pv solar irradiance")} aria-describedby="pv-weather-help" onChange={(event) => updatePv("solar_irradiance_w_m2", event.target.value)} /></label>
        </div>
        <p className="form-help" id="pv-weather-help">When enabled, the ambient temperature and irradiance values are treated as constant across all 24 intervals. This is a simplified assumption, not a weather forecast.</p>
      </section>

      <section className="form-section simulation-section" aria-labelledby="battery-settings-title">
        <div className="form-section-heading"><div><span className="eyebrow">05 · STORAGE SYSTEM</span><h2 id="battery-settings-title">Battery configuration</h2><p className="section-description">Define the battery's usable energy range, power limits, efficiency and current condition.</p></div></div>
        <div className="battery-form-grid">{batteryFields.map((field) => {
          const invalid = validationErrors.some((issue) => batteryErrorTerms[field.key].some((term) => issue.toLowerCase().includes(term)));
          const spec = batterySliderSpec[field.key];
          return <SliderNumberField
            key={field.key}
            label={field.label}
            unit={field.unit}
            value={values.battery[field.key]}
            min={field.min}
            max={spec.max}
            step={spec.step}
            invalid={invalid}
            onValueChange={(value) => updateBattery(field.key, value)}
          />;
        })}<SliderNumberField
          label="Battery state of health"
          unit="fraction"
          value={values.battery_state_of_health}
          min={0}
          max={1}
          step={0.01}
          invalid={sohInvalid}
          helpId="battery-soh-help"
          onValueChange={updateStateOfHealth}
        /></div>
        <p className="form-help" id="battery-soh-help">State of health is the fraction of nominal capacity the battery can currently hold. Usable capacity: <strong>{usableCapacity !== null ? usableCapacity.toFixed(2) + " kWh" : "—"}</strong>{usableCapacity !== null ? ` (${nominalCapacity} kWh nominal × ${(stateOfHealth * 100).toFixed(0)}% SoH).` : "."} The default 1.0 means 100%. Calendar and cycle ageing are not modelled.</p>
        {usableCapacityErrors.map((issue) => <p key={issue} className="form-field-error">{issue}</p>)}
        <p className="form-help">Each battery setting pairs a slider with an exact numeric field. Efficiency is a fraction greater than 0 and at most 1. Battery charge limits must be consistent with usable capacity and starting charge.</p>
        <div className="degradation-setting">
          <label className="form-control">Battery degradation penalty (currency/kWh)<input type="number" min="0" step="any" inputMode="decimal" value={values.degradation_cost_per_kwh} aria-label="Battery degradation penalty (currency/kWh)" aria-invalid={degradationInvalid || undefined} aria-describedby="degradation-help" onChange={(event) => { onValuesChange({ ...values, degradation_cost_per_kwh: event.target.value }); setValidationErrors([]); }} /><small id="degradation-help">Optional cost applied to battery throughput in the optimisation objective. Leave at 0 to disable the penalty.</small></label>
        </div>
      </section>

      <div className="simulation-submit-bar">
        <div><strong>Ready to run your scenario?</strong><span>GridMind validates the inputs before sending them to the local Python engine.</span></div>
        <div className="form-actions"><button className="primary-button" type="submit" disabled={isRunning}>{isRunning ? <><span className="button-spinner" aria-hidden="true" /> Running Python engine…</> : "Validate and run scenario"}</button><button className="secondary-button" type="button" onClick={() => { onReset(); setValidationErrors([]); }} disabled={isRunning}>Reset sample</button></div>
      </div>
    </form>
    <SensitivityAnalysisPanel
      scenario={sensitivityScenario.ok ? sensitivityScenario.payload : null}
      report={sensitivityReport}
      loading={sensitivityLoading || isRunning}
      error={sensitivityError}
      stale={sensitivityStale}
      onRun={onRunSensitivity}
    />
    {isRunning && <FeedbackState kind="info" title="Running locally">The Python engine is calculating the baseline and GridMind cost comparison for this scenario.</FeedbackState>}
    {report && reportSource && <section className="form-results" aria-label="Latest completed scenario results"><div className="section-heading"><div><span className="eyebrow">LATEST RUN</span><h2>Scenario results</h2></div><span className="subtle-label">{reportSource === "custom" ? "USER INPUTS" : "SYNTHETIC EXAMPLE"}</span></div><ScenarioResults report={report} source={reportSource} /></section>}
  </div>;
}
