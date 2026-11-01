# Agent Instructions

## Project
GridMind is a local-first energy simulation and decision-support application. It is not a live grid controller. Preserve the distinction between synthetic demonstration data, public historical data, and user-provided scenario inputs.

## Working rules
- Work only on the assigned feature branch. Never commit or push directly to `main`.
- Inspect the relevant code, tests, architecture notes, and current git status before editing.
- Make the smallest coherent change that solves the task. Do not perform unrelated redesigns or broad refactors.
- Preserve existing Python engine calculations, validation, deterministic behaviour, typed interfaces, Electron IPC boundaries, and security settings unless the task explicitly requires a change.
- Do not invent energy values, data sources, results, or claims. Label synthetic/example data clearly.
- Do not introduce network calls, telemetry, accounts, databases, or real-grid control without explicit approval.
- Do not add dependencies without explaining why, checking maintenance/licensing, and updating lockfiles/manifests.
- Never expose secrets, tokens, private user data, or environment variables in logs, commits, screenshots, or PR descriptions.
- Do not delete user data, rewrite git history, force-push, alter release tags, publish releases, or change repository settings.
- Do not merge pull requests. Human approval is mandatory.

## Validation
- Read the README and relevant frontend/backend documentation before choosing commands.
- Run the narrowest relevant tests first, then the full available test suite and build where practical.
- Report exact commands and outcomes. Never claim tests passed if they were skipped or could not run.
- Add or update tests for behaviour changes. Do not weaken or delete tests merely to make CI pass.
- Known validation commands are:
  - Python package (repository root): `python -m pytest` (test config is in `pyproject.toml`).
  - Frontend (from `frontend/`): `npm run typecheck`, `npm test` (Vitest), and `npm run build` (Electron production build).
  - CI runs `.github/workflows/windows-desktop.yml`, which executes the Python tests, `python scripts/build_engine.py`, an engine JSON-lines smoke test, frontend typechecking, frontend tests, the Electron build, and Windows installer packaging (`npm run package:win`).

## Pull requests
- Push changes to a descriptive feature branch and open a PR targeting `main`.
- PR description must include: problem, implementation, files/components changed, tests run with results, known limitations, and any migration/dependency impact.
- Leave the PR open for human review. Never enable auto-merge.
