export type PageId = "home" | "simulation" | "reports" | "comparison" | "energy-map" | "settings" | "about";

export interface NavigationItem {
  id: PageId;
  label: string;
  eyebrow: string;
  description: string;
}

export interface DesktopBridge {
  platform: string;
  runHourlyScenario: import("../../shared/protocol").DesktopBridge["runHourlyScenario"];
  runSensitivityAnalysis: import("../../shared/protocol").DesktopBridge["runSensitivityAnalysis"];
}

declare global {
  interface Window {
    gridmindDesktop?: DesktopBridge;
  }
}
