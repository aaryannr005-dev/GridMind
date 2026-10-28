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

The bridge supports the existing 24-hour scenario operation: demand and solar energy in kWh per hourly interval, tariffs per kWh, a start date, battery settings, and currency. The Python side validates and runs the same baseline, optimizer, metrics, and report functions as the existing dashboard. The dashboard currently offers one fixed synthetic example (matching the Python dashboard's demonstration profile) and renders demand/solar and battery state-of-charge charts, metrics, and comparison tables from the returned engine report. It does not yet provide editable scenario inputs.

In development, Electron launches `python -m gridmind.bridge` (Windows) or `python3 -m gridmind.bridge` (macOS/Linux) with a fixed argument list and `shell: false`. In a packaged build, the main process expects `resources/gridmind-engine/gridmind-engine.exe` on Windows or `resources/gridmind-engine/gridmind-engine` elsewhere. The build pipeline that creates and bundles that executable is part of the later packaging stage.

Charts include point tooltips and accessible data tables. Report values retain their units and model limitations; cost and import differences are labeled as scenario estimates, not guaranteed savings. Requests and results stay on the local machine and in process memory. The bridge does not add a database, cloud service, account system, network fetch, or grid connection. The Electron window and packaged sidecar are not yet verified on Windows.
