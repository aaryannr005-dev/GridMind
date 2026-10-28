import type { GridMindScenarioReport } from "../../../shared/protocol";
import { ScenarioResults } from "./HomePage";
import { FeedbackState } from "../components/FeedbackState";

interface ReportsPageProps {
  report: GridMindScenarioReport | null;
  source: "synthetic" | "custom" | null;
  onOpenSimulation: () => void;
}

export function ReportsPage({ report, source, onOpenSimulation }: ReportsPageProps) {
  return (
    <div className="page-stack">
      <div className="page-intro">
        <span className="eyebrow">ANALYSIS</span>
        <h1>Reports</h1>
        <p>Review the latest completed scenario using results returned by the local Python engine.</p>
      </div>
      {report && source ? (
        <>
          <FeedbackState kind="info" title="Session report">
            This report is available only while the app is open. It contains modeled scenario estimates, not measured data or guaranteed savings.
          </FeedbackState>
          <section className="results-section report-identity" aria-labelledby="report-identity-title">
            <div className="section-heading">
              <div><span className="eyebrow">REPRODUCIBILITY</span><h2 id="report-identity-title">Scenario record</h2></div>
              <span className="subtle-label">{source === "custom" ? "USER INPUTS" : "SYNTHETIC EXAMPLE"}</span>
            </div>
            <dl className="report-metadata">
              <div><dt>Scenario fingerprint</dt><dd><code>{report.scenario_fingerprint}</code></dd></div>
              <div><dt>Period (MYT)</dt><dd>{report.period_start} to {report.period_end}</dd></div>
              <div><dt>Intervals</dt><dd>{report.interval_count} × {report.interval_minutes} minutes</dd></div>
              <div><dt>Battery capacity</dt><dd>{report.battery_capacity_kwh} kWh</dd></div>
              <div><dt>Currency</dt><dd>{report.currency}</dd></div>
            </dl>
          </section>
          <ScenarioResults report={report} source={source} />
        </>
      ) : (
        <section className="empty-dashboard report-empty">
          <span className="empty-icon" aria-hidden="true">▤</span>
          <div><h2>No completed reports yet</h2><p>Run a sample or a custom 24-hour scenario. The report will show engine results, comparisons, assumptions, and model limitations.</p></div>
          <button className="primary-button" type="button" onClick={onOpenSimulation}>Open Simulation Lab</button>
        </section>
      )}
    </div>
  );
}
