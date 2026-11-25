import { useEffect, useState } from "react";
import type { DashboardPreferences } from "../dashboard-preferences";

interface PreferencesPageProps {
  preferences: DashboardPreferences;
  onChange: (preferences: DashboardPreferences) => void;
  onReset: () => void;
  isSaved: boolean;
  displayName: string;
  onSaveDisplayName: (name: string) => void;
  profileSaved: boolean;
}

const options: { key: keyof DashboardPreferences; label: string; description: string }[] = [
  { key: "showMetrics", label: "Key metrics", description: "Show modeled cost and grid import summary cards." },
  { key: "showCharts", label: "Energy and battery charts", description: "Show engine-generated interval charts." },
  { key: "showComparison", label: "Strategy comparison", description: "Show the baseline and GridMind metric table." },
  { key: "showAssumptions", label: "Assumptions and limitations", description: "Show the model notes and scenario fingerprint." },
];

export function PreferencesPage({ preferences, onChange, onReset, isSaved, displayName, onSaveDisplayName, profileSaved }: PreferencesPageProps) {
  const [nameDraft, setNameDraft] = useState(displayName);
  useEffect(() => setNameDraft(displayName), [displayName]);

  return (
    <div className="page-stack">
      <div className="page-intro"><span className="eyebrow">APP</span><h1>Settings</h1><p>Manage your profile and customise your GridMind workspace.</p></div>
      <section className="form-section preference-section" aria-labelledby="profile-settings-title">
        <div className="form-section-heading"><div><span className="eyebrow">PROFILE</span><h2 id="profile-settings-title">Your workspace</h2></div></div>
        <p className="form-help">Your name personalises the dashboard and stays on this device.</p>
        <form className="profile-edit-form" onSubmit={(event) => { event.preventDefault(); onSaveDisplayName(nameDraft); }}>
          <label htmlFor="settings-profile-name">Display name</label>
          <div className="profile-edit-row">
            <input id="settings-profile-name" type="text" maxLength={40} value={nameDraft} onChange={(event) => setNameDraft(event.target.value)} />
            <button className="secondary-button" type="submit" disabled={!nameDraft.trim() || nameDraft.trim() === displayName}>Save name</button>
          </div>
          <p className="preference-save-status" role="status">{profileSaved ? "Profile saved on this device." : "Could not save your profile in this app environment."}</p>
        </form>
      </section>
      <section className="form-section preference-section" aria-labelledby="overview-preferences-title">
        <div className="form-section-heading"><div><span className="eyebrow">DASHBOARD</span><h2 id="overview-preferences-title">Dashboard sections</h2></div><button className="secondary-button" type="button" onClick={onReset}>Restore defaults</button></div>
        <p className="form-help">Choose which result sections appear on the Dashboard. These choices are saved locally; scenario inputs and results are not saved.</p>
        <div className="preference-options">
          {options.map((option) => <label className="preference-option" key={option.key}>
            <input type="checkbox" checked={preferences[option.key]} onChange={(event) => onChange({ ...preferences, [option.key]: event.target.checked })} />
            <span><strong>{option.label}</strong><small>{option.description}</small></span>
          </label>)}
        </div>
        <p className="preference-save-status" role="status">{isSaved ? "Dashboard preferences saved on this device." : "Could not save preferences in this app environment."}</p>
      </section>
    </div>
  );
}
