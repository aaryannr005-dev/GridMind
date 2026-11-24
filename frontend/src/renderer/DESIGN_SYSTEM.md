# GridMind visual design system

This document records the shared visual rules introduced in Phase 3A. It is a foundation for later screen redesigns, not a specification for changing page structure or simulation behaviour.

## Design direction

GridMind should feel like a clear, approachable desktop engineering application. The interface uses a calm blue identity, familiar controls, restrained borders and subtle elevation. Avoid decorative gradients, excessive glow, oversized icons and unnecessary visual noise.

## Themes

- **Light** is the first-launch default.
- **Dark** is available through the theme toggle.
- An explicit saved choice takes precedence over the default.
- Theme state is applied to the document root before React renders to avoid a flash of the wrong palette.

## Semantic colour tokens

| Token family | Purpose |
| --- | --- |
| `--bg`, `--bg-accent` | Application canvas and secondary canvas |
| `--panel`, `--panel-soft`, `--panel-solid` | Surface hierarchy |
| `--line`, `--line-strong` | Borders and separators |
| `--text`, `--text-strong`, `--muted`, `--faint` | Text hierarchy |
| `--accent`, `--accent-strong`, `--accent-dim`, `--accent-line` | Primary actions and selection |
| `--ok`, `--warn`, `--danger` and their `*-dim` variants | Status and validation |
| `--chart-demand`, `--chart-solar`, `--chart-battery`, `--chart-import`, `--chart-export` | Consistent energy chart identities |

Components should use semantic tokens rather than introducing one-off palette values. Chart identities must remain consistent between light and dark themes.

## Layout and component tokens

- `--font-ui` and `--font-display` define the interface typefaces.
- `--mono` is reserved for measurements, timestamps, technical identifiers and tabular values.
- `--space-1` through `--space-6` provide a shared spacing scale.
- `--radius-s` through `--radius-xl` provide consistent corner radii.
- `--shadow` and `--shadow-raised` provide restrained surface depth.
- `--content-width`, `--rail-width`, `--workspace-gap` and `--control-height` define reusable layout dimensions.

## Accessibility

- Keyboard focus must remain clearly visible.
- Disabled controls must communicate that they are unavailable.
- Reduced-motion preferences are respected.
- Forced-colour mode receives a high-contrast focus outline.
- Text and chart colours must remain distinguishable in both themes.

## Scope boundary

Phase 3A establishes tokens, theme behaviour and shared styling. Page-specific composition, navigation, welcome flow, dashboard layout and Control Rail redesign remain in later Phase 3 stages. Simulation calculations and the Python engine are out of scope.
