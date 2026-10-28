import type { NavigationItem, PageId } from "./types";

export const navigationItems: NavigationItem[] = [
  { id: "home", label: "Overview", eyebrow: "WORKSPACE", description: "Your energy workspace at a glance." },
  { id: "simulation", label: "Simulation lab", eyebrow: "MODEL", description: "Configure a scenario and inspect validated results." },
  { id: "reports", label: "Reports", eyebrow: "ANALYSIS", description: "Review reproducible reports from completed runs." },
  { id: "data", label: "Data sources", eyebrow: "REFERENCE", description: "Review source provenance and licensing notes." },
  { id: "settings", label: "Preferences", eyebrow: "APP", description: "Customize which results appear on the Overview." },
];

export function getNavigationItem(id: PageId): NavigationItem {
  return navigationItems.find((item) => item.id === id) ?? navigationItems[0];
}
