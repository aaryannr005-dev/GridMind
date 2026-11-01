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

## Windows beta installer

The Windows installer uses the existing Python engine, bundled as a one-file console executable with PyInstaller. The executable is built on Windows (PyInstaller does not cross-compile Windows executables from this Linux development VM) and copied into the Electron app's `resources/gridmind-engine/gridmind-engine.exe`; packaged Electron launches that executable directly without requiring Python, Node.js, Git, or npm on the user's machine. The bridge continues to use the existing bounded JSON-lines protocol, with stdout reserved for protocol responses and stderr for diagnostics.

On Windows, from the repository root, install Python 3.10 or newer and run:

```powershell
python -m pip install -e ".[test]" -r scripts/requirements-build.txt
python -m pytest
python scripts/build_engine.py
```

Then, from `frontend/`:

```powershell
npm ci
npm run typecheck
npm test
npm run build
npm run package:win
```

The installer is written to `frontend/release/GridMind-Setup-<version>.exe`, named after the `frontend/package.json` version (0.2.0 at this writing). The assisted NSIS installer offers per-user or per-machine installation (per-user selected by default), and lets the user choose the install directory. Windows executable code signing is explicitly disabled (`win.signExecutable: false`); the generated installer is unsigned and may show Windows security warnings.

The `Windows desktop installer` GitHub Actions workflow runs Python tests, builds the sidecar on `windows-latest`, exercises valid, malformed, and invalid requests through that executable, runs frontend typecheck/tests/build, then packages the NSIS installer. The packaging script refuses to proceed if the bundled sidecar is missing or empty. On successful runs it uploads the installer as a workflow artifact for 30 days. Publishing a GitHub Release happens only for manual workflow runs with the publish-release input enabled. Use a Windows runner to build and test the installer; a Linux build of the Electron frontend is not evidence of a Windows installer.

The Simulation Lab provides editable hourly demand and solar energy (kWh per interval), import and export tariffs (currency per kWh), a date, battery settings, and currency. It checks the inputs in the UI and sends the typed 24-hour request through the local bridge; Python performs the authoritative validation and runs the existing baseline, optimizer, metrics, and report functions. A clearly labeled synthetic example remains available on the Overview. Reports reviews the latest completed engine result, including its scenario fingerprint, assumptions, limitations, charts, metrics, and comparison tables. Preferences let users hide or show result sections on the Overview and save those choices in local app storage. Energy Map offers an opt-in embedded view of the Commission's hosted historical map PDF plus a source link; GridMind does not copy the map graphics or represent them as current data because reuse terms and ongoing accuracy are not established. It links separately to CC BY 4.0 national monthly statistics, which have no state or facility locations and do not update the map. Scenario values and reports remain in memory for the current app session only.

In development, Electron launches `python -m gridmind.bridge` (Windows) or `python3 -m gridmind.bridge` (macOS/Linux) with a fixed argument list and `shell: false`. In a packaged Windows build, the main process launches `resources/gridmind-engine/gridmind-engine.exe`, built by `scripts/build_engine.py` and included by the electron-builder `extraResources` configuration. The sandboxed preload is bundled as CommonJS so the existing Electron sandbox and context isolation remain enabled. The development bridge still requires Python; the installed Windows desktop app does not.

Charts include point tooltips and accessible data tables. Report values retain their units and model limitations; cost and import differences are labeled as scenario estimates, not guaranteed savings. Scenario inputs and reports stay on the local machine in app memory only and are not retained after the app closes. The bridge does not add a database, cloud service, account system, network fetch, or grid connection. The Electron window and packaged sidecar are not yet verified on Windows.
