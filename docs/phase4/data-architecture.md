# Phase 4A: Data architecture and contracts

**Status:** Architecture baseline  
**Scope:** Data-source boundaries, provenance, validation, and the path from public reference data to scenario inputs.  
**Non-goal:** This architecture does not add a database, telemetry, live hardware integration, automatic refresh, or automatic conversion of national statistics into household demand.

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
| Acquisition | Obtain source bytes and record retrieval context | Explicit, bounded downloader for registered OpenDOSM CSV URLs; returns raw bytes, SHA-256, content type and retrieval timestamp. No cache or persistence. |
| Raw input | Preserve the supplied source file unchanged for reproducibility | Caller-owned input; no raw-file store is currently implemented. |
| Parsing | Convert official-format CSV rows into typed observations without imputation or rescaling | `load_open_dosm_csv` |
| Validation | Enforce schema, dates, categories, numeric range, uniqueness and structural completeness; identify gaps | Parser validation, `ObservationStatus`, `MissingPeriod`, Phase 4C quality reports, and Phase 4D measured-reference comparison |
| Analysis | Calculate summaries only after explicit treatment of missing/provisional observations | Phase 4C provides an explicit inclusion policy; Phase 4D compares aligned simulation channels with supplied site measurements. Neither phase imputes missing values. |
| Presentation | Show values with units, geography, period, status, source and licence attribution | Existing Energy Map page is a source directory; Phase 4E adds a searchable in-app source catalogue with publisher metadata, units, geographic coverage, source update dates, provisional-window warnings and attribution. Raw observation import and persistent local data storage remain future work. |
| Scenario inputs | Accept explicit household/site time series and engineering configuration | Existing typed models and scenario form / engine bridge. Public national monthly aggregates do not enter this layer automatically. |

## 3. Dataset contract

Every public dataset registered in GridMind must have a stable ID, title, description, publisher, upstream sources, catalogue and file URLs, licence, geographic coverage, frequency, unit, schema, categories, data-as-of date, source update date, metadata verification date, update cadence, and revision caveats.

Metadata dates must not be conflated: observation coverage is not the publisher update date, and neither is the date GridMind checked the catalogue.

The current registry covers national monthly electricity consumption and supply. It must not be described as state-level, household-level, feeder-level, or live grid data.

## 4. Observation and quality contract

The current parsed row is represented by `MonthlyObservation`: month-start period, registered category, nonnegative finite source-unit value or `None` for a blank source cell, and publication status (`final`, `provisional`, or `unknown`).

The importer rejects malformed schemas, rows, dates, categories, duplicates, negative/non-finite/out-of-range values. It preserves zero, blanks, source units and deterministic ordering, and reports absent month/category combinations. A blank value and an absent row are different conditions. Neither means zero.

**Phase 4C quality policy:** `evaluate_data_quality` reports row completeness and numeric-value completeness separately for each category, within the first-to-last observed period. It separately counts absent periods, blank cells, final observations, provisional observations and unknown-status observations. These are diagnostics, not repairs.

By default, `DataQualityReport.usable_observations` selects only numeric final observations. Including provisional or unknown observations requires an explicit `DataQualityPolicy` opt-in. Blank values are never selected. No interpolation, extrapolation, imputation, rescaling or automatic scenario conversion is performed.

## 5. Public reference data versus simulation inputs

Public reference data (for example, OpenDOSM monthly national electricity totals) supports national context, trend summaries, and source-backed educational analysis.

Scenario inputs represent a specific household, building, or site over a defined interval. They require time-aligned demand, solar, tariffs, battery and grid configuration with units and validation appropriate to the simulation engine.

National monthly totals cannot be divided into 24 hourly household values, scaled into a household profile, or used to infer local grid constraints without an explicit, documented model and independent validation. Public aggregates are not household ground truth.

Synthetic demo profiles must remain visibly labelled synthetic. User-entered scenario values remain distinct from public observations and synthetic examples.

## 6. Provenance and reproducibility

For each imported dataset or derived analysis, retain or display dataset ID, publisher, source URLs, licence, geographic scope, frequency, unit, period, source update date, metadata-check date, provisional policy, import timestamp, exact-file hash when available, validation outcome, missing-value count, missing-period count and analysis exclusions.

Derived summaries must identify their source observation set and filters. A summary must never look more geographically or temporally precise than its source.

## 7. Error handling and trust boundaries

- Invalid structure or values fail import with clear row/field-specific errors.
- Missing observations are reported as quality information, not fatal errors by default.
- Network acquisition is explicit, bounded, HTTPS-only and restricted to registered source hosts. It never runs from simulation or silently refreshes data.
- Imported files are untrusted input. Parsers do not execute content or follow arbitrary links.
- No dataset changes scenario inputs or engine behaviour without explicit user action and a validated, documented transformation.
- No live grid control, telemetry, account system or database is introduced by this architecture.

## 8. Current implementation assessment

Implemented: immutable metadata and registry; bounded acquisition; strict offline parsing; source-unit preservation; blank/zero distinction; missing-period detection; publication status; Phase 4C category-level quality reporting and explicit inclusion policy; Phase 4D measured-reference comparison for aligned demand, PV generation, grid import/export and battery state-of-charge channels.

Not yet implemented: managed raw-file archive/cache; automatic refresh; persistent import identity/history; user-facing import workflow and tabular explorer; independent external reconciliation; a verified measured Malaysian household/site dataset and a calibration study using such data.

## 9. Phase 4 delivery sequence

- **4A — Architecture and contracts:** document data boundaries, provenance and quality semantics. Complete.
- **4B — Malaysian public-data integration:** verify official sources and add bounded explicit acquisition. Complete.
- **4C — Data quality and validation:** report completeness, blanks, gaps and publication status; require explicit inclusion policies. Complete.
- **4D — Simulation validation:** compare aligned simulation channels with explicitly supplied site-level measurements using transparent error metrics and a caller-specified tolerance. The framework does not provide measured data or claim predictive accuracy without an independently sourced dataset. Complete.
- **4E — Data experience:** expose provenance, quality flags, units, filters and source attribution in the desktop app while keeping public reference data separate from scenario inputs. In progress; the initial catalogue view is implemented, while live observation import and local persistence remain out of scope.

## 10. Phase 4D validation contract

`ReferenceMeasurements` accepts one or more measured channels: demand, solar generation, grid import, grid export and battery state of charge. Each channel is a timestamped kWh series and must align exactly with the simulation intervals (timezone-equivalent instants are accepted). The caller records the source name and is responsible for ensuring that the meter boundary corresponds to the simulated quantity.

`validate_simulation_against_reference` reports measurement count, mean absolute error, root mean square error, mean bias error and maximum absolute error for each supplied channel. Measured/modelled totals are reported only for interval-energy channels; battery state of charge is a sampled state and is not summed. A channel passes only when its maximum absolute interval error is within the explicitly supplied absolute tolerance. This tolerance is a caller-selected comparison setting, not a universal engineering standard.

Missing channels are omitted, not inferred. Misaligned timestamps, empty channels, negative measurements and invalid tolerances are rejected. The comparison is offline and does not download, persist, resample, interpolate, impute, calibrate or alter simulation inputs or calculations.

**Evidence limitation:** No independently verified measured Malaysian household dataset is currently bundled with GridMind. Unit tests use clearly synthetic test measurements to verify the comparison mathematics and validation contract; they are not empirical evidence of model accuracy. A real validation study still requires a suitably licensed site-level dataset with matching meter boundaries, intervals, units and provenance.

## 11. Phase 4C and 4D acceptance criteria

- [x] Completeness is reported separately from numeric-value completeness.
- [x] Missing rows and blank cells remain separate.
- [x] Final, provisional and unknown observations are counted separately.
- [x] Default analysis selection includes only numeric final observations.
- [x] Provisional/unknown inclusion requires explicit opt-in.
- [x] No imputation, rescaling or scenario conversion is performed.
- [x] Measured-reference comparison checks exact timestamp alignment.
- [x] Error metrics and an explicit caller-selected tolerance are reported.
- [x] Synthetic unit-test fixtures are not represented as measured validation evidence.
- [ ] Independent source reconciliation and a measured site-level validation study remain future work.
