import { useMemo, useState } from "react";
import { FeedbackState } from "../components/FeedbackState";
import "./data-experience.css";

const officialMapsUrl = "https://www.st.gov.my/resources/performance-statistical-information-malaysian-electricity-supply-industry-2021";
const officialMapPdfUrl = "https://www.st.gov.my/sites/default/files/2026-02/ST_MAISPEM-2021-V15-30-Oct-2024.pdf";
const latestPublicationUrl = "https://www.st.gov.my/maklumat-prestasi-statistik-industri-pembekalan-elektrik-malaysia-2022";
const mygdiUrl = "https://mygdix.mygeoportal.gov.my/";
const licenceUrl = "https://creativecommons.org/licenses/by/4.0/";

type DatasetKind = "consumption" | "supply";

interface PublicDataset {
  id: string;
  kind: DatasetKind;
  title: string;
  description: string;
  catalogueUrl: string;
  csvUrl: string;
  variable: string;
  categories: string[];
  caveat: string;
}

const datasets: PublicDataset[] = [
  {
    id: "electricity_consumption",
    kind: "consumption",
    title: "Monthly electricity consumption",
    description: "Monthly electricity consumption in Malaysia by sector.",
    catalogueUrl: "https://open.dosm.gov.my/data-catalogue/electricity_consumption",
    csvUrl: "https://storage.data.gov.my/energy/electricity_consumption.csv",
    variable: "consumption",
    categories: ["total", "local", "local_commercial", "local_domestic", "exports", "losses"],
    caveat: "Domestic consumption includes public lighting. Commercial use includes industrial and mining sectors.",
  },
  {
    id: "electricity_supply",
    kind: "supply",
    title: "Monthly electricity supply",
    description: "Monthly electricity supply in Malaysia by sector.",
    catalogueUrl: "https://open.dosm.gov.my/data-catalogue/electricity_supply",
    csvUrl: "https://storage.data.gov.my/energy/electricity_supply.csv",
    variable: "supply",
    categories: ["total", "local", "local_public", "local_private", "imports", "distribution"],
    caveat: "The source's sector definitions should be read with the catalogue notes before comparing categories.",
  },
];

function DatasetCard({ dataset }: { dataset: PublicDataset }) {
  return (
    <article className="data-catalogue-card" data-testid={`dataset-${dataset.id}`}>
      <div className="data-card-heading">
        <div>
          <span className="eyebrow">{dataset.kind === "consumption" ? "DEMAND-SIDE CONTEXT" : "SUPPLY-SIDE CONTEXT"}</span>
          <h3>{dataset.title}</h3>
        </div>
        <span className="data-status-pill">Provisional window</span>
      </div>
      <p>{dataset.description}</p>
      <dl className="data-metadata-grid">
        <div><dt>Geography</dt><dd>Malaysia, national aggregate</dd></div>
        <div><dt>Frequency</dt><dd>Monthly</dd></div>
        <div><dt>Source unit</dt><dd>million kWh</dd></div>
        <div><dt>Data through</dt><dd>30 June 2026</dd></div>
        <div><dt>Source updated</dt><dd>8 October 2026</dd></div>
        <div><dt>Metadata checked</dt><dd>25 November 2026</dd></div>
      </dl>
      <div className="data-quality-note" role="note">
        <strong>Quality flag: latest six months provisional</strong>
        <span>January to June 2026 may be revised by the publisher. Do not treat these observations as final.</span>
      </div>
      <div className="data-category-list">
        <strong>Published categories</strong>
        <div>{dataset.categories.map((category) => <code key={category}>{category}</code>)}</div>
      </div>
      <p className="data-caveat">{dataset.caveat}</p>
      <div className="data-source-actions">
        <a className="secondary-button" href={dataset.catalogueUrl} target="_blank" rel="noreferrer">{dataset.kind === "supply" ? "Explore current statistics and download data" : "Source catalogue"} <span aria-hidden="true">↗</span></a>
        <a className="secondary-button" href={dataset.csvUrl} target="_blank" rel="noreferrer">Download CSV <span aria-hidden="true">↗</span></a>
      </div>
      <p className="data-attribution">Attribution: Department of Statistics Malaysia (DOSM), OpenDOSM, “{dataset.title}”, data as of 30 June 2026. Licensed under <a href={licenceUrl} target="_blank" rel="noreferrer">CC BY 4.0</a>. Underlying source agencies include TNB, Sabah Electricity, Sarawak Energy and the Energy Commission.</p>
    </article>
  );
}

export function EnergyMapPage() {
  const [showHistoricalMap, setShowHistoricalMap] = useState(false);
  const [datasetFilter, setDatasetFilter] = useState<"all" | DatasetKind>("all");
  const [datasetSearch, setDatasetSearch] = useState("");
  const visibleDatasets = useMemo(() => datasets.filter((dataset) => {
    const matchesKind = datasetFilter === "all" || dataset.kind === datasetFilter;
    const query = datasetSearch.trim().toLowerCase();
    const matchesQuery = !query || [dataset.title, dataset.description, dataset.id, dataset.variable, ...dataset.categories]
      .some((value) => value.toLowerCase().includes(query));
    return matchesKind && matchesQuery;
  }), [datasetFilter, datasetSearch]);

  return (
    <div className="page-stack data-experience-page">
      <div className="page-intro"><span className="eyebrow">REFERENCE DATA</span><h1>Energy map</h1><p>Explore official Malaysian energy references with their source, coverage, units and quality limitations kept visible.</p></div>

      <FeedbackState kind="warning" title="Reference data is not household simulation input">
        These OpenDOSM datasets are monthly national aggregates. They provide context only. GridMind does not convert them into hourly household demand, solar generation, tariffs or grid constraints.
      </FeedbackState>

      <section className="results-section data-catalogue-section" aria-labelledby="data-catalogue-title">
        <div className="section-heading"><div><span className="eyebrow">OPENDOSM · DEPARTMENT OF STATISTICS MALAYSIA</span><h2 id="data-catalogue-title">Malaysian electricity data catalogue</h2></div><span className="subtle-label">2 VERIFIED SOURCES</span></div>
        <p className="data-catalogue-intro">Browse the registered public datasets. OpenDOSM publishes monthly electricity supply by sector under CC BY 4.0. Metadata was checked on 25 November 2026; source observation coverage and publisher update dates are shown separately.</p>
        <div className="data-catalogue-controls">
          <label className="data-filter-field">Search datasets, variables or categories
            <input type="search" value={datasetSearch} onChange={(event) => setDatasetSearch(event.target.value)} placeholder="e.g. domestic, supply, exports" />
          </label>
          <label className="data-filter-field">Dataset type
            <select value={datasetFilter} onChange={(event) => setDatasetFilter(event.target.value as "all" | DatasetKind)}>
              <option value="all">All datasets</option>
              <option value="consumption">Consumption</option>
              <option value="supply">Supply</option>
            </select>
          </label>
        </div>
        <p className="data-result-count" role="status">{visibleDatasets.length} of {datasets.length} datasets shown</p>
        {visibleDatasets.length > 0
          ? <div className="data-catalogue-grid">{visibleDatasets.map((dataset) => <DatasetCard key={dataset.id} dataset={dataset} />)}</div>
          : <div className="data-empty-state"><strong>No matching datasets</strong><span>Try another search term or choose “All datasets”.</span></div>}
        <div className="data-import-boundary">
          <strong>Import status: catalogue only</strong>
          <p>The desktop app currently presents verified source metadata and direct publisher links. It does not yet import, cache or display the CSV observations in this screen. No sample values or charts are fabricated here.</p>
        </div>
      </section>

      <section className="results-section energy-map-source" aria-labelledby="quality-guide-title">
        <div className="section-heading"><div><span className="eyebrow">HOW TO READ THE DATA</span><h2 id="quality-guide-title">Quality and interpretation guide</h2></div></div>
        <div className="data-quality-guide">
          <div><span className="data-quality-dot provisional" aria-hidden="true" /><strong>Provisional</strong><p>Publisher may revise the observation. The latest six months are flagged provisional in the registered OpenDOSM metadata.</p></div>
          <div><span className="data-quality-dot final" aria-hidden="true" /><strong>Final</strong><p>Outside the stated provisional window according to the current metadata rule. This is not an independent audit of the source value.</p></div>
          <div><span className="data-quality-dot unknown" aria-hidden="true" /><strong>Unknown</strong><p>Publication status cannot be established from the registered metadata. Unknown must not be silently treated as final.</p></div>
        </div>
        <p className="data-method-note">A missing month and a blank value are different from zero. Quality assessment reports gaps and missing values; it does not fill them, interpolate them or rescale the source units.</p>
      </section>

      <section className="results-section energy-map-source" aria-labelledby="official-map-title">
        <div className="section-heading"><div><span className="eyebrow">PRIMARY SOURCE · ENERGY COMMISSION</span><h2 id="official-map-title">Electricity supply industry maps</h2></div><span className="subtle-label">AS OF 31 DEC 2021</span></div>
        <p>The publication includes major power-station location maps and electricity transmission-system maps for Peninsular Malaysia, Sabah, and Sarawak. The Energy Commission page lists the publication date as 30 October 2024; the mapped station data is labeled as of 31 December 2021. Some map legends distinguish planned or future lines from existing lines.</p>
        <div className="energy-map-actions">
          <button className="primary-button energy-map-link" type="button" onClick={() => setShowHistoricalMap(true)} disabled={showHistoricalMap}>View the historical map in GridMind</button>
          <a className="secondary-button energy-map-catalogue-link" href={officialMapsUrl} target="_blank" rel="noreferrer">Open Energy Commission source page <span aria-hidden="true">↗</span></a>
        </div>
        {showHistoricalMap && <div className="energy-map-viewer">
          <div className="section-heading"><div><span className="eyebrow">OFFICIAL DOCUMENT VIEWER</span><h3>Historical map publication</h3></div><button type="button" className="secondary-button" onClick={() => setShowHistoricalMap(false)}>Close map</button></div>
          <iframe title="Energy Commission 2021 electricity supply industry maps" src={officialMapPdfUrl} referrerPolicy="no-referrer" />
          <p>If the document does not appear, <a href={officialMapPdfUrl} target="_blank" rel="noreferrer">open the official PDF</a>.</p>
        </div>}
        <p className="energy-map-attribution">Source: Suruhanjaya Tenaga (Energy Commission). The map notes that some material is adapted from TNB. GridMind displays the document from the Commission’s website; reuse terms for reproducing its map graphics are not stated. The publication is historical and not live grid data.</p>
      </section>

      <section className="results-section energy-map-source" aria-labelledby="latest-publication-title">
        <div className="section-heading"><div><span className="eyebrow">NEWER ENERGY COMMISSION PUBLICATION</span><h2 id="latest-publication-title">Electricity industry statistics for 2022</h2></div><span className="subtle-label">ISSUED 26 MAY 2026</span></div>
        <p>The Commission’s newest electricity-industry statistical publication that I found covers 2022. Its page offers a 35.6 MB PDF. I could not verify whether it contains updated location maps or a reuse license for map graphics, so the 2021 map remains the in-app historical reference.</p>
        <a className="secondary-button energy-map-catalogue-link" href={latestPublicationUrl} target="_blank" rel="noreferrer">Open the 2022 publication page <span aria-hidden="true">↗</span></a>
      </section>

      <section className="results-section energy-map-source" aria-labelledby="spatial-data-title">
        <div className="section-heading"><div><span className="eyebrow">GEOSPATIAL DATA CATALOGUE</span><h2 id="spatial-data-title">Search for reusable spatial data</h2></div></div>
        <p>Malaysia’s MyGDI Explorer is a catalogue for discovering geospatial datasets and map services. The related MyGeo Data Services map layers require authorized government-agency access, so GridMind cannot use them as an open public data feed.</p>
        <a className="secondary-button energy-map-catalogue-link" href={mygdiUrl} target="_blank" rel="noreferrer">Open MyGDI Explorer <span aria-hidden="true">↗</span></a>
      </section>
    </div>
  );
}
