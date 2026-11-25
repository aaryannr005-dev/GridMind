import { useState } from "react";\nimport type { GridMindScenarioReport, EngineInterval } from "../../../shared/protocol";
import { ScenarioResults } from "./HomePage";
import { FeedbackState } from "../components/FeedbackState";
import type { ScenarioFormValues } from "../scenario-form";
import "./report-analytics.css";

interface ReportsPageProps {
  report: GridMindScenarioReport | null;
  source: "synthetic" | "custom" | null;
  scenarioSnapshot: ScenarioFormValues | null;
  resultsAreStale: boolean;
  onOpenSimulation: () => void;\n  onSaveComparison: (name: string) => string | null;
}

function csvCell(value: string | number | null | undefined): string {
  const text = value == null ? "" : String(value);
  return /[",\r\n]/.test(text) ? '"' + text.replaceAll('"', '""') + '"' : text;
}

function intervalValues(prefix: string, interval: EngineInterval | null) {
  if (!interval) return [];
  return [
    [prefix + "_demand_kwh", interval.demand_kwh],
    [prefix + "_solar_generation_kwh", interval.solar_generation_kwh],
    [prefix + "_direct_solar_kwh", interval.direct_solar_kwh],
    [prefix + "_battery_charge_kwh", interval.battery_charge_kwh],
    [prefix + "_battery_discharge_kwh", interval.battery_discharge_kwh],
    [prefix + "_grid_import_kwh", interval.grid_import_kwh],
    [prefix + "_grid_export_kwh", interval.grid_export_kwh],
    [prefix + "_state_of_charge_percent", interval.state_of_charge_percent],
    [prefix + "_import_cost", interval.import_cost],
    [prefix + "_export_credit", interval.export_credit],
    [prefix + "_net_cost", interval.net_cost],
  ] as [string, number][];
}

function exportCsv(report: GridMindScenarioReport): void {
  const optimized = report.gridmind_intervals;
  const headers = [
    "timestamp_myt",
    ...intervalValues("baseline", report.baseline_intervals[0]).map(([key]) => key),
    ...(optimized ? intervalValues("gridmind", optimized[0]).map(([key]) => key) : []),
  ];
  const rows = report.baseline_intervals.map((baseline, index) => {
    const gridmind = optimized?.[index] ?? null;
    return [
      baseline.timestamp,
      ...intervalValues("baseline", baseline).map(([, value]) => value),
      ...(gridmind ? intervalValues("gridmind", gridmind).map(([, value]) => value) : []),
    ];
  });
  const summary = [
    ["report_type", "GridMind modeled scenario report"],
    ["scenario_fingerprint", report.scenario_fingerprint],
    ["period_start_myt", report.period_start],
    ["period_end_myt", report.period_end],
    ["interval_minutes", report.interval_minutes],
    ["currency", report.currency],
    ["baseline_import_cost", report.baseline.import_cost],
    ["baseline_export_credit", report.baseline.export_credit],
    ["baseline_net_cost", report.baseline.net_cost],
    ["gridmind_import_cost", report.gridmind?.import_cost ?? ""],
    ["gridmind_export_credit", report.gridmind?.export_credit ?? ""],
    ["gridmind_net_cost", report.gridmind?.net_cost ?? ""],
    ["modeled_cost_savings", report.comparison?.cost_savings ?? ""],
    ["baseline_grid_import_kwh", report.baseline.grid_import_kwh],
    ["gridmind_grid_import_kwh", report.gridmind?.grid_import_kwh ?? ""],
    ["cost_basis", "Net tariff cost = import charges minus export credits; excludes optional battery degradation penalty in optimizer objective"],
    ["note", "Modeled estimates, not measured performance or guaranteed savings"],
  ];
  const content = [
    ...summary.map((row) => row.map(csvCell).join(",")),
    "",
    headers.map(csvCell).join(","),
    ...rows.map((row) => row.map(csvCell).join(",")),
  ].join("\r\n");
  const blob = new Blob(["\uFEFF", content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "gridmind-report-" + report.period_start.slice(0, 10) + ".csv";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Keep the object URL alive briefly so the browser can begin the download.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function format(value: number | undefined, digits = 2): string {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) : "Not available";
}


function seriesPath(values: number[], width: number, height: number, max: number): string {
  if (values.length === 0) return "";
  return values.map((value, index) => {
    const x = 36 + (width - 52) * index / Math.max(values.length - 1, 1);
    const y = height - 28 - (height - 48) * Math.max(0, value) / max;
    return (index === 0 ? "M" : "L") + x.toFixed(1) + " " + y.toFixed(1);
  }).join(" ");
}

function formatMoney(value: number | null | undefined, currency: string): string {
  return typeof value === "number" && Number.isFinite(value)
    ? value.toFixed(2) + " " + currency
    : "—";
}

function FinancialBreakdown({ report }: { report: GridMindScenarioReport }) {
  const baseline = report.baseline;
  const optimized = report.gridmind;
  const rows = [
    { label: "Import charges", baseline: baseline.import_cost, optimized: optimized?.import_cost ?? null },
    { label: "Export credits", baseline: baseline.export_credit, optimized: optimized?.export_credit ?? null },
    { label: "Net tariff cost", baseline: baseline.net_cost, optimized: optimized?.net_cost ?? null },
  ];
  const degradationAssumption = report.assumptions.find((item) =>
    item.includes("dispatch objective includes a battery-degradation penalty totaling"));
  return (
    <section className="results-section report-financial-breakdown" aria-labelledby="financial-breakdown-title">
      <div className="section-heading">
        <div><span className="eyebrow">FINANCIAL ANALYSIS</span><h2 id="financial-breakdown-title">Tariff cost breakdown</h2></div>
        <span className="subtle-label">TARIFF-ONLY COSTS</span>
      </div>
      <div className="report-financial-summary">
        <article><span>Baseline tariff bill</span><strong>{formatMoney(baseline.net_cost, report.currency)}</strong><small>Import charges less export credits</small></article>
        <article><span>GridMind tariff bill</span><strong>{formatMoney(optimized?.net_cost, report.currency)}</strong><small>Approximate cost-optimised dispatch</small></article>
        <article><span>Modeled tariff savings</span><strong>{formatMoney(report.comparison?.cost_savings, report.currency)}</strong><small>Positive means a lower modeled tariff bill</small></article>
      </div>
      <div className="report-financial-table-wrap">
        <table className="report-financial-table">
          <caption>Financial components for the completed scenario</caption>
          <thead><tr><th scope="col">Component</th><th scope="col">Baseline</th><th scope="col">GridMind</th><th scope="col">Change (GridMind − baseline)</th></tr></thead>
          <tbody>{rows.map((row) => <tr key={row.label}>
            <th scope="row">{row.label}</th>
            <td>{formatMoney(row.baseline, report.currency)}</td>
            <td>{formatMoney(row.optimized, report.currency)}</td>
            <td>{row.optimized === null ? "—" : formatMoney(row.optimized - row.baseline, report.currency)}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <p className="report-financial-footnote">Net tariff cost is calculated as import charges minus export credits. These figures do not include any optional battery-degradation penalty used by the optimiser.</p>
      {degradationAssumption && <p className="report-financial-objective-note">{degradationAssumption}</p>}
    </section>
  );
}

function ReportVisualAnalytics({ report }: { report: GridMindScenarioReport }) {
  const base = report.baseline_intervals;
  const optimized = report.gridmind_intervals;
  const maxValue = Math.max(1, ...base.map((item) => Math.max(item.demand_kwh, item.solar_generation_kwh, item.grid_import_kwh)),
    ...(optimized ?? []).map((item) => Math.max(item.grid_import_kwh, item.grid_export_kwh)));
  const width = 760;
  const height = 250;
  const baseImport = base.map((item) => item.grid_import_kwh);
  const optimizedImport = optimized?.map((item) => item.grid_import_kwh) ?? [];
  const energyRows = [
    { label: "Direct solar to load", value: report.baseline.direct_solar_consumption_kwh, color: "var(--chart-solar)" },
    { label: "Battery discharge", value: report.baseline.battery_discharge_kwh, color: "var(--chart-battery)" },
    { label: "Grid imports", value: report.baseline.grid_import_kwh, color: "var(--chart-import)" },
  ];
  const demandTotal = Math.max(report.baseline.total_demand_kwh, 0.000001);
  return (
    <section className="results-section report-visual-analytics" aria-labelledby="report-visual-title">
      <div className="section-heading">
        <div><span className="eyebrow">VISUAL ANALYTICS</span><h2 id="report-visual-title">How the system behaved</h2></div>
        <span className="subtle-label">{report.interval_count} INTERVALS</span>
      </div>
      <div className="report-chart-panel">
        <div className="report-chart-heading"><div><h3>Interval energy profile</h3><p>Actual interval values returned by the simulation engine</p></div><span>kWh / interval</span></div>
        <div className="report-chart-legend">
          <span><i className="demand" />Demand</span><span><i className="solar" />Solar generation</span>
          <span><i className="baseline" />Baseline grid import</span>
          {optimized && <span><i className="optimized" />GridMind grid import</span>}
        </div>
        <svg className="report-trend-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Line chart comparing demand, solar generation and grid imports for each simulation interval">
          {[0, 1, 2, 3].map((tick) => {
            const y = height - 28 - (height - 48) * tick / 3;
            return <g key={tick}><line x1="36" x2={width - 16} y1={y} y2={y} className="report-chart-gridline" /><text x="29" y={y + 4} textAnchor="end" className="report-chart-axis">{(maxValue * tick / 3).toFixed(1)}</text></g>;
          })}
          <path d={seriesPath(base.map((item) => item.demand_kwh), width, height, maxValue)} className="report-series demand" />
          <path d={seriesPath(base.map((item) => item.solar_generation_kwh), width, height, maxValue)} className="report-series solar" />
          <path d={seriesPath(baseImport, width, height, maxValue)} className="report-series baseline" />
          {optimized && <path d={seriesPath(optimizedImport, width, height, maxValue)} className="report-series optimized" />}
          <text x="36" y={height - 7} className="report-chart-axis">Start</text>
          <text x={width / 2} y={height - 7} textAnchor="middle" className="report-chart-axis">Simulation interval</text>
          <text x={width - 16} y={height - 7} textAnchor="end" className="report-chart-axis">End</text>
        </svg>
      </div>
      <div className="report-analytics-grid">
        <div className="report-chart-panel">
          <div className="report-chart-heading"><div><h3>Baseline demand coverage</h3><p>How modeled household demand was supplied</p></div></div>
          <div className="report-coverage-list">
            {energyRows.map((item) => <div className="report-coverage-row" key={item.label}>
              <div><span>{item.label}</span><strong>{format(item.value)} kWh</strong></div>
              <div className="report-coverage-track"><span style={{ width: `${Math.min(100, Math.max(0, item.value / demandTotal * 100))}%`, background: item.color }} /></div>
              <small>{(item.value / demandTotal * 100).toFixed(1)}% of demand</small>
            </div>)}
          </div>
          <p className="report-analytics-footnote">Coverage is calculated from the baseline run. Values are model outputs, not meter readings.</p>
        </div>
        <div className="report-chart-panel">
          <div className="report-chart-heading"><div><h3>Dispatch comparison</h3><p>Totals across the modeled period</p></div></div>
          <div className="report-dispatch-table">
            <div className="report-dispatch-head"><span>Metric</span><span>Baseline</span><span>GridMind</span></div>
            {[
              ["Grid imports", report.baseline.grid_import_kwh, report.gridmind?.grid_import_kwh],
              ["Grid exports", report.baseline.grid_export_kwh, report.gridmind?.grid_export_kwh],
              ["Battery charged", report.baseline.battery_charge_kwh, report.gridmind?.battery_charge_kwh],
              ["Battery discharged", report.baseline.battery_discharge_kwh, report.gridmind?.battery_discharge_kwh],
            ].map(([label, baselineValue, gridmindValue]) => <div className="report-dispatch-row" key={String(label)}>
              <span>{label}</span><strong>{format(Number(baselineValue))}</strong><strong>{gridmindValue == null ? "—" : format(Number(gridmindValue))}</strong>
            </div>)}
          </div>
          <p className="report-analytics-footnote">All energy values are kWh. Dispatch differences depend on the configured objective and constraints.</p>
        </div>
      </div>
    </section>
  );
}

export function ReportsPage({ report, source, scenarioSnapshot, resultsAreStale, onOpenSimulation }: ReportsPageProps) {
  return (
    <div className="page-stack reports-page">
      <div className="page-intro report-page-intro">
        <span className="eyebrow">ANALYSIS & EXPORT</span>
        <h1>Reports</h1>
        <p>A reproducible record of the latest completed scenario, its modeled outcomes and the assumptions behind them.</p>
      </div>
      {report && source ? (
        <>
          <FeedbackState kind="info" title="Modeled results, not measured performance">
            This report contains estimates generated by the local Python engine for the scenario shown. Savings are not guaranteed and should not be treated as measured household performance.
          </FeedbackState>
          {resultsAreStale && <FeedbackState kind="warning" title="Current inputs differ from this report">
            This report remains tied to the last successful run. Exported files will preserve these completed results, not your newer unsimulated edits.
            <button className="text-action-button" type="button" onClick={onOpenSimulation}>Review current inputs</button>
          </FeedbackState>}
          <section className="results-section comparison-save-panel" aria-label="Save scenario for comparison">\n            <div><span className="eyebrow">SCENARIO BENCHMARKING</span><h2>Keep this run for comparison</h2><p>Save its modeled metrics on this device so you can compare it with another completed scenario later.</p></div>\n            <div className="comparison-save-controls"><label className="form-control">Case name<input value={comparisonName} maxLength={48} onChange={(event) => setComparisonName(event.target.value)} placeholder="e.g. 5 kW solar, 10 kWh battery" /></label><button className="secondary-button" type="button" onClick={saveCurrentComparison} disabled={!comparisonName.trim()}>Save case</button></div>\n            {comparisonFeedback && <p className={comparisonSaved ? "form-help" : "form-field-error"} role="status">{comparisonFeedback}</p>}\n          </section>\n          <section className="report-export-bar" aria-label="Report export actions">
            <div><strong>Export this run</strong><span>PDF for sharing · CSV for spreadsheet analysis</span></div>
            <div className="report-export-actions">
              <button className="secondary-button" type="button" onClick={() => window.print()}>Print / Save as PDF</button>
              <button className="primary-button" type="button" onClick={() => exportCsv(report)}>Export CSV</button>
            </div>
          </section>
          <section className="results-section report-identity" aria-labelledby="report-identity-title">
            <div className="section-heading">
              <div><span className="eyebrow">REPRODUCIBILITY</span><h2 id="report-identity-title">Scenario record</h2></div>
              <span className="subtle-label">{source === "custom" ? "USER INPUTS" : "SYNTHETIC EXAMPLE"}</span>
            </div>
            <dl className="report-metadata">
              <div><dt>Scenario fingerprint</dt><dd><code>{report.scenario_fingerprint}</code></dd></div>
              <div><dt>Period (MYT)</dt><dd>{report.period_start} to {report.period_end}</dd></div>
              <div><dt>Intervals</dt><dd>{report.interval_count} × {report.interval_minutes} minutes</dd></div>
              <div><dt>Battery capacity</dt><dd>{report.battery_capacity_kwh} kWh nominal</dd></div>
              <div><dt>Currency</dt><dd>{report.currency}</dd></div>
            </dl>
            {scenarioSnapshot && <div className="report-input-summary">
              <h3>Configuration snapshot</h3>
              <div className="report-input-grid">
                <div><span>Battery state of health</span><strong>{format(Number(scenarioSnapshot.battery_state_of_health) * 100, 0)}%</strong></div>
                <div><span>Usable battery capacity</span><strong>{format(Number(scenarioSnapshot.battery.capacity_kwh) * Number(scenarioSnapshot.battery_state_of_health))} kWh</strong></div>
                <div><span>Grid import limit</span><strong>{scenarioSnapshot.grid.max_import_power_kw.trim() || "Unlimited"}{scenarioSnapshot.grid.max_import_power_kw.trim() ? " kW" : ""}</strong></div>
                <div><span>Grid export limit</span><strong>{scenarioSnapshot.grid.max_export_power_kw.trim() || "Unlimited"}{scenarioSnapshot.grid.max_export_power_kw.trim() ? " kW" : ""}</strong></div>
                <div><span>PV temperature derating</span><strong>{scenarioSnapshot.pv.enabled ? "Enabled" : "Disabled"}</strong></div>
                <div><span>Degradation penalty</span><strong>{scenarioSnapshot.degradation_cost_per_kwh || "0"} {report.currency}/kWh</strong></div>
              </div>
            </div>}
          </section>
          <section className="results-section report-outcome" aria-label="Executive outcome summary">
            <div className="section-heading"><div><span className="eyebrow">EXECUTIVE SUMMARY</span><h2>What changed?</h2></div></div>
            <div className="report-outcome-grid">
              <article><span>Baseline net cost</span><strong>{format(report.baseline.net_cost)} {report.currency}</strong><small>Self-consumption-first dispatch</small></article>
              <article><span>GridMind net cost</span><strong>{format(report.gridmind?.net_cost)} {report.currency}</strong><small>Approximate cost-optimised dispatch</small></article>
              <article><span>Modeled cost difference</span><strong>{format(report.comparison?.cost_savings)} {report.currency}</strong><small>Positive means lower modeled cost with GridMind</small></article>
              <article><span>Grid import reduction</span><strong>{format(report.comparison?.grid_import_reduction_kwh)} kWh</strong><small>Baseline imports minus GridMind imports</small></article>
            </div>
          </section>
          <FinancialBreakdown report={report} />
          <ReportVisualAnalytics report={report} />
          <ScenarioResults report={report} source={source} />
          <section className="results-section report-validation">
            <div className="section-heading"><div><span className="eyebrow">ENGINE CHECKS</span><h2>Model integrity</h2></div></div>
            <div className="report-check-grid">
              {[
                ["Energy balance", report.baseline.energy_balance_valid && (report.gridmind?.energy_balance_valid ?? true)],
                ["Battery constraints", report.baseline.battery_constraints_valid && (report.gridmind?.battery_constraints_valid ?? true)],
                ["Grid constraints", report.baseline.grid_constraints_valid && (report.gridmind?.grid_constraints_valid ?? true)],
                ["Tariff calculations", report.baseline.tariff_costs_valid && (report.gridmind?.tariff_costs_valid ?? true)],
              ].map(([label, valid]) => <div key={String(label)} data-valid={Boolean(valid)}><span>{label}</span><strong>{valid ? "Passed" : "Check required"}</strong></div>)}
            </div>
            <p className="comparison-note">Checks are the validation flags returned by the engine for the reported run. They do not independently validate real-world equipment or utility-meter data.</p>
          </section>
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
