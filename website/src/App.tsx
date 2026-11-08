import { useState } from "react";

const Arrow = () => <span aria-hidden="true">↗</span>;

function EnergyGraphic() {
  return (
    <div className="energy-visual" aria-label="Illustration of energy moving between solar generation, a home, battery storage and the grid">
      <div className="visual-topline"><span className="live-dot" /> SYSTEM OVERVIEW <span className="mono">/ CONCEPT MODEL</span></div>
      <svg className="flow-lines" viewBox="0 0 620 390" role="img" aria-hidden="true">
        <defs>
          <linearGradient id="flow" x1="0" x2="1"><stop stopColor="#a5efc5"/><stop offset="1" stopColor="#55cbb0"/></linearGradient>
          <filter id="glow"><feGaussianBlur stdDeviation="4" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        </defs>
        <path d="M310 88 V145 M310 145 H145 V205 M310 145 H475 V205 M145 263 V315 H310 V345 M475 263 V315 H310" stroke="#31564b" strokeWidth="2" fill="none" strokeDasharray="5 7"/>
        <path d="M310 88 V145 H145 V205 M310 145 H475 V205 M145 263 V315 H310 V345" stroke="url(#flow)" strokeWidth="2" fill="none" strokeDasharray="3 12" filter="url(#glow)" className="animated-flow"/>
        <circle cx="310" cy="145" r="5" fill="#a5efc5"/>
      </svg>
      <div className="node node-solar"><span className="node-icon">☼</span><span className="node-label">SOLAR</span><strong>Generation</strong><small>Energy produced</small></div>
      <div className="node node-home"><span className="node-icon">⌂</span><span className="node-label">DEMAND</span><strong>Consumption</strong><small>Energy used</small></div>
      <div className="node node-battery"><span className="node-icon">▰</span><span className="node-label">STORAGE</span><strong>Battery</strong><small>Energy shifted</small></div>
      <div className="node node-grid"><span className="node-icon">⌁</span><span className="node-label">GRID</span><strong>Import / export</strong><small>Energy exchanged</small></div>
      <div className="visual-foot"><span>ENERGY IS A SYSTEM.</span><span className="mono">MODEL THE CONNECTIONS →</span></div>
    </div>
  );
}

function App() {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <main>
      <header className="nav-wrap">
        <a className="brand" href="#" aria-label="GridMind home"><span className="brand-mark">G<span>·</span></span><span>GRIDMIND</span></a>
        <button className="menu-toggle" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle navigation" aria-expanded={menuOpen}>☰</button>
        <nav className={menuOpen ? "nav-links open" : "nav-links"}>
          <a href="#platform" onClick={() => setMenuOpen(false)}>Platform</a>
          <a href="#how-it-works" onClick={() => setMenuOpen(false)}>How it works</a>
          <a href="#principles" onClick={() => setMenuOpen(false)}>Principles</a>
          <a className="nav-cta" href="https://github.com/aaryannr005-dev/GridMind/releases" target="_blank" rel="noreferrer">Explore releases <Arrow /></a>
        </nav>
      </header>

      <section className="hero section-shell">
        <div className="hero-copy">
          <div className="eyebrow"><span className="eyebrow-line" /> ENERGY, MADE UNDERSTANDABLE</div>
          <h1>The future of energy<br/><em>isn't just generated.</em><br/>It's intelligently used.</h1>
          <p className="hero-lede">Understand the relationship between generation, demand, storage and cost. GridMind turns energy scenarios into decisions you can actually explore.</p>
          <div className="hero-actions">
            <a className="button button-primary" href="#platform">Explore the platform <Arrow /></a>
            <a className="text-link" href="#how-it-works">See how it works <span>↓</span></a>
          </div>
          <div className="hero-note"><span className="live-dot" /> LOCAL-FIRST BY DESIGN <span className="note-divider">/</span> BUILT FOR EXPLORATION</div>
        </div>
        <EnergyGraphic />
        <div className="hero-index"><span>01</span><span className="index-line"/><span>ENERGY SYSTEMS</span></div>
      </section>

      <section className="statement-band">
        <div className="section-shell statement-inner">
          <span className="eyebrow">THE BIGGER PICTURE</span>
          <p>We don't only need more energy.<br/><strong>We need to make better use of the energy we have.</strong></p>
          <span className="statement-mark">“</span>
        </div>
      </section>

      <section className="section-shell platform-section" id="platform">
        <div className="section-heading">
          <div><span className="eyebrow">01 / THE PLATFORM</span><h2>See the whole<br/><em>energy picture.</em></h2></div>
          <p>Energy decisions are connected. Change one part of a system and the rest responds. GridMind gives you a place to model those relationships, compare strategies and understand the trade-offs.</p>
        </div>
        <div className="feature-grid">
          <article className="feature-card feature-main"><div className="feature-number">01</div><div className="feature-symbol">⌁</div><h3>Simulate scenarios</h3><p>Bring demand, solar generation, tariffs and battery settings together in one consistent scenario.</p><span className="feature-tag">MODEL THE SYSTEM</span></article>
          <article className="feature-card"><div className="feature-number">02</div><div className="feature-symbol">⇄</div><h3>Compare strategies</h3><p>Explore self-consumption and cost-oriented battery dispatch side by side.</p><span className="feature-tag">UNDERSTAND TRADE-OFFS</span></article>
          <article className="feature-card"><div className="feature-number">03</div><div className="feature-symbol">▤</div><h3>Read the results</h3><p>Turn interval flows and model outputs into metrics, comparisons and structured reports.</p><span className="feature-tag">MAKE IT INTERPRETABLE</span></article>
        </div>
      </section>

      <section className="method-section" id="how-it-works">
        <div className="section-shell method-inner">
          <div className="method-copy"><span className="eyebrow">02 / HOW IT WORKS</span><h2>From inputs<br/>to <em>insight.</em></h2><p>Start with a scenario. Let the model calculate how energy moves. Then compare what changes when the strategy changes.</p><a className="text-link" href="https://github.com/aaryannr005-dev/GridMind" target="_blank" rel="noreferrer">Explore the project on GitHub <Arrow /></a></div>
          <div className="steps">
            <div className="step"><span>01</span><div><h3>Define the scenario</h3><p>Set demand, solar generation, tariffs and battery constraints.</p></div><b>INPUT</b></div>
            <div className="step"><span>02</span><div><h3>Run the model</h3><p>Calculate energy flows and evaluate a battery dispatch strategy.</p></div><b>SIMULATE</b></div>
            <div className="step"><span>03</span><div><h3>Compare outcomes</h3><p>Review imports, exports, battery activity and estimated costs.</p></div><b>INTERPRET</b></div>
          </div>
        </div>
      </section>

      <section className="section-shell principles-section" id="principles">
        <span className="eyebrow">03 / BUILT ON CLEAR PRINCIPLES</span>
        <div className="principles-layout"><h2>Useful models.<br/><em>Honest boundaries.</em></h2><div className="principles-list"><div><span>↗</span><p><strong>Local-first</strong>Scenario work is designed to run locally, without requiring an account or cloud service.</p></div><div><span>◉</span><p><strong>Transparent assumptions</strong>Inputs and model boundaries matter. Results should be understood in context.</p></div><div><span>⌁</span><p><strong>Decision support, not control</strong>GridMind explores modeled scenarios. It does not operate or control real electricity grids.</p></div></div></div>
      </section>

      <section className="closing-cta">
        <div className="section-shell closing-inner"><span className="eyebrow">THINK CLEARER ABOUT ENERGY</span><h2>Make the invisible<br/><em>understandable.</em></h2><p>Explore the project, follow its development and see where energy modelling can take you.</p><div className="hero-actions"><a className="button button-primary" href="https://github.com/aaryannr005-dev/GridMind" target="_blank" rel="noreferrer">View GridMind on GitHub <Arrow /></a><a className="button button-quiet" href="https://github.com/aaryannr005-dev/GridMind/releases" target="_blank" rel="noreferrer">View releases</a></div></div>
      </section>

      <footer className="footer section-shell"><a className="brand" href="#"><span className="brand-mark">G<span>·</span></span><span>GRIDMIND</span></a><span>ENERGY SYSTEMS, MADE CLEARER.</span><span>© {new Date().getFullYear()} GRIDMIND</span></footer>
    </main>
  );
}

export default App;