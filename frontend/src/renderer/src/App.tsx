import { useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { HomePage } from "./pages/HomePage";
import { PlaceholderPage } from "./pages/PlaceholderPage";
import { getNavigationItem } from "./navigation";
import type { PageId } from "./types";

export default function App() {
  const [activePage, setActivePage] = useState<PageId>("home");
  const page = getNavigationItem(activePage);
  return (
    <div className="app-shell">
      <Sidebar activePage={activePage} onNavigate={setActivePage} />
      <main className="main-panel">
        <header className="topbar">
          <div className="breadcrumb"><span>GRIDMIND</span><span className="crumb-separator">/</span><strong>{page.label}</strong></div>
          <div className="topbar-right"><span className="connection-indicator"><i />ENGINE OFFLINE</span><div className="avatar" aria-label="Local workspace">GM</div></div>
        </header>
        <div className="page-content">
          {activePage === "home" ? <HomePage /> : <PlaceholderPage page={page} />}
          <footer className="app-footer"><span>GRIDMIND <b>•</b> LOCAL ENERGY SIMULATION</span><span>NO SCENARIO LOADED</span></footer>
        </div>
      </main>
    </div>
  );
}
