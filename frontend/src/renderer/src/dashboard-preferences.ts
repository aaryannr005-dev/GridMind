export interface DashboardPreferences {
  showMetrics: boolean;
  showCharts: boolean;
  showComparison: boolean;
  showAssumptions: boolean;
}

export const DEFAULT_DASHBOARD_PREFERENCES: DashboardPreferences = {
  showMetrics: true,
  showCharts: true,
  showComparison: true,
  showAssumptions: true,
};

export const DASHBOARD_PREFERENCES_KEY = "gridmind.dashboard-preferences.v1";

export function parseDashboardPreferences(value: unknown): DashboardPreferences {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ...DEFAULT_DASHBOARD_PREFERENCES };
  }
  const stored = value as Record<string, unknown>;
  return {
    showMetrics: typeof stored.showMetrics === "boolean" ? stored.showMetrics : true,
    showCharts: typeof stored.showCharts === "boolean" ? stored.showCharts : true,
    showComparison: typeof stored.showComparison === "boolean" ? stored.showComparison : true,
    showAssumptions: typeof stored.showAssumptions === "boolean" ? stored.showAssumptions : true,
  };
}

export function loadDashboardPreferences(): DashboardPreferences {
  try {
    const serialized = window.localStorage.getItem(DASHBOARD_PREFERENCES_KEY);
    return serialized === null ? { ...DEFAULT_DASHBOARD_PREFERENCES } : parseDashboardPreferences(JSON.parse(serialized) as unknown);
  } catch {
    return { ...DEFAULT_DASHBOARD_PREFERENCES };
  }
}

export function saveDashboardPreferences(preferences: DashboardPreferences): boolean {
  try {
    window.localStorage.setItem(DASHBOARD_PREFERENCES_KEY, JSON.stringify(preferences));
    return true;
  } catch {
    return false;
  }
}
