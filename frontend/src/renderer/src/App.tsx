import { useEffect, useState } from "react";
import { TopNavTabs } from "./components/TopNavTabs";
import { WelcomeScreen } from "./components/WelcomeScreen";
import { HomePage } from "./pages/HomePage";
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
import { AboutPage } from "./pages/AboutPage";
import { ThemeToggle } from "./components/ThemeToggle";
import { applyTheme, loadTheme, saveTheme, type ThemeName } from "./theme";
import { loadDisplayName, saveDisplayName } from "./profile";
import type { StrategyId } from "./components/ControlRail";

export default function App() {
  const [activePage, setActivePage] = useState<PageId>("home");
  const [displayName, setDisplayName] = useState(loadDisplayName);
  const [profileSaved, setProfileSaved] = useState(true);
  const [report, setReport] = useState<GridMindScenarioReport | null>(null);
  const [reportSource, setReportSource] = useState<"synthetic" | "custom" | null>(null);
  const [reportScenarioValues, setReportScenarioValues] = useState<ScenarioFormValues | null>(null);
  const [reportTariffs, setReportTariffs] = useState<{ importRates: number[]; exportRates: number[] } | null>(null);
  const [scenarioValues, setScenarioValues] = useState<ScenarioFormValues>(createInitialScenarioValues);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dashboardPreferences, setDashboardPreferences] = useState<DashboardPreferences>(loadDashboardPreferences);
  const [preferencesSaved, setPreferencesSaved] = useState(true);
  const [theme, setTheme] = useState<ThemeName>(loadTheme);
  const [playhead, setPlayhead] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [strategy, setStrategy] = useState<StrategyId>("baseline");
  const page = getNavigationItem(activePage);
  const resultsAreStale = report !== null && reportScenarioValues !== null
    && JSON.stringify(scenarioValues) !== JSON.stringify(reportScenarioValues);

  useEffect(() => {
    applyTheme(theme);
  }, []);

  useEffect(() => {
    setPlayhead(null);
    setPlaying(false);
    setStrategy("baseline");
  }, [report]);

  function updateTheme(next: ThemeName): void {
    setTheme(next);
    applyTheme(next);
    saveTheme(next);
  }

  function updateDisplayName(value: string): void {
    const normalized = value.trim().replace(/\s+/g, " ").slice(0, 40);
    const saved = saveDisplayName(normalized);
    if (saved) setDisplayName(normalized);
    setProfileSaved(saved);
  }

  async function runScenario(
    payload: RunHourlyScenarioPayload,
    source: "synthetic" | "custom",
    valuesSnapshot: ScenarioFormValues = scenarioValues,
  ): Promise<void> {
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
      setReportScenarioValues(JSON.parse(JSON.stringify(valuesSnapshot)) as ScenarioFormValues);
      setReportTariffs({
        importRates: [...payload.import_rate_per_kwh],
        exportRates: [...payload.export_rate_per_kwh],
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The local engine could not complete the scenario.");
    } finally {
      setIsRunning(false);
    }
  }

  function updateDashboardPreferences(preferences: DashboardPreferences): void {
    setDashboardPreferences(preferences);
    setPreferencesSaved(saveDashboardPreferences(preferences));
  }

  function resetDashboardPreferences(): void {
    updateDashboardPreferences({ ...DEFAULT_DASHBOARD_PREFERENCES });
  }

  if (!displayName) {
    return <WelcomeScreen onContinue={updateDisplayName} />;
  }

  return (
    <div className="app-shell">
      <main className="main-panel">
        <TopNavTabs activePage={activePage} onNavigate={setActivePage} />
        <div className="workspace-frame">
          <div className="workspace-status">
            <span className="crumb-label">{page.eyebrow} · {page.label}</span>
            <ThemeToggle theme={theme} onChange={updateTheme} />
          </div>
          {resultsAreStale && !isRunning && (
            <div className="stale-results-banner" role="status">
              <div><strong>Scenario inputs changed since the latest run.</strong><span>The results and charts still represent the previous input set. Run the scenario again to refresh them.</span></div>
              <button type="button" onClick={() => setActivePage("simulation")}>Review and rerun</button>
            </div>
          )}
          <div className="page-content">
            {activePage === "home"
              ? <HomePage
                displayName={displayName}
                report={report}
                reportSource={reportSource}
                reportTariffs={reportTariffs}
                isRunning={isRunning}
                error={error}
                onRunDemo={() => { void runScenario(demoScenario, "synthetic", scenarioValues); }}
                onRunScenario={(payload, snapshot) => { void runScenario(payload, "custom", snapshot); }}
                dashboardPreferences={dashboardPreferences}
                scenarioValues={scenarioValues}
                onValuesChange={setScenarioValues}
                playhead={playhead}
                onPlayheadChange={setPlayhead}
                playing={playing}
                onPlayingChange={setPlaying}
                speed={speed}
                onSpeedChange={setSpeed}
                strategy={strategy}
                onStrategyChange={setStrategy}
              />
              : activePage === "simulation"
                ? <SimulationLabPage
                  values={scenarioValues}
                  report={report}
                  reportSource={reportSource}
                  isRunning={isRunning}
                  error={error}
                  onValuesChange={setScenarioValues}
                  onRun={(payload) => { void runScenario(payload, "custom", scenarioValues); }}
                  onReset={() => setScenarioValues(createInitialScenarioValues())}
                />
                : activePage === "reports"
                  ? <ReportsPage report={report} source={reportSource} onOpenSimulation={() => setActivePage("simulation")} />
                  : activePage === "energy-map"
                    ? <EnergyMapPage />
                    : activePage === "settings"
                      ? <PreferencesPage
                        preferences={dashboardPreferences}
                        onChange={updateDashboardPreferences}
                        onReset={resetDashboardPreferences}
                        isSaved={preferencesSaved}
                        displayName={displayName}
                        onSaveDisplayName={updateDisplayName}
                        profileSaved={profileSaved}
                      />
                      : <AboutPage />}
            <footer className="app-footer"><span>GRIDMIND <b>•</b> LOCAL ENERGY SIMULATION</span><span>{report ? "SCENARIO LOADED · " + (reportSource === "custom" ? "USER INPUTS" : "SYNTHETIC EXAMPLE") : "NO SCENARIO LOADED"}</span></footer>
          </div>
        </div>
      </main>
    </div>
  );
}
