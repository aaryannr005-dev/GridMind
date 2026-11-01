import { useEffect, useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { HomePage } from "./pages/HomePage";
import { PlaceholderPage } from "./pages/PlaceholderPage";
import { getNavigationItem } from "./navigation";
import type { PageId } from "./types";
import { demoScenario } from "./demo-scenario";
import type { GridMindScenarioReport, RunHourlyScenarioPayload } from "../../shared/protocol";
import { SimulationLabPage } from "./pages/SimulationLabPage";
import { ReportsPage } from "./pages/ReportsPage";
import { createInitialScenarioValues, type ScenarioFormValues } from "./scenario-form";
import { DEFAULT_DASHBOARD_PREFERENCES, loadDashboardPreferences, saveDashboardPreferences, type DashboardPreferences } from "./dashboard-preferences";
import { PreferencesPage } from "./pages/PreferencesPage";
import { EnergyMapPage } from "./pages/EnergyMapPage";
import { ThemeToggle } from "./components/ThemeToggle";
import { applyTheme, loadTheme, saveTheme, type ThemeName } from "./theme";

export default function App() {
  const [activePage, setActivePage] = useState<PageId>("home");
  const [report, setReport] = useState<GridMindScenarioReport | null>(null);
  const [reportSource, setReportSource] = useState<"synthetic" | "custom" | null>(null);
  const [scenarioValues, setScenarioValues] = useState<ScenarioFormValues>(createInitialScenarioValues);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dashboardPreferences, setDashboardPreferences] = useState<DashboardPreferences>(loadDashboardPreferences);
  const [preferencesSaved, setPreferencesSaved] = useState(true);
  const [theme, setTheme] = useState<ThemeName>(loadTheme);
  const page = getNavigationItem(activePage);
  const engineStatus = isRunning ? "ENGINE RUNNING" : report ? "ENGINE RESPONDED" : "ENGINE IDLE";

  useEffect(() => {
    applyTheme(theme);
    // Read once on mount; subsequent changes go through updateTheme.
  }, []);

  function updateTheme(next: ThemeName): void {
    setTheme(next);
    applyTheme(next);
    saveTheme(next);
  }

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

  function updateDashboardPreferences(preferences: DashboardPreferences): void {
    setDashboardPreferences(preferences);
    setPreferencesSaved(saveDashboardPreferences(preferences));
  }

  function resetDashboardPreferences(): void {
    updateDashboardPreferences({ ...DEFAULT_DASHBOARD_PREFERENCES });
  }

  return (
    <div className="app-shell">
      <Sidebar activePage={activePage} onNavigate={setActivePage} />
      <main className="main-panel">
        <header className="topbar">
          <div className="breadcrumb"><span>GRIDMIND</span><span className="crumb-separator">/</span><strong>{page.label}</strong></div>
          <div className="topbar-right"><span className="connection-indicator"><i className={isRunning ? "engine-running" : report ? "engine-ready" : ""} />{engineStatus}</span><ThemeToggle theme={theme} onChange={updateTheme} /><div className="avatar" aria-label="Local workspace">GM</div></div>
        </header>
        <div className="page-content">
          {activePage === "home"
            ? <HomePage report={report} reportSource={reportSource} isRunning={isRunning} error={error} onRunDemo={runDemo} dashboardPreferences={dashboardPreferences} />
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
              : activePage === "reports"
                ? <ReportsPage report={report} source={reportSource} onOpenSimulation={() => setActivePage("simulation")} />
                : activePage === "energy-map"
                  ? <EnergyMapPage />
                  : activePage === "settings"
                  ? <PreferencesPage preferences={dashboardPreferences} onChange={updateDashboardPreferences} onReset={resetDashboardPreferences} isSaved={preferencesSaved} />
                  : <PlaceholderPage page={page} />}
          <footer className="app-footer"><span>GRIDMIND <b>•</b> LOCAL ENERGY SIMULATION</span><span>{report ? "SCENARIO LOADED · " + (reportSource === "custom" ? "USER INPUTS" : "SYNTHETIC EXAMPLE") : "NO SCENARIO LOADED"}</span></footer>
        </div>
      </main>
    </div>
  );
}
