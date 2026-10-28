import type { DashboardPreferences } from "../dashboard-preferences";

interface PreferencesPageProps {
  preferences: DashboardPreferences;
  onChange: (preferences: DashboardPreferences) => void;
  onReset: () => void;
  isSaved: boolean;
}

const options: { key: keyof DashboardPreferences; label: string; description: string }[] = [
  { key: "showMetrics", label: "Key metrics", description: "Show modeled cost and grid import summary cards." },
  { key: "showCharts", label: "Energy and battery charts", description: "Show engine-generated interval charts." },
  { key: "showComparison", label: "Strategy comparison", description: "Show the baseline and GridMind metric table." },
  { key: "showAssumptions", label: "Assumptions and limitations", description: "Show the model notes and scenario fingerprint." },
];

export function PreferencesPage({ preferences, onChange, onReset, isSaved }: PreferencesPageProps) {
  return (
    <div className="page-stack">
      <div className="page-intro"><span className="eyebrow">APP</span><h1>Preferences</h1><p>Choose which result sections appear on the Overview.</p></div>
      <section className="form-section preference-section" aria-labelledby="overview-preferences-title">
        <div className="form-section-heading"><div><span className="eyebrow">OVERVIEW</span><h2 id="overview-preferences-title">Dashboard sections</h2></div><button className="secondary-button" type="button" onClick={onReset}>Restore defaults</button></div>
        <p className="form-help">These choices are saved in this app on this device. Scenario inputs and results are not saved.</p>
        <div className="preference-options">
          {options.map((option) => <label className="preference-option" key={option.key}>
            <input type="checkbox" checked={preferences[option.key]} onChange={(event) => onChange({ ...preferences, [option.key]: event.target.checked })} />
            <span><strong>{option.label}</strong><small>{option.description}</small></span>
          </label>)}
        </div>
        <p className="preference-save-status" role="status">{isSaved ? "Preferences saved on this device." : "Could not save preferences in this app environment."}</p>
      </section>
    </div>
  );
}
