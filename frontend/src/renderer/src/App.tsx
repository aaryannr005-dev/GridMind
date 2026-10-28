import { useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { HomePage } from "./pages/HomePage";
import { PlaceholderPage } from "./pages/PlaceholderPage";
import { getNavigationItem } from "./navigation";
import type { PageId } from "./types";
import { demoScenario } from "./demo-scenario";
import type { GridMindScenarioReport, RunHourlyScenarioPayload } from "../../shared/protocol";
import { SimulationLabPage } from "./pages/SimulationLabPage";
import { createInitialScenarioValues, type ScenarioFormValues } from "./scenario-form";

export default function App() {
  const [activePage, setActivePage] = useState<PageId>("home");
  const [report, setReport] = useState<GridMindScenarioReport | null>(null);
  const [reportSource, setReportSource] = useState<"synthetic" | "custom" | null>(null);
  const [scenarioValues, setScenarioValues] = useState<ScenarioFormValues>(createInitialScenarioValues);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const page = getNavigationItem(activePage);
  const engineStatus = isRunning ? "ENGINE RUNNING" : report ? "ENGINE RESPONDED" : "ENGINE IDLE";

  async function runScenario(payload: RunHourlyScenarioPayload, source: "synthetic" | "custom"): Promise<void> {
    if (!window.gridmindDesktop) {
      setError("The local engine bridge is not available in this app window.");
      return;
    }
    setIsRunning(true);
    setError(null);
    try {
      const result = await window.gridmindDesktop.runHourlyScenario(payload);
      setReport(result);
      setReportSource(source);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The local engine could not complete the scenario.");
    } finally {
      setIsRunning(false);
    }
  }

  function runDemo(): void {
    void runScenario(demoScenario, "synthetic");
  }

  return (
    <div className="app-shell">
      <Sidebar activePage={activePage} onNavigate={setActivePage} />
      <main className="main-panel">
        <header className="topbar">
          <div className="breadcrumb"><span>GRIDMIND</span><span className="crumb-separator">/</span><strong>{page.label}</strong></div>
          <div className="topbar-right"><span className="connection-indicator"><i className={isRunning ? "engine-running" : report ? "engine-ready" : ""} />{engineStatus}</span><div className="avatar" aria-label="Local workspace">GM</div></div>
        </header>
        <div className="page-content">
          {activePage === "home"
            ? <HomePage report={report} reportSource={reportSource} isRunning={isRunning} error={error} onRunDemo={runDemo} />
            : activePage === "simulation"
              ? <SimulationLabPage
                values={scenarioValues}
                report={report}
                reportSource={reportSource}
                isRunning={isRunning}
                error={error}
                onValuesChange={setScenarioValues}
                onRun={(payload) => { void runScenario(payload, "custom"); }}
                onReset={() => setScenarioValues(createInitialScenarioValues())}
              />
              : <PlaceholderPage page={page} />}
          <footer className="app-footer"><span>GRIDMIND <b>•</b> LOCAL ENERGY SIMULATION</span><span>{report ? "SCENARIO LOADED · " + (reportSource === "custom" ? "USER INPUTS" : "SYNTHETIC EXAMPLE") : "NO SCENARIO LOADED"}</span></footer>
        </div>
      </main>
    </div>
  );
}
