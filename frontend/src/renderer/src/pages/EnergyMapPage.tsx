import { FeedbackState } from "../components/FeedbackState";

const officialMapsUrl = "https://www.st.gov.my/resources/performance-statistical-information-malaysian-electricity-supply-industry-2021";
const mygdiUrl = "https://mygdix.mygeoportal.gov.my/";

export function EnergyMapPage() {
  return (
    <div className="page-stack">
      <div className="page-intro"><span className="eyebrow">REFERENCE</span><h1>Energy map</h1><p>Official reference maps for Malaysia’s major power stations and electricity grid systems.</p></div>
      <FeedbackState kind="warning" title="Historical reference, not live grid data">
        The available Energy Commission map set describes major stations and grid systems as of 2021. It is a static publication, not a live map or an authoritative current asset register.
      </FeedbackState>
      <section className="results-section energy-map-source" aria-labelledby="official-map-title">
        <div className="section-heading"><div><span className="eyebrow">PRIMARY SOURCE · ENERGY COMMISSION</span><h2 id="official-map-title">Electricity supply industry maps</h2></div><span className="subtle-label">AS OF 31 DEC 2021</span></div>
        <p>The publication includes major power-station location maps and electricity transmission-system maps for Peninsular Malaysia, Sabah, and Sarawak. The Energy Commission page lists the publication date as 30 October 2024; the mapped station data is labeled as of 31 December 2021. Some map legends distinguish planned or future lines from existing lines.</p>
        <a className="primary-button energy-map-link" href={officialMapsUrl} target="_blank" rel="noreferrer">Open official Energy Commission map publication <span aria-hidden="true">↗</span></a>
        <p className="energy-map-attribution">Source: Suruhanjaya Tenaga (Energy Commission). The map notes that some material is adapted from TNB. Reuse terms for the map graphic are not stated on the publication page, so GridMind links to the source and does not reproduce it.</p>
      </section>
      <section className="results-section energy-map-source" aria-labelledby="spatial-data-title">
        <div className="section-heading"><div><span className="eyebrow">GEOSPATIAL DATA CATALOGUE</span><h2 id="spatial-data-title">Search for reusable spatial data</h2></div></div>
        <p>Malaysia’s MyGDI Explorer is a catalogue for discovering geospatial datasets and map services. The related MyGeo Data Services map layers require authorized government-agency access, so GridMind cannot use them as an open public data feed.</p>
        <a className="secondary-button energy-map-catalogue-link" href={mygdiUrl} target="_blank" rel="noreferrer">Open MyGDI Explorer <span aria-hidden="true">↗</span></a>
      </section>
    </div>
  );
}
