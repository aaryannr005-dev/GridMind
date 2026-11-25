export function AboutPage() {
  return (
    <div className="page-stack">
      <div className="page-intro"><span className="eyebrow">GRIDMIND</span><h1>About GridMind</h1><p>A local-first workspace for exploring residential solar, battery storage and electricity costs.</p></div>
      <section className="form-section about-section">
        <span className="eyebrow">WHAT IT DOES</span>
        <h2>Understand the choices behind your energy bill.</h2>
        <p>GridMind compares a baseline self-consumption strategy with an approximate cost-optimised battery schedule using the scenario you provide.</p>
        <div className="about-facts">
          <div><strong>Local-first</strong><span>Scenario calculations run through the bundled Python engine on this device.</span></div>
          <div><strong>Transparent</strong><span>Results include assumptions, limitations and a reproducibility fingerprint.</span></div>
          <div><strong>Decision support</strong><span>Outputs are modeled estimates, not utility forecasts or guaranteed savings.</span></div>
        </div>
      </section>
      <p className="form-help">GridMind is an educational energy modelling tool. Always verify tariffs, equipment specifications and grid constraints with the relevant providers before making real-world decisions.</p>
    </div>
  );
}
