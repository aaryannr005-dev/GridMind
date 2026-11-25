export const PROFILE_NAME_KEY = "gridmind.profile.name.v1";

export function normalizeDisplayName(value: string): string {
  return value.trim().replace(/\s+/g, " ").slice(0, 40);
}

export function loadDisplayName(): string {
  try {
    return normalizeDisplayName(window.localStorage.getItem(PROFILE_NAME_KEY) ?? "");
  } catch {
    return "";
  }
}

export function saveDisplayName(value: string): boolean {
  const name = normalizeDisplayName(value);
  if (!name) return false;
  try {
    window.localStorage.setItem(PROFILE_NAME_KEY, name);
    return true;
  } catch {
    return false;
  }
}
