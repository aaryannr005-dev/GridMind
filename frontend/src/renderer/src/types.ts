export type PageId = "home" | "simulation" | "reports" | "data" | "settings";

export interface NavigationItem {
  id: PageId;
  label: string;
  eyebrow: string;
  description: string;
}

export interface DesktopBridge {
  platform: string;
}

declare global {
  interface Window {
    gridmindDesktop?: DesktopBridge;
  }
}
