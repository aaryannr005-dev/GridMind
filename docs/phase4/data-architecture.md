# Phase 4A: Data architecture and contracts

**Status:** Architecture baseline  
**Scope:** Data-source boundaries, provenance, validation, and the path from public reference data to scenario inputs.  
**Non-goal:** This phase does not add live network access, a database, telemetry, a new data feed, or automatic conversion of national statistics into household demand.

## 1. Design goals

GridMind must make it possible to answer five questions for every displayed dataset:

1. Where did it come from?
2. What does each value represent, including its unit and geographic scope?
3. When does the data describe, and when was the source last updated?
4. Which values are missing, provisional, revised, or otherwise uncertain?
5. Is the dataset suitable for scenario input, contextual analysis, or neither?

The architecture is local-first and provenance-preserving. Data acquisition is separate from parsing; parsing is separate from validation; validated observations are separate from analytical summaries; and public reference statistics are separate from user-authored simulation inputs.

## 2. Data layers

| Layer | Responsibility | Current implementation / boundary |
|---|---|---|
| Source catalogue | Stable dataset identity, publisher, source URLs, licence, coverage, frequency, units, schema and caveats | `DatasetMetadata`, `OpenDosmDataset`, `OPEN_DOSM_DATASETS` in `src/gridmind/public_data.py` |
| Acquisition | Obtain source bytes and record retrieval context | Phase 4B adds an explicit, bounded downloader for registered OpenDOSM CSV URLs. It returns raw bytes, SHA-256, content type and retrieval timestamp; it does not cache or persist files. |
| Raw input | Preserve the supplied source file unchanged for reproducibility | Caller-owned input; no raw-file store is currently implemented. |
| Parsing | Convert official-format CSV rows into typed observations without imputation or rescaling | `load_open_dosm_csv` |
| Validation | Enforce schema, dates, categories, numeric range, uniqueness and structural completeness; identify gaps | Parser validation, `ObservationStatus`, `MissingPeriod` |
| Analysis | Calculate summaries only after explicit treatment of missing/provisional observations | Future Phase 4C work; do not silently fill gaps or mix statuses. |
| Presentation | Show values with units, geography, period, status, source and licence attribution | Existing Energy Map page is a source directory; richer in-app data views are future work. |
| Scenario inputs | Accept explicit household/site time series and engineering configuration | Existing typed models and scenario form / engine bridge. Public national monthly aggregates do not enter this layer automatically. |

## 3. Dataset contract

Every public dataset registered in GridMind must have:

- A stable machine-readable dataset ID.
- A human-readable title and plain-language description.
- Publisher and upstream data-source organisations.
- Canonical catalogue URL and direct file URL, where available.
- Licence name and URL, plus attribution wording where required.
- Geographic coverage and the level of geographic detail actually present.
- Frequency, unit, date field, category field, value field and known category vocabulary.
- Data-as-of date, source last-updated date, metadata verification date, and update cadence or an explicit statement that it is unknown.
- Provisional/revision policy and dataset-specific caveats.

Metadata dates must describe different things and must not be conflated: the period covered by observations is not the date the publisher updated the file, and neither is the date GridMind checked the catalogue.

The current OpenDOSM registry covers national monthly electricity consumption and supply. It must not be described as state-level, household-level, feeder-level, or live grid data.

## 4. Observation and quality contract

The current parsed row is represented by `MonthlyObservation`:

- `period`: first day of the represented calendar month.
- `category`: one of the registered source categories.
- `value`: nonnegative finite value in the original source unit, or `None` when the source cell is blank.
- `status`: `final`, `provisional`, or `unknown`, based only on the verified source publication caveat.

The importer must:

- Reject missing or duplicate required headers, malformed rows, invalid month dates, unknown categories, duplicate month/category pairs, negative values, non-finite values and values outside the supported numeric range.
- Preserve valid zero values.
- Preserve blank numeric cells as missing observations; never convert them to zero.
- Detect absent month/category combinations between the first and last observed month.
- Sort observations deterministically.
- Preserve source units and values; never silently rescale, interpolate, extrapolate, or impute.

A blank value and an absent row are different conditions and must remain distinguishable. A missing period is not evidence of zero consumption or supply. A provisional observation is usable only when the consuming analysis explicitly accepts provisional data and labels it.

## 5. Public reference data versus simulation inputs

This is a critical system boundary.

**Public reference data** (for example, OpenDOSM monthly national electricity totals) supports national context, trend summaries, and source-backed educational analysis.

**Scenario inputs** represent a specific household, building, site, or deliberately synthetic example over a defined interval. They require time-aligned demand, solar, tariffs, battery and grid configuration with units and validation appropriate to the simulation engine.

National monthly totals cannot be divided into 24 hourly household values, scaled into a household profile, or used to infer local grid constraints without an explicit, documented model and independent validation. The existence of a public dataset does not make it suitable as a simulation input.

Synthetic demo profiles must remain visibly labelled as synthetic. User-entered scenario values must remain distinct from both public observations and synthetic examples.

## 6. Provenance and reproducibility

For each imported dataset view or derived analysis, retain or display:

- Dataset ID and title.
- Publisher and upstream source organisations.
- Catalogue URL and direct source-file URL.
- Licence and attribution.
- Geographic scope, frequency, unit and covered period.
- Source update date and GridMind metadata-check date.
- Provisional policy and applicable caveats.
- Import/analysis timestamp and, when a raw-file workflow is introduced, a content hash of the exact source file.
- Validation outcome, missing-value count, missing-period count and any exclusions applied by the analysis.

Derived summaries must identify the source observation set and any filters (category, period and status treatment). A summary must never look more geographically or temporally precise than its source.

## 7. Error handling and trust boundaries

- Invalid structure or values fail import with a clear row/field-specific error.
- Missing observations are reported as quality information, not fatal errors by default.
- Network acquisition, if introduced later, must be an explicit user action with timeouts, bounded downloads, HTTPS-only source allowlists, and clear failure states. It must not run from the simulation engine or silently refresh data.
- Imported files are untrusted input. Parsers must not execute content, follow arbitrary links, or accept arbitrary schema changes.
- No dataset may change scenario inputs or engine behaviour without an explicit user action and a validated, documented transformation.
- No live grid control, telemetry, account system, or database is introduced by this architecture.

## 8. Current implementation assessment

Already present:

- Immutable metadata and dataset registry for two OpenDOSM monthly datasets.
- Offline CSV parsing with strict schema and row validation.\n- Explicit bounded acquisition for the two registered OpenDOSM CSV sources, with HTTPS host/URL restrictions, redirect restrictions, timeout and byte limits, SHA-256 identity and retrieval timestamp.
- Source-unit preservation, blank-value retention, deterministic ordering and missing-month detection.
- Provisional/final/unknown status classification based on the documented six-month caveat.
- Unit tests for valid imports, provenance, gaps, blanks, zero, unknown status, malformed schemas, duplicates and numeric edge cases.
- An Energy Map reference page that distinguishes historical maps from current national statistics and explains geographic limitations.

Not yet present:

- A managed download/cache or raw-file archive.
- Automatic source refresh or update monitoring.
- File-hash based import identity.
- A user-facing import workflow or tabular explorer for imported observations.
- Explicit analysis policies for provisional data and missing-value handling.
- Independent validation against a second source or documented reconciliation procedure.
- Site-level measured datasets suitable for validating household simulation outputs.

## 9. Phase 4 delivery sequence

### 4A — Architecture and contracts
Document and agree the boundaries, metadata requirements, quality semantics, provenance, and separation from scenario inputs. This document records the baseline.

### 4B — Malaysian public-data integration
Verify source metadata at implementation time, add carefully selected datasets only where their units and geography are useful, and provide a controlled offline import path. Do not add sources merely to increase dataset count.

### 4C — Data quality and validation
Add explicit completeness, revision, provisional-status and reconciliation reports. Any cross-source comparison must align period, geography, unit and definitions before comparing values.

### 4D — Simulation validation
Identify genuinely suitable measured site-level or household-level profiles, document permissions and representativeness, and compare model outputs only where input and reference measurements are aligned. Public national aggregates are context, not ground truth for one home.

### 4E — Data experience
Expose provenance, quality flags, units, filters and source attribution in the desktop app. Keep imported reference data visually and functionally separate from editable scenario inputs.

## 10. Acceptance criteria for 4A

- [x] Existing source catalogue and importer have been inspected and mapped.
- [x] Data layers and ownership boundaries are documented.
- [x] Missing, blank, zero, provisional and unknown values have explicit semantics.
- [x] Public reference data is explicitly prohibited from silently becoming household simulation input.
- [x] Provenance, licensing, trust and reproducibility requirements are documented.
- [x] Current capabilities and gaps are stated without implying that download, refresh, or validation workflows already exist.
