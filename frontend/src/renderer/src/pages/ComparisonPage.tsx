import { useState } from "react";
import {
  MAX_SAVED_SCENARIOS,
  removeSavedScenario,
  type SavedScenario,
} from "../saved-scenarios";
import "./comparison-page.css";

interface ComparisonPageProps {
  scenarios: SavedScenario[];
  onScenariosChange: (scenarios: SavedScenario[]) => void;
}

type MetricKey = "net_cost" | "grid_import_kwh" | "grid_export_kwh"
  | "solar_self_consumption_ratio" | "battery_charge_kwh" | "battery_discharge_kwh";

const metrics: { key: MetricKey; label: string; unit: "money" | "energy" | "ratio"; lowerIsBetter?: boolean }[] = [
  { key: "net_cost", label: "Net tariff cost", unit: "money", lowerIsBetter: true },
  { key: "grid_import_kwh", label: "Grid imports", unit: "energy", lowerIsBetter: true },
  { key: "grid_export_kwh", label: "Grid exports", unit: "energy" },
  { key: "solar_self_consumption_ratio", label: "Solar self-consumption", unit: "ratio" },
  { key: "battery_charge_kwh", label: "Battery charged", unit: "energy" },
  { key: "battery_discharge_kwh", label: "Battery discharged", unit: "energy" },
];

function valueFor(scenario: SavedScenario, key: MetricKey): number | null {
  const value = scenario.gridmind === null ? scenario.baseline[key] : scenario.gridmind[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function format(value: number | null, unit: "money" | "energy" | "ratio", currency: string): string {
  if (value === null) return "Unavailable";
  if (unit === "money") return value.toFixed(2) + " " + currency;
  if (unit === "ratio") return (value * 100).toFixed(1) + "%";
  return value.toFixed(2) + " kWh";
}

function deltaLabel(a: number | null, b: number | null, unit: "money" | "energy" | "ratio", currency: string): string {
  if (a === null || b === null) return "—";
  const delta = b - a;
  const prefix = delta > 0 ? "+" : delta < 0 ? "−" : "";
  return prefix + format(Math.abs(delta), unit, currency);
}

export function ComparisonPage({ scenarios, onScenariosChange }: ComparisonPageProps) {
  const [leftId, setLeftId] = useState(scenarios[0]?.id ?? "");
  const [rightId, setRightId] = useState(scenarios[1]?.id ?? "");
  const [strategy, setStrategy] = useState<"gridmind" | "baseline">("gridmind");
  const left = scenarios.find((item) => item.id === leftId) ?? scenarios[0] ?? null;
  const right = scenarios.find((item) => item.id === rightId) ?? scenarios[1] ?? null;
  const canCompare = left !== null && right !== null && left.id !== right.id;
  const selected = useMemo(() => scenarios.map((item) => item.id), [scenarios]);

  function remove(id: string) {
    try {
      const next = removeSavedScenario(id);
      onScenariosChange(next);
      if (leftId === id) setLeftId(next[0]?.id ?? "");
      if (rightId === id) setRightId(next.find((item) => item.id !== leftId)?.id ?? "");
    } catch (reason) {
      window.alert(reason instanceof Error ? reason.message : "Could not remove this case.");
    }
  }

  const metricsAvailable = strategy === "baseline" || (left?.gridmind !== null && right?.gridmind !== null);

  return <div className="page-stack comparison-page">
    <div className="page-intro">
      <span className="eyebrow">PHASE 6B · SCENARIO BENCHMARKING</span>
      <h1>Compare scenarios</h1>
      <p>Save completed runs and compare their modeled outcomes side by side. Each saved case keeps its own currency, period and interval resolution.</p>
    </div>
    <section className="comparison-library-panel">
      <div className="section-heading">
        <div><span className="eyebrow">LOCAL COMPARISON LIBRARY</span><h2>Saved cases</h2></div>
        <span className="subtle-label">{scenarios.length} / {MAX_SAVED_SCENARIOS} SAVED</span>
      </div>
      {scenarios.length === 0 ? <div className="comparison-empty">
        <h3>No saved scenarios yet</h3>
        <p>Complete a simulation, open Analytics and save the run as a comparison case. Saved cases stay on this device.</p>
      </div> : <div className="comparison-saved-list">
        {scenarios.map((item) => <article className="comparison-saved-item" key={item.id}>
          <div><strong>{item.name}</strong><span>{item.period_start.slice(0, 10)} · {item.interval_count} intervals · {item.currency}</span><small>Saved {new Date(item.saved_at).toLocaleString()}</small></div>
          <button type="button" className="text-action-button" onClick={() => remove(item.id)} aria-label={"Remove " + item.name}>Remove</button>
        </article>)}
      </div>}
    </section>
    {scenarios.length >= 2 && <section className="comparison-workspace-panel">
      <div className="section-heading"><div><span className="eyebrow">SIDE-BY-SIDE ANALYSIS</span><h2>Outcome comparison</h2></div></div>
      <div className="comparison-selectors">
        <label className="form-control">Case A
          <select value={left?.id ?? ""} onChange={(event) => setLeftId(event.target.value)}>
            {scenarios.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label className="form-control">Case B
          <select value={right?.id ?? ""} onChange={(event) => setRightId(event.target.value)}>
            {scenarios.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label className="form-control">Dispatch result
          <select value={strategy} onChange={(event) => setStrategy(event.target.value as "gridmind" | "baseline")}>
            <option value="gridmind">GridMind optimised</option>
            <option value="baseline">Self-consumption-first baseline</option>
          </select>
        </label>
      </div>
      {!canCompare ? <p className="form-help">Choose two different saved cases to compare their outcomes.</p>
        : !metricsAvailable ? <div className="validation-summary" role="status">An optimised result is missing from one or both saved cases. Select the baseline strategy to compare the available results.</div>
        : <div className="comparison-table-wrap">
          <table className="comparison-table">
            <thead><tr><th>Metric</th><th>{left.name}</th><th>{right.name}</th><th>Change (B − A)</th></tr></thead>
            <tbody>{metrics.map((metric) => {
              const a = strategy === "baseline" ? left.baseline[metric.key] : valueFor(left, metric.key);
              const b = strategy === "baseline" ? right.baseline[metric.key] : valueFor(right, metric.key);
              return <tr key={metric.key}>
                <th scope="row">{metric.label}</th>
                <td>{format(a, metric.unit, left.currency)}</td>
                <td>{format(b, metric.unit, right.currency)}</td>
                <td>{left.currency === right.currency ? deltaLabel(a, b, metric.unit, left.currency) : "Different currencies"}</td>
              </tr>;
            })}</tbody>
          </table>
          {left.currency !== right.currency && <p className="form-help">The cases use different currencies. Values are shown in their original currencies; no exchange-rate conversion is applied.</p>}
          <p className="comparison-footnote">A negative change means Case B is lower than Case A. Lower cost and grid imports are not automatically better if they come with other trade-offs. Battery charge and discharge show throughput, not battery wear or lifespan.</p>
        </div>}
    </section>}
  </div>;
}
