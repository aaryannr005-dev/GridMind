import { EmptyState } from "../components/EmptyState";
import { FeedbackState } from "../components/FeedbackState";

export function HomePage() {
  return (
    <div className="page-stack">
      <section className="welcome-panel">
        <div className="welcome-copy">
          <div className="eyebrow"><span className="eyebrow-line" /> ENERGY SYSTEMS WORKSPACE</div>
          <h1>Make every energy<br /><span>decision explainable.</span></h1>
          <p>Model scenarios, compare strategies, and understand the assumptions behind every result.</p>
          <div className="welcome-tags"><span>LOCAL-FIRST</span><span>REPRODUCIBLE</span><span>PYTHON ENGINE</span></div>
        </div>
        <div className="orbital-art" aria-hidden="true">
          <div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="orbit orbit-three" />
          <div className="orb-core">G<span>↗</span></div>
          <div className="orbit-label label-top">ENERGY FLOW</div><div className="orbit-label label-bottom">MODEL · VALIDATE · COMPARE</div>
        </div>
      </section>
      <FeedbackState kind="info" title="Engine not connected" >
        This is the Stage 1 desktop foundation. No scenario has been loaded, and no simulation or optimisation has been run.
      </FeedbackState>
      <div className="section-heading"><div><span className="eyebrow">WORKSPACE STATUS</span><h2>Ready when you are</h2></div><span className="subtle-label">STAGE 1 OF 5</span></div>
      <div className="status-grid">
        <article className="status-card"><div className="card-icon icon-purple">◈</div><div><h3>Simulation lab</h3><p>Scenario inputs and validation</p></div><span className="status-pill">NOT CONNECTED</span></article>
        <article className="status-card"><div className="card-icon icon-blue">⌁</div><div><h3>Energy analytics</h3><p>Charts from actual engine outputs</p></div><span className="status-pill">NOT AVAILABLE</span></article>
        <article className="status-card"><div className="card-icon icon-amber">▤</div><div><h3>Reports</h3><p>Reproducible result summaries</p></div><span className="status-pill">NO REPORTS</span></article>
      </div>
      <EmptyState icon="⌘" title="No scenarios yet" description="The Python engine bridge will be introduced in Stage 2 after this foundation is reviewed and approved." />
    </div>
  );
}
