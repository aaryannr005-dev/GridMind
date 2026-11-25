# Phase 4B: Malaysian public-energy source register

**Verification date:** 25 November 2026  
**Purpose:** Record authoritative Malaysian energy datasets assessed for GridMind's public-reference-data layer. This register is not a claim that the datasets are household measurements or simulation inputs.

## Selection rules

A dataset is eligible for integration only when its publisher, source URL, licence, geographic scope, frequency, unit, variable definitions, update metadata, and caveats can be verified. Integration must preserve the source's temporal and geographic resolution. A dataset is not promoted into scenario inputs merely because it is energy-related.

## Verified datasets

### 1. Monthly electricity consumption

- **Dataset ID:** `electricity_consumption`
- **Publisher:** OpenDOSM, Department of Statistics Malaysia.
- **Underlying sources:** Tenaga Nasional Berhad, Sabah Electricity Sdn. Bhd., Sarawak Energy Berhad, Energy Commission of Malaysia, and Department of Statistics Malaysia.
- **Coverage / frequency:** Malaysia national aggregate, monthly.
- **Unit:** million kWh.
- **Fields:** `date`, `sector`, `consumption`.
- **Categories:** `total`, `local`, `local_commercial`, `local_domestic`, `exports`, `losses`.
- **Data as of:** 30 June 2026.
- **Last updated:** 8 October 2026.
- **Next update:** Not stated by publisher (N/A).
- **Caveat:** Most recent six months are provisional and may be revised. Domestic consumption includes public lighting; commercial use includes industrial and mining sectors.
- **Licence:** CC BY 4.0.
- **Catalogue:** https://open.dosm.gov.my/data-catalogue/electricity_consumption
- **CSV:** https://storage.data.gov.my/energy/electricity_consumption.csv

### 2. Monthly electricity supply

- **Dataset ID:** `electricity_supply`
- **Publisher:** OpenDOSM, Department of Statistics Malaysia.
- **Underlying sources:** Tenaga Nasional Berhad, Sabah Electricity Sdn. Bhd., Sarawak Energy Berhad, Energy Commission of Malaysia, and Department of Statistics Malaysia.
- **Coverage / frequency:** Malaysia national aggregate, monthly.
- **Unit:** million kWh.
- **Fields:** `date`, `sector`, `supply`.
- **Categories:** `total`, `local`, `local_public`, `local_private`, `imports`, `distribution`.
- **Data as of:** 30 June 2026.
- **Last updated:** 8 October 2026.
- **Next update:** Not stated by publisher (N/A).
- **Caveat:** Most recent six months are provisional and subject to revision.
- **Licence:** CC BY 4.0.
- **Catalogue:** https://open.dosm.gov.my/data-catalogue/electricity_supply
- **CSV:** https://storage.data.gov.my/energy/electricity_supply.csv

## Additional candidate assessed, not yet integrated

### Final energy consumption by sector

- **Dataset ID:** `energy_consumption_sector`
- **Publisher / source:** Energy Commission of Malaysia, published through data.gov.my.
- **Coverage / frequency:** Malaysia national aggregate, annual, data as of 2024.
- **Unit:** kilotonnes of oil equivalent (ktoe).
- **Fields:** `date`, `sector`, `consumption`.
- **Categories:** `total`, `residential`, `commercial`, `industrial`, `transport`, `agriculture`, `fishery`, `non_energy`.
- **Last updated:** 11 October 2026.
- **Next update:** 31 December 2027.
- **Caveats:** Figures may be revised as the National Energy Balance is updated. Fishery-sector consumption is recorded from 2012. Totals may differ slightly from commodity-based breakdowns in some years because each total is calculated from its own breakdown.
- **Licence:** CC BY 4.0.
- **Catalogue:** https://data.gov.my/data-catalogue/energy_consumption_sector
- **CSV:** https://storage.data.gov.my/energy/energy_consumption_sector.csv
- **Decision:** Candidate for a separate annual-series model and parser. Do not force it through the monthly electricity parser or convert ktoe into household kWh inputs.

## Integration decisions

1. Retain the two monthly electricity datasets as contextual national statistics.
2. Refresh the metadata verification date only after checking the live publisher catalogue pages.
3. Keep the annual final-energy dataset separate until its annual-frequency schema and caveats have dedicated parsing and tests.
4. Do not infer state, district, feeder, household, or hourly detail from these national aggregates.
5. Preserve publisher attribution and CC BY 4.0 terms in any downstream display or export.
6. Any future network acquisition must be explicit, bounded, HTTPS-only, and limited to registered source URLs. It must not run during simulation or silently refresh data.

## Verification record

The catalogue pages were checked on 25 November 2026. Dataset-as-of dates and publisher last-updated dates above are reproduced as published; they are not the date GridMind retrieved the files.

- OpenDOSM monthly electricity consumption: https://open.dosm.gov.my/data-catalogue/electricity_consumption
- OpenDOSM monthly electricity supply: https://open.dosm.gov.my/data-catalogue/electricity_supply
- data.gov.my final energy consumption by sector: https://data.gov.my/data-catalogue/energy_consumption_sector
