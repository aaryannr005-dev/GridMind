# GridMind desktop frontend

Stage 1 is a React + TypeScript + Electron shell only. It intentionally does not call the Python engine or display simulated results.

## Requirements

- Node.js 22 or newer
- npm
- Python is not required for this shell stage

## Commands

From this directory:

```sh
npm install
npm run typecheck
npm test
npm run build
npm run dev
```

The Electron window has not yet been verified on Windows. This stage does not include a Python sidecar, simulation bridge, installer, charts backed by engine output, forecasts, or external data fetching. Scenario and results pages are explicit placeholders until later approved stages.
