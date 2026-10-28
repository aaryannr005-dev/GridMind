import { useState } from "react";
import { FeedbackState } from "../components/FeedbackState";

const officialMapsUrl = "https://www.st.gov.my/resources/performance-statistical-information-malaysian-electricity-supply-industry-2021";
const officialMapPdfUrl = "https://www.st.gov.my/sites/default/files/2026-02/ST_MAISPEM-2021-V15-30-Oct-2024.pdf";
const latestPublicationUrl = "https://www.st.gov.my/maklumat-prestasi-statistik-industri-pembekalan-elektrik-malaysia-2022";
const mygdiUrl = "https://mygdix.mygeoportal.gov.my/";
const currentSupplyUrl = "https://open.dosm.gov.my/data-catalogue/electricity_supply";

export function EnergyMapPage() {
  const [showHistoricalMap, setShowHistoricalMap] = useState(false);

  return (
    <div className="page-stack">
      <div className="page-intro"><span className="eyebrow">REFERENCE</span><h1>Energy map</h1><p>Explore a historical Energy Commission map publication and find current, licensed national electricity statistics.</p></div>
      <FeedbackState kind="warning" title="Historical reference, not live grid data">
        The available Energy Commission map set describes major stations and grid systems as of 2021. It is a static publication, not a live map or an authoritative current asset register.
      </FeedbackState>
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
      <section className="results-section energy-map-source" aria-labelledby="current-stats-title">
        <div className="section-heading"><div><span className="eyebrow">CURRENT PUBLIC STATISTICS · OPENDOSM</span><h2 id="current-stats-title">Monthly electricity supply</h2></div><span className="subtle-label">DATA THROUGH 30 JUN 2026</span></div>
        <p>OpenDOSM publishes monthly electricity supply by sector under CC BY 4.0. The latest six months are provisional. This dataset is national and has no state or facility locations, so it can add current context but cannot update the historical map or describe local grid conditions.</p>
        <a className="secondary-button energy-map-catalogue-link" href={currentSupplyUrl} target="_blank" rel="noreferrer">Explore current statistics and download data <span aria-hidden="true">↗</span></a>
        <p className="energy-map-attribution">Attribution: Department of Statistics Malaysia (DOSM), OpenDOSM, “Monthly Electricity Supply,” data as of 30 June 2026, <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a>. Source agencies include TNB, Sabah Electricity, Sarawak Energy, and the Energy Commission. GridMind does not store a copy of this dataset.</p>
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
