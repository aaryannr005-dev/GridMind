export type ThemeName = "light" | "dark";

export const THEME_KEY = "gridmind.theme.v1";

const SUPPORTED_THEMES: readonly ThemeName[] = ["light", "dark"];

export function parseTheme(value: unknown): ThemeName {
  return value === "light" || value === "dark" ? value : "dark";
}

export function loadTheme(): ThemeName {
  try {
    const stored = window.localStorage.getItem(THEME_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    // localStorage can be unavailable in restricted environments.
  }
  try {
    if (typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: light)").matches) {
      return "light";
    }
  } catch {
    // matchMedia is not available in every test environment.
  }
  return "dark";
}

export function saveTheme(theme: ThemeName): boolean {
  try {
    window.localStorage.setItem(THEME_KEY, theme);
    return true;
  } catch {
    return false;
  }
}

export function applyTheme(theme: ThemeName): void {
  try {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.setProperty("color-scheme", theme);
  } catch {
    // document may be unavailable in some test environments.
  }
}

export function switchTheme(theme: ThemeName): ThemeName {
  return theme === "dark" ? "light" : "dark";
}

export function themeToggleButtonLabel(theme: ThemeName): string {
  return theme === "dark" ? "Switch to the light theme" : "Switch to the dark theme";
}

export function themeIsSupported(value: unknown): value is ThemeName {
  return SUPPORTED_THEMES.includes(value as ThemeName);
}
