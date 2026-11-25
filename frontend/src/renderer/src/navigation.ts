import type { NavigationItem, PageId } from "./types";

export const navigationItems: NavigationItem[] = [
  { id: "home", label: "Dashboard", eyebrow: "WORKSPACE", description: "Your latest energy scenario at a glance." },
  { id: "simulation", label: "Simulation", eyebrow: "MODEL", description: "Configure a scenario and inspect validated results." },
  { id: "reports", label: "Analytics", eyebrow: "ANALYSIS", description: "Review the latest completed scenario and its metrics." },
  { id: "comparison", label: "Compare", eyebrow: "BENCHMARK", description: "Compare saved scenario runs side by side." },
  { id: "energy-map", label: "Data & Maps", eyebrow: "REFERENCE", description: "Explore Malaysian electricity maps and public data sources." },
  { id: "settings", label: "Settings", eyebrow: "APP", description: "Manage your profile, appearance and dashboard preferences." },
  { id: "about", label: "About", eyebrow: "GRIDMIND", description: "Learn about the GridMind project and its modelling approach." },
];

export function getNavigationItem(id: PageId): NavigationItem {
  return navigationItems.find((item) => item.id === id) ?? navigationItems[0];
}
