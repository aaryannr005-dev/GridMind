import { useState } from "react";
import type {
  RunSensitivityAnalysisPayload,
  RunHourlyScenarioPayload,
  SensitivityMetric,
  SensitivityParameter,
  SensitivityReport,
  SensitivityStrategy,
} from "../../../shared/protocol";

interface SensitivityAnalysisPanelProps {
  scenario: RunHourlyScenarioPayload | null;
  report: SensitivityReport | null;
  loading: boolean;
  error: string | null;
  stale: boolean;
  onRun: (payload: RunSensitivityAnalysisPayload) => void;
}

const multipliers = [0.5, 0.75, 1, 1.25, 1.5];

const parameterLabels: Record<SensitivityParameter, string> = {
  demand: "Household demand",
  solar_generation: "Solar generation",
  import_tariff: "Import tariff",
  export_tariff: "Export tariff",
};

const metricLabels: Record<SensitivityMetric, string> = {
  net_cost: "Net energy cost",
  grid_import_kwh: "Grid imports",
  grid_export_kwh: "Grid exports",
  solar_self_consumption_ratio: "Solar self-consumption ratio",
};

function formatValue(value: number | null, metric: SensitivityMetric, currency: string): string {
  if (value === null) return "Not available";
  if (metric === "net_cost") return value.toFixed(2) + " " + currency;
  if (metric === "solar_self_consumption_ratio") return (value * 100).toFixed(1) + "%";
  return value.toFixed(2) + " kWh";
}

export function SensitivityAnalysisPanel({
  scenario, report, loading, error, stale, onRun,
}: SensitivityAnalysisPanelProps) {
  const [parameter, setParameter] = useState<SensitivityParameter>("demand");
  const [metric, setMetric] = useState<SensitivityMetric>("net_cost");
  const [strategy, setStrategy] = useState<SensitivityStrategy>("gridmind");
  const currency = scenario?.currency ?? report?.currency ?? "MYR";

  function submit() {
    if (!scenario || loading) return;
    onRun({ scenario, parameter, multipliers, metric, strategy });
  }

  const scale = Math.max(0.000001, ...(report?.points ?? [])
    .filter((point) => point.feasible && point.metric_value !== null)
    .map((point) => Math.abs(point.metric_value ?? 0)));

  return <section className="form-section simulation-section sensitivity-panel" aria-labelledby="sensitivity-title">
    <div className="form-section-heading">
      <div><span className="eyebrow">06 · WHAT-IF ANALYSIS</span><h2 id="sensitivity-title">Sensitivity analysis</h2>
        <p className="section-description">Change one input dimension at a time and see how the selected outcome responds. All other scenario settings stay fixed.</p></div>
      <span className="subtle-label">5 DETERMINISTIC CASES</span>
    </div>
    <div className="sensitivity-controls">
      <label className="form-control">Input to vary
        <select value={parameter} onChange={(event) => setParameter(event.target.value as SensitivityParameter)}>
          {Object.entries(parameterLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <label className="form-control">Outcome metric
        <select value={metric} onChange={(event) => setMetric(event.target.value as SensitivityMetric)}>
          {Object.entries(metricLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <label className="form-control">Dispatch strategy
        <select value={strategy} onChange={(event) => setStrategy(event.target.value as SensitivityStrategy)}>
          <option value="gridmind">GridMind optimiser</option>
          <option value="baseline">Self-consumption-first baseline</option>
        </select>
      </label>
      <button className="primary-button" type="button" onClick={submit} disabled={!scenario || loading}>
        {loading ? <><span className="button-spinner" aria-hidden="true" /> Analysing…</> : "Run sensitivity sweep"}
      </button>
    </div>
    <p className="form-help">Each case scales the selected input to 50%, 75%, 100%, 125% or 150% of its current value. These are user-defined stress cases, not probability ranges or forecasts.</p>
    {!scenario && <p className="form-field-error">Correct the scenario inputs above before running sensitivity analysis.</p>}
    {error && <div className="validation-summary" role="alert">{error}</div>}
    {stale && report && <div className="stale-results-banner" role="status"><div><strong>These sensitivity results use an earlier scenario snapshot.</strong><span>Run the sweep again to apply your latest edits.</span></div></div>}
    {report && !stale && <>
      <div className="sensitivity-summary">
        <div><span>BASELINE VALUE</span><strong>{formatValue(report.baseline_value, report.metric, report.currency)}</strong></div>
        <div><span>INPUT DIMENSION</span><strong>{parameterLabels[report.parameter]}</strong></div>
        <div><span>DISPATCH METHOD</span><strong>{strategy === "gridmind" ? "GridMind optimiser" : "Self-consumption-first"}</strong></div>
      </div>
      <div className="sensitivity-results" role="img" aria-label={`Sensitivity results for ${parameterLabels[report.parameter]} and ${metricLabels[report.metric]}`}>
        {report.points.map((point) => <div className="sensitivity-point" key={point.multiplier}>
          <span className="sensitivity-multiplier">{Math.round(point.multiplier * 100)}%</span>
          <div className="sensitivity-track"><span className={`sensitivity-bar ${point.feasible ? "is-feasible" : "is-infeasible"}`} style={{ width: point.feasible && point.metric_value !== null ? Math.max(2, Math.abs(point.metric_value) / scale * 100) + "%" : "0%" }} /></div>
          <strong>{point.feasible ? formatValue(point.metric_value, report.metric, report.currency) : "Infeasible"}</strong>
        </div>)}
      </div>
      <div className="hourly-table-wrap">
        <table className="hourly-input-table sensitivity-table">
          <caption>Detailed sensitivity outcomes</caption>
          <thead><tr><th scope="col">Input scale</th><th scope="col">Outcome</th><th scope="col">Absolute change</th><th scope="col">Percentage change</th><th scope="col">Status</th></tr></thead>
          <tbody>{report.points.map((point) => <tr key={point.multiplier}>
            <th scope="row">{Math.round(point.multiplier * 100)}%</th>
            <td>{formatValue(point.metric_value, report.metric, report.currency)}</td>
            <td>{formatValue(point.absolute_change, report.metric, report.currency)}</td>
            <td>{point.percentage_change === null ? "Not defined" : point.percentage_change.toFixed(1) + "%"}</td>
            <td>{point.feasible ? <span className="sensitivity-status-ok">Feasible</span> : <span className="sensitivity-status-error" title={point.error ?? undefined}>Infeasible</span>}</td>
          </tr>)}</tbody>
        </table>
      </div>
      {report.points.some((point) => !point.feasible) && <p className="form-help">Infeasible cases remain visible. A hard model constraint prevented those scenarios from completing; they are not treated as zero-cost outcomes.</p>}
    </>}
  </section>;
}
