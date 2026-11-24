import { type Dispatch, type SetStateAction } from "react";
import type { GridMindScenarioReport, RunHourlyScenarioPayload } from "../../../shared/protocol";
import { ScenarioCharts } from "../components/ScenarioCharts";
import { FeedbackState } from "../components/FeedbackState";
import { PowerFlowDiagram } from "../components/PowerFlowDiagram";
import { ChartWorkspace } from "../components/ChartWorkspace";
import { ControlRail, type StrategyId } from "../components/ControlRail";
import { DEFAULT_DASHBOARD_PREFERENCES, type DashboardPreferences } from "../dashboard-preferences";
import type { ScenarioFormValues } from "../scenario-form";

interface HomePageProps {\n  displayName: string;
  report: GridMindScenarioReport | null;
  reportSource: "synthetic" | "custom" | null;
  isRunning: boolean;
  error: string | null;
  onRunDemo: () => void;
  onRunScenario: (payload: RunHourlyScenarioPayload) => void;
  dashboardPreferences: DashboardPreferences;
  scenarioValues: ScenarioFormValues;
  onValuesChange: (values: ScenarioFormValues) => void;
  playhead: number | null;
  onPlayheadChange: Dispatch<SetStateAction<number | null>>;
  playing: boolean;
  onPlayingChange: Dispatch<SetStateAction<boolean>>;
  speed: number;
  onSpeedChange: Dispatch<SetStateAction<number>>;
  strategy: StrategyId;
  onStrategyChange: Dispatch<SetStateAction<StrategyId>>;
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

export function HomePage({
  report, reportSource, isRunning, error, onRunDemo, onRunScenario, dashboardPreferences,
  scenarioValues, onValuesChange,
  playhead, onPlayheadChange, playing, onPlayingChange, speed, onSpeedChange, strategy, onStrategyChange,
}: HomePageProps) {
  const strategyIntervals = strategy === "gridmind" && report?.gridmind_intervals
    ? report.gridmind_intervals
    : report?.baseline_intervals ?? [];

  return (
    <div className="page-stack">
      <section className="hero-band">
        <div className="hero-copy">
          <h1>Welcome back, {displayName}. Here's your energy overview.</h1>
          <p className="hero-lede">
            The workspace sends your scenario to the local Python engine and steps through
            24 hourly intervals in Malaysia time, comparing self-consumption dispatch with
            cost-optimised dispatch interval by interval.
          </p>
        </div>
        <div className="hero-run">
          <button className="primary-button" type="button" onClick={onRunDemo} disabled={isRunning}>
            {isRunning ? <><span className="button-spinner" aria-hidden="true" /> Running engine…</> : report ? "Run sample again" : "Run sample scenario"}
          </button>
          <p>Runs the bundled synthetic example: a fixed demand profile with clear-sky solar. No results are prefilled or reused between runs.</p>
        </div>
      </section>
      {error && <FeedbackState kind="warning" title="Scenario could not be run">{error + " You can try again; no new results were shown."}</FeedbackState>}
      {isRunning && !report && <FeedbackState kind="info" title="Running locally">The Python engine is calculating the baseline and GridMind comparison. This may take a few seconds.</FeedbackState>}
      <div className="workspace">
        <ControlRail
          report={report}
          strategy={strategy}
          onStrategyChange={onStrategyChange}
          playhead={playhead}
          onPlayheadChange={onPlayheadChange}
          playing={playing}
          onPlayingChange={onPlayingChange}
          speed={speed}
          onSpeedChange={onSpeedChange}
          values={scenarioValues}
          onValuesChange={onValuesChange}
          onRunScenario={onRunScenario}
          isRunning={isRunning}
        />
        <div className="workspace-main">
          <section className="flow-panel" aria-label="Power flow diagram">
            <div className="flow-head">
              <h2>Power flow</h2>
              <span className="subtle-label">{report ? `${report.interval_count} ENGINE INTERVALS · ${report.currency}` : "AWAITING SCENARIO"}</span>
            </div>
            {report
              ? <PowerFlowDiagram intervals={strategyIntervals} intervalMinutes={report.interval_minutes} playhead={playhead} playing={playing} />
              : <p className="flow-placeholder">Run a scenario to populate the flow diagram with engine results.</p>}
          </section>
          {report && reportSource && dashboardPreferences.showCharts && (
            <ChartWorkspace
              intervals={strategyIntervals}
              intervalMinutes={report.interval_minutes}
              currency={report.currency}
              importRates={scenarioValues.import_rate_per_kwh.map(Number)}
              exportRates={scenarioValues.export_rate_per_kwh.map(Number)}
            />
          )}
          {report && reportSource
            ? <ScenarioResults report={report} source={reportSource} preferences={dashboardPreferences} />
            : <section className="empty-dashboard"><span className="empty-icon">⌁</span><div><h2>No scenario results yet</h2><p>Run the synthetic example, apply a load profile or enter a scenario in the Simulation Lab to see engine-generated charts and comparisons.</p></div></section>}
        </div>
      </div>
    </div>
  );
}

// (Tariff rates that fail to parse simply don't plot; ChartWorkspace shows an
// honest "not recorded" notice instead of a fabricated series.)
