export type PageId = "home" | "simulation" | "reports" | "energy-map" | "settings" | "about";

export interface NavigationItem {
  id: PageId;
  label: string;
  eyebrow: string;
  description: string;
}

export interface DesktopBridge {
  platform: string;
  runHourlyScenario: import("../../shared/protocol").DesktopBridge["runHourlyScenario"];
}

declare global {
  interface Window {
    gridmindDesktop?: DesktopBridge;
  }
}
