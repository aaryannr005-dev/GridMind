# GridMind desktop frontend

The React + TypeScript + Electron app calls the existing Python engine through a private, local JSON-lines sidecar. All dispatch calculations remain in Python.

## Requirements

- Node.js 22 or newer
- npm
- Python 3.10 or newer
- Install the repository package from the project root with `python -m pip install -e .`

## Commands

From this directory:

```sh
npm ci
npm run typecheck
npm test
npm run build
npm run dev
```

The Simulation Lab provides editable hourly demand and solar energy (kWh per interval), import and export tariffs (currency per kWh), a date, battery settings, and currency. It checks the inputs in the UI and sends the typed 24-hour request through the local bridge; Python performs the authoritative validation and runs the existing baseline, optimizer, metrics, and report functions. A clearly labeled synthetic example remains available on the Overview. Reports reviews the latest completed engine result, including its scenario fingerprint, assumptions, limitations, charts, metrics, and comparison tables. Scenario values and reports remain in memory for the current app session only.

In development, Electron launches `python -m gridmind.bridge` (Windows) or `python3 -m gridmind.bridge` (macOS/Linux) with a fixed argument list and `shell: false`. In a packaged build, the main process expects `resources/gridmind-engine/gridmind-engine.exe` on Windows or `resources/gridmind-engine/gridmind-engine` elsewhere. The build pipeline that creates and bundles that executable is part of the later packaging stage.

Charts include point tooltips and accessible data tables. Report values retain their units and model limitations; cost and import differences are labeled as scenario estimates, not guaranteed savings. Scenario inputs and reports stay on the local machine in app memory only and are not retained after the app closes. The bridge does not add a database, cloud service, account system, network fetch, or grid connection. The Electron window and packaged sidecar are not yet verified on Windows.
