import { useEffect, useRef, useState, type FormEvent } from "react";
import type { GridMindScenarioReport, RunHourlyScenarioPayload } from "../../../shared/protocol";
import { ScenarioResults } from "./HomePage";
import { FeedbackState } from "../components/FeedbackState";
import { SliderNumberField } from "../components/SliderNumberField";
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

const batteryFields: { key: BatteryFormKey; label: string; unit: string; min: number; max?: number }[] = [
  { key: "capacity_kwh", label: "Battery capacity", unit: "kWh", min: 0 },
  { key: "max_charge_power_kw", label: "Maximum charge power", unit: "kW", min: 0 },
  { key: "max_discharge_power_kw", label: "Maximum discharge power", unit: "kW", min: 0 },
  { key: "charge_efficiency", label: "Charge efficiency", unit: "fraction", min: 0, max: 1 },
  { key: "discharge_efficiency", label: "Discharge efficiency", unit: "fraction", min: 0, max: 1 },
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
 * Slider ranges are convenience aids for pointer adjustments; the paired numeric
 * entry accepts any exact value the engine accepts, so the slider never limits
 * scenario expressiveness, and it stretches to follow values typed beyond its
 * nominal bounds. Efficiency fields use a finer step than coarse energy fields.
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

  const errorListId = "scenario-validation-errors";

  return <div className="page-stack simulation-lab">
    <div className="page-intro"><span className="eyebrow">MODEL · 24 HOURLY INTERVALS</span><h1>Simulation lab</h1><p>Enter one day of demand, solar generation, tariffs, and battery settings. The local Python engine validates and calculates both strategies.</p></div>
    <FeedbackState kind="info" title="Local scenario estimates">
      Energy values are kWh per interval, tariffs are currency per kWh, and the date uses Malaysia Time (MYT, UTC+08:00). A zero is valid. Negative tariffs are allowed by the engine. No values are saved when you close the app.
    </FeedbackState>
    {error && <FeedbackState kind="warning" title="The scenario could not be completed">{error + " Review the inputs and try again."}</FeedbackState>}
    {validationErrors.length > 0 && <div className="validation-summary" id={errorListId} role="alert" tabIndex={-1} ref={errorSummary}>
      <strong>Correct these input issues before running the scenario:</strong>
      <ul>{validationErrors.slice(0, 8).map((item) => <li key={item}>{item}</li>)}</ul>
      {validationErrors.length > 8 && <p>{validationErrors.length - 8} additional issues also need attention.</p>}
    </div>}
    <form onSubmit={submit} noValidate>
      <section className="form-section" aria-labelledby="scenario-details-title">
        <div className="form-section-heading"><div><span className="eyebrow">SCENARIO</span><h2 id="scenario-details-title">Date and currency</h2></div><button className="secondary-button" type="button" onClick={() => { onReset(); setValidationErrors([]); }}>Restore synthetic sample</button></div>
        <div className="form-settings-grid">
          <label className="form-control">Simulation date (MYT)<input type="date" value={values.start_date} aria-invalid={validationErrors.some((issue) => issue.includes("simulation date"))} onChange={(event) => { onValuesChange({ ...values, start_date: event.target.value }); setValidationErrors([]); }} /></label>
          <label className="form-control">Currency code<input type="text" maxLength={3} autoCapitalize="characters" value={values.currency} aria-describedby="currency-help" aria-invalid={validationErrors.some((issue) => issue.startsWith("Currency"))} onChange={(event) => { onValuesChange({ ...values, currency: event.target.value }); setValidationErrors([]); }} /><small id="currency-help">Three-letter code, for example MYR. Tariffs and costs use this code.</small></label>
        </div>
      </section>
      <section className="form-section" aria-labelledby="hourly-profile-title">
        <div className="form-section-heading"><div><span className="eyebrow">INPUT DATA</span><h2 id="hourly-profile-title">Hourly energy profile</h2></div><span className="subtle-label">24 ROWS · MYT</span></div>
        <p className="form-help">The initial values are a synthetic demonstration profile. Edit any cell. This does not represent measured household or facility data.</p>
        <div className="hourly-table-wrap"><table className="hourly-input-table"><caption>Energy per hourly interval and tariff per kWh</caption><thead><tr><th scope="col">Hour (MYT)</th>{seriesColumns.map((column) => <th key={column.key} scope="col">{column.label}</th>)}</tr></thead>
          <tbody>{Array.from({ length: 24 }, (_, index) => <tr key={index}><th scope="row">{index.toString().padStart(2, "0")}:00</th>
            {seriesColumns.map((column) => <td key={column.key}><label className="visually-hidden" htmlFor={column.key + "-" + index}>{column.short} at {index.toString().padStart(2, "0")}:00 MYT</label><input id={column.key + "-" + index} type="number" inputMode="decimal" step="any" min={column.minimum ?? undefined} value={values[column.key][index]} aria-invalid={validationErrors.some((issue) => issue.startsWith(column.short + " at " + index.toString().padStart(2, "0")))} onChange={(event) => updateSeries(column.key, index, event.target.value)} /></td>)}
          </tr>)}</tbody>
        </table></div>
      </section>
      <section className="form-section" aria-labelledby="battery-settings-title">
        <div className="form-section-heading"><div><span className="eyebrow">EQUIPMENT</span><h2 id="battery-settings-title">Battery settings</h2></div></div>
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
        })}</div>
        <p className="form-help">Each battery setting pairs a slider for fine adjustments with a numeric field for exact typed values; either control updates the other. Efficiency is a fraction from greater than 0 through 1 (for example, 0.95 means 95%). Battery charge limits must be consistent with capacity and starting charge.</p>
      </section>
      <div className="form-actions"><button className="primary-button" type="submit" disabled={isRunning}>{isRunning ? <><span className="button-spinner" aria-hidden="true" /> Running Python engine…</> : "Validate and run scenario"}</button><span>Inputs remain in memory for this app session only.</span></div>
    </form>
    {isRunning && <FeedbackState kind="info" title="Running locally">The Python engine is calculating the baseline and GridMind cost comparison for this scenario.</FeedbackState>}
    {report && reportSource && <section className="form-results" aria-label="Latest completed scenario results"><div className="section-heading"><div><span className="eyebrow">LATEST RUN</span><h2>Scenario results</h2></div><span className="subtle-label">{reportSource === "custom" ? "USER INPUTS" : "SYNTHETIC EXAMPLE"}</span></div><ScenarioResults report={report} source={reportSource} /></section>}
  </div>;
}
