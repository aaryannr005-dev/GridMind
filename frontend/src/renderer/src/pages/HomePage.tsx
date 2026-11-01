import type { GridMindScenarioReport } from "../../../shared/protocol";
import { ScenarioCharts } from "../components/ScenarioCharts";
import { FeedbackState } from "../components/FeedbackState";
import { DEFAULT_DASHBOARD_PREFERENCES, type DashboardPreferences } from "../dashboard-preferences";

interface HomePageProps {
  report: GridMindScenarioReport | null;
  reportSource: "synthetic" | "custom" | null;
  isRunning: boolean;
  error: string | null;
  onRunDemo: () => void;
  dashboardPreferences: DashboardPreferences;
}

function formatNumber(value: number | null | undefined, digits = 2): string {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) : "Not available";
}

function signed(value: number, unit: string): string {
  return (value >= 0 ? "+" : "−") + formatNumber(Math.abs(value)) + " " + unit;
}

export function ScenarioResults({ report, source, preferences = DEFAULT_DASHBOARD_PREFERENCES }: { report: GridMindScenarioReport; source: "synthetic" | "custom"; preferences?: DashboardPreferences }) {
  const optimized = report.gridmind;
  const comparison = report.comparison;
  const signalOf = (value: number): "good" | "bad" | "neutral" => value > 0 ? "good" : value < 0 ? "bad" : "neutral";
  const cards = [
    { label: "Baseline net cost", value: formatNumber(report.baseline.net_cost) + " " + report.currency, detail: "Modeled for this scenario", signal: "neutral" as const },
    { label: "GridMind net cost", value: optimized ? formatNumber(optimized.net_cost) + " " + report.currency : "Not available", detail: "Approximate cost optimizer", signal: "neutral" as const },
    { label: "Cost difference", value: comparison ? signed(comparison.cost_savings, report.currency) : "Not available", detail: "Baseline minus GridMind; positive means lower modeled cost", signal: comparison ? signalOf(comparison.cost_savings) : "neutral" },
    { label: "Grid import reduction", value: comparison ? signed(comparison.grid_import_reduction_kwh, "kWh") : "Not available", detail: "Baseline imports minus GridMind imports", signal: comparison ? signalOf(comparison.grid_import_reduction_kwh) : "neutral" },
  ];

  return <div className="results-stack">
    <FeedbackState kind="info" title="Modeled scenario results">
      {(source === "synthetic"
        ? "Synthetic demonstration inputs were sent to the local Python engine."
        : "Your scenario inputs were sent to the local Python engine.")
        + " Values below are estimates for this one-day scenario, not measured data or guaranteed savings."}
    </FeedbackState>
    <div className="result-meta"><span>{report.period_start.slice(0, 10)} · {report.interval_count} intervals · {report.interval_minutes}-minute intervals</span><span>MYT (UTC+08:00) · {report.currency}</span></div>
    {preferences.showMetrics && <div className="metric-grid" aria-label="Scenario comparison metrics">
      {cards.map((card) => <article className="metric-card" key={card.label} data-signal={card.signal}><span>{card.label}</span><strong>{card.value}</strong><small>{card.detail}</small></article>)}
    </div>}
    {preferences.showCharts && <section className="results-section">
      <div className="section-heading"><div><span className="eyebrow">REAL ENGINE OUTPUTS</span><h2>Energy and battery profile</h2></div><span className="subtle-label">{report.interval_count} INTERVALS</span></div>
      <ScenarioCharts baseline={report.baseline_intervals} optimized={report.gridmind_intervals} intervalMinutes={report.interval_minutes} />
    </section>}
    {preferences.showComparison && <section className="results-section">
      <div className="section-heading"><div><span className="eyebrow">BASELINE VS GRIDMIND</span><h2>Detailed comparison</h2></div></div>
      <div className="table-scroll"><table className="comparison-table"><caption>Engine-calculated metrics; costs in {report.currency}, energy in kWh unless noted.</caption>
        <thead><tr><th scope="col">Metric</th><th scope="col">Baseline</th><th scope="col">GridMind</th><th scope="col">Difference</th></tr></thead>
        <tbody>
          <tr><th scope="row">Net cost ({report.currency})</th><td>{formatNumber(report.baseline.net_cost)}</td><td>{formatNumber(optimized?.net_cost)}</td><td>{formatNumber(comparison?.cost_savings)}</td></tr>
          <tr><th scope="row">Grid imports (kWh)</th><td>{formatNumber(report.baseline.grid_import_kwh)}</td><td>{formatNumber(optimized?.grid_import_kwh)}</td><td>{formatNumber(comparison?.grid_import_reduction_kwh)}</td></tr>
          <tr><th scope="row">Solar self-consumption (kWh)</th><td>{formatNumber(report.baseline.solar_self_consumption_kwh)}</td><td>{formatNumber(optimized?.solar_self_consumption_kwh)}</td><td>{formatNumber(comparison?.solar_self_consumption_change_kwh)}</td></tr>
          <tr><th scope="row">Grid exports (kWh)</th><td>{formatNumber(report.baseline.grid_export_kwh)}</td><td>{formatNumber(optimized?.grid_export_kwh)}</td><td>{formatNumber(comparison?.solar_export_change_kwh)}</td></tr>
          <tr><th scope="row">Battery charged (kWh)</th><td>{formatNumber(report.baseline.battery_charge_kwh)}</td><td>{formatNumber(optimized?.battery_charge_kwh)}</td><td>{formatNumber(comparison?.battery_charge_change_kwh)}</td></tr>
          <tr><th scope="row">Battery discharged (kWh)</th><td>{formatNumber(report.baseline.battery_discharge_kwh)}</td><td>{formatNumber(optimized?.battery_discharge_kwh)}</td><td>{formatNumber(comparison?.battery_discharge_change_kwh)}</td></tr>
        </tbody>
      </table></div>
      {comparison && <p className="comparison-note">Differences follow the engine report: cost and grid import are baseline minus GridMind; other differences are GridMind minus baseline. Positive values are not automatically better for every objective.</p>}
    </section>}
    {preferences.showAssumptions && <details className="assumptions-panel"><summary>Assumptions and model limitations</summary><div className="assumption-columns"><div><h3>Assumptions</h3><ul>{report.assumptions.map((item) => <li key={item}>{item}</li>)}</ul></div><div><h3>Limitations</h3><ul>{report.limitations.map((item) => <li key={item}>{item}</li>)}</ul></div></div><p>Scenario fingerprint: <code>{report.scenario_fingerprint}</code></p></details>}
  </div>;
}

export function HomePage({ report, reportSource, isRunning, error, onRunDemo, dashboardPreferences }: HomePageProps) {
  return (
    <div className="page-stack">
      <section className="welcome-panel dashboard-welcome">
        <div className="welcome-copy">
          <div className="eyebrow"><span className="eyebrow-line" /> ENERGY SYSTEMS WORKSPACE</div>
          <h1>Make every energy<br /><span>decision explainable.</span></h1>
          <p>Explore actual Python engine outputs with clear units, comparisons, and model assumptions.</p>
          <div className="welcome-tags"><span>LOCAL-FIRST</span><span>REPRODUCIBLE</span><span>PYTHON ENGINE</span></div>
        </div>
        <div className="orbital-art" aria-hidden="true"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="orbit orbit-three" /><div className="orb-core">G<span>↗</span></div><div className="orbit-label label-top">ENERGY FLOW</div><div className="orbit-label label-bottom">MODEL · VALIDATE · COMPARE</div></div>
      </section>
      <section className="demo-panel" aria-labelledby="demo-title">
        <div><span className="eyebrow">SYNTHETIC EXAMPLE</span><h2 id="demo-title">Try the dashboard with a sample day</h2><p>Runs a fixed, clearly synthetic 24-hour profile through the local Python engine. No results are prefilled or fabricated.</p></div>
        <button className="primary-button" type="button" onClick={onRunDemo} disabled={isRunning}>{isRunning ? <><span className="button-spinner" aria-hidden="true" /> Running engine…</> : report ? "Run sample again" : "Run sample scenario"}</button>
      </section>
      {error && <FeedbackState kind="warning" title="Scenario could not be run">{error + " You can try again; no new results were shown."}</FeedbackState>}
      {isRunning && <FeedbackState kind="info" title="Running locally">The Python engine is calculating the baseline and GridMind comparison. This may take a few seconds.</FeedbackState>}
      {report && reportSource
        ? <ScenarioResults report={report} source={reportSource} preferences={dashboardPreferences} />
        : <section className="empty-dashboard"><span className="empty-icon">⌁</span><div><h2>No scenario results yet</h2><p>Run the synthetic example or enter a scenario in the Simulation Lab to see engine-generated charts and comparisons.</p></div></section>}
    </div>
  );
}
