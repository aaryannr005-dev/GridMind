// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  applyTheme,
  loadTheme,
  parseTheme,
  saveTheme,
  switchTheme,
  themeToggleButtonLabel,
} from "./theme";

describe("theme utilities", () => {
  it("persists and restores an explicit theme choice", () => {
    expect(saveTheme("light")).toBe(true);
    expect(loadTheme()).toBe("light");
    expect(saveTheme("dark")).toBe(true);
    expect(loadTheme()).toBe("dark");
  });

  it("falls back to dark when nothing is stored", () => {
    window.localStorage.removeItem("gridmind.theme.v1");
    expect(loadTheme()).toBe("dark");
  });

  it("maps unknown values to the default theme", () => {
    expect(parseTheme("plaid")).toBe("dark");
    expect(parseTheme(null)).toBe("dark");
    expect(parseTheme("light")).toBe("light");
  });

  it("returns the opposite theme when switching", () => {
    expect(switchTheme("dark")).toBe("light");
    expect(switchTheme("light")).toBe("dark");
  });

  it("labels the toggle after the theme it switches to", () => {
    expect(themeToggleButtonLabel("dark")).toBe("Switch to the light theme");
    expect(themeToggleButtonLabel("light")).toBe("Switch to the dark theme");
  });

  it("marks the document element with the active theme", () => {
    applyTheme("light");
    expect(document.documentElement.dataset.theme).toBe("light");
    applyTheme("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("reports saved-state honestly when storage is unavailable", () => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error("unavailable");
    };
    try {
      expect(saveTheme("light")).toBe(false);
    } finally {
      Storage.prototype.setItem = original;
    }
  });
});
