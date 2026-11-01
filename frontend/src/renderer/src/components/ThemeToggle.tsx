import type { ThemeName } from "../theme";
import { themeToggleButtonLabel } from "../theme";

interface ThemeToggleProps {
  theme: ThemeName;
  onChange: (theme: ThemeName) => void;
}

export function ThemeToggle({ theme, onChange }: ThemeToggleProps) {
  return (
    <button
      type="button"
      className="theme-toggle"
      aria-label={themeToggleButtonLabel(theme)}
      onClick={() => onChange(theme === "dark" ? "light" : "dark")}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        {theme === "dark" ? (
          // Sun: shown while the interface is dark.
          <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <circle cx="12" cy="12" r="4.4" />
            <path d="M12 2.5v2.6M12 18.9v2.6M2.5 12h2.6M18.9 12h2.6M5.3 5.3l1.9 1.9M16.8 16.8l1.9 1.9M18.7 5.3l-1.9 1.9M7.2 16.8l-1.9 1.9" />
          </g>
        ) : (
          // Moon: shown while the interface is light.
          <path
            fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"
            d="M20 13.6A8.1 8.1 0 0 1 10.4 4a8.1 8.1 0 1 0 9.6 9.6Z"
          />
        )}
      </svg>
    </button>
  );
}
