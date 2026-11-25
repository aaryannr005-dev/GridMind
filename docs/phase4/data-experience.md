# Phase 4E: Data experience

**Status:** Initial desktop catalogue implemented; observation import is not part of this increment.  
**Scope:** Present the verified Malaysian public-energy source register in the desktop app with searchable metadata, explicit quality context and source attribution.  
**Non-goals:** No automatic network refresh, raw-file persistence, fabricated charts, household-profile synthesis, or changes to simulation inputs and calculations.

## User-facing experience

The existing Data & Maps workspace now includes a searchable and filterable catalogue for the two registered OpenDOSM datasets:

- Monthly electricity consumption (electricity_consumption)
- Monthly electricity supply (electricity_supply)

Each dataset card exposes its publisher, national geographic coverage, monthly frequency, source unit (million kWh), data-as-of date, publisher update date, metadata verification date, categories, source caveats, catalogue URL, CSV URL and licence attribution.

The page distinguishes three publication-status concepts in its quality guide: provisional, final and unknown. It also makes the registered six-month provisional window visible for the two OpenDOSM datasets. The displayed dates are source metadata, not a claim that GridMind has freshly downloaded or independently audited the data.

## Discovery and filtering

- Search by dataset title, description, dataset ID, variable name or category.
- Filter by consumption or supply.
- Show the number of matching registered datasets.
- Present an explicit empty state when no dataset matches.

Filtering only changes the visible catalogue cards. It does not filter underlying observation rows because this desktop view does not yet import or store those rows.

## Trust and interpretation safeguards

- National monthly aggregates are labelled as Malaysia-wide context, not household or local-grid measurements.
- The source unit remains million kWh; no rescaling is performed.
- The latest six months are visibly marked provisional under the registered source metadata.
- Missing months, blank values and zero values remain distinct concepts; no imputation or interpolation occurs in the UI.
- The app explicitly states that the current screen is a catalogue, not an imported observation explorer.
- Direct CSV links open the publisher-hosted source. The desktop app does not silently fetch, cache or persist those files.
- Existing historical Energy Commission map references remain labelled as historical, not live grid data.

## Validation and acceptance

- [x] Both registered OpenDOSM datasets appear with verified metadata.
- [x] Geographic coverage, frequency, units and source dates are visible.
- [x] Provisional-window warnings are visible and distinguishable from final/unknown definitions.
- [x] Dataset search and type filters work, including a no-results state.
- [x] Publisher catalogue and CSV links are available.
- [x] CC BY 4.0 attribution is visible.
- [x] National reference data is explicitly separated from household simulation inputs.
- [x] No synthetic observation values or charts are presented as public measurements.
- [ ] Local CSV import, raw-file hash display, persistent import history and observation-level filtering remain future work.
- [ ] Independent source reconciliation and measured Malaysian site validation remain future work.

## Engineering boundary

This increment changes the renderer's Data & Maps experience and its tests/documentation only. It does not modify the Python acquisition, parsing, quality-assessment or simulation-validation algorithms; the engine bridge; optimizer; simulation protocol; or scenario calculations.
