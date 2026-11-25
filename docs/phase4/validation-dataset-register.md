# Phase 4D: Measured-data validation source register

**Research checked:** 25 November 2026  
**Purpose:** Identify measured data that could support validation of GridMind's site-level energy channels. A paper describing measurements is not the same as an accessible, reusable dataset.

## Selection requirements

Before importing any external measurements, confirm:
- the actual downloadable data files and version;
- licence and attribution requirements;
- measurement location and physical meter boundary;
- sampling interval, timestamp convention and timezone;
- units (instantaneous power versus interval energy);
- missing-data, calibration and quality information;
- whether the channels match the modelled quantity.

Do not silently convert power to energy without a documented interval convention. Do not infer household demand or PV output from national monthly totals.

## Candidate 1: Peninsular Malaysia residential smart-meter profiles

- **Publication:** Khamis, N., Sin, T. C., and Hock, G. C. (2018), *Segmentation of Residential Customer Load Profile in Peninsular Malaysia using Jenks Natural Breaks*, 2018 IEEE 7th International Conference on Power and Energy (PECon), DOI: 10.1109/PECON.2018.8684113.
- **Reported measurements:** Six actual residential customers from the Peninsular Malaysia Smart Saver pilot, recorded by smart meters at 30-minute intervals (48 intervals/day).
- **Potential use:** Residential demand-profile validation at 30-minute resolution, if the original measured series can be obtained with reuse permission.
- **Access status:** The publication and abstract are discoverable, but this review did not verify a public download of the underlying six-customer time series. The paper's mention of actual data does not establish that raw data is openly available.
- **Decision:** Highest-priority local household candidate, but do not implement an importer or claim empirical validation until the raw measurements, provenance and reuse terms are confirmed.
- **Publication record:** https://ieeexplore.ieee.org/abstract/document/8684113
- **Institutional record:** https://irepository.uniten.edu.my/handle/123456789/23777

## Candidate 2: Kuala Lumpur measured solar irradiance

- **Dataset:** *Solar Irradiance Data 2025 (Kuala Lumpur, Malaysia)*, UCSI University, contributor Chee Wern Hew, Mendeley Data DOI: 10.17632/bgch4tw79k.1.
- **Reported measurements:** Global horizontal irradiance measured at one-minute resolution in Kuala Lumpur during 2025. The associated Data in Brief article describes a rooftop pyranometer measurement system and its data collection.
- **Licence shown on dataset page:** CC BY 4.0.
- **Potential use:** Local solar-resource and irradiance-input benchmarking after a documented irradiance-to-plane-of-array/PV conversion pipeline exists.
- **Limitations:** GHI is not PV electrical output. It cannot directly validate GridMind's simulated rooftop PV generation or battery/grid flows. Version 2 metadata indicates files are not available for that version; version 1 is the discoverable downloadable record at the time of this review. Confirm file availability and integrity before use.
- **Decision:** Suitable candidate for a separate irradiance-validation track, not a household energy-flow reference dataset.
- **Dataset:** https://data.mendeley.com/datasets/bgch4tw79k/1
- **Related article:** https://doi.org/10.1016/j.dib.2026.113242

## Candidate 3: Hong Kong rooftop PV generation dataset

- **Publication/dataset:** *A high-resolution three-year dataset supporting rooftop photovoltaics (PV) generation analytics*, Scientific Data (2025), DOI: 10.1038/s41597-025-04397-y.
- **Reported measurements:** Measured inverter-level PV generation from 60 grid-connected rooftop PV stations over 2021–2023 at five-minute intervals, with on-site weather measurements.
- **Potential use:** External PV-output benchmarking and robustness tests across real rooftop systems.
- **Limitations:** Hong Kong is not Malaysia; climate, system configuration and irradiance conditions differ. Confirm dataset file access and licence conditions before redistribution or integration.
- **Decision:** Secondary external PV benchmark only. Do not treat it as Malaysian household evidence.
- **Publication:** https://www.nature.com/articles/s41597-025-04397-y

## Rejected as household ground truth

### Malaysian national electricity statistics

OpenDOSM monthly electricity consumption and supply are national aggregates in million kWh. They remain useful for contextual trends but do not provide household-level or sub-hourly reference observations. They must not be used to calculate household interval errors.

### Malaysian institutional circuit measurements

The CLEMD dataset describes circuit-level measurements at an institutional main switchboard over 40 days. Its physical boundary is not a residential household meter and its reported high-rate electrical measurements require a separate processing method. It is not a direct substitute for household demand or PV/grid-flow validation.

## Current Phase 4D implementation decision

GridMind now provides a generic offline comparison API for aligned measured demand, PV generation, grid import/export and battery state-of-charge channels. No external dataset is bundled or automatically downloaded. The Malaysian residential smart-meter study is the most relevant demand-profile lead, but raw data access remains unverified. The Kuala Lumpur GHI dataset is a local solar-resource candidate, not PV output ground truth.

A genuine empirical validation study remains pending until a reusable site-level measurement dataset with compatible channels and documented meter boundaries is secured.
