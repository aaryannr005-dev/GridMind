import type { ReactNode } from "react";
import { navigationItems } from "../navigation";
import type { PageId } from "../types";

interface TopNavTabsProps {
  activePage: PageId;
  onNavigate: (page: PageId) => void;
}

function NavIcon({ children }: { children: ReactNode }) {
  return <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{children}</svg>;
}

const icons: Record<PageId, ReactNode> = {
  home: <NavIcon><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z" /></NavIcon>,
  simulation: <NavIcon><path d="M2.5 12h3l2.5-6.5L13 18.5l2.5-6.5h6" /></NavIcon>,
  reports: <NavIcon><path d="M4 19V5M4 19h17" /><path d="m7 15 4-4 3 2 5-6" /></NavIcon>,
  "energy-map": <NavIcon><path d="M12 21s6.5-6.2 6.5-11A6.5 6.5 0 0 0 5.5 10c0 4.8 6.5 11 6.5 11Z" /><circle cx="12" cy="9.6" r="2.4" /></NavIcon>,
  settings: <NavIcon><path d="M4 7.5h11M18.5 7.5H20M4 16.5h3M10.5 16.5H20" /><circle cx="16.75" cy="7.5" r="2" /><circle cx="7.25" cy="16.5" r="2" /></NavIcon>,
  about: <NavIcon><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></NavIcon>,
};

export function TopNavTabs({ activePage, onNavigate }: TopNavTabsProps) {
  return (
    <header className="topbar">
      <div className="brand brand-compact">
        <div className="brand-mark" aria-hidden="true">G</div>
        <div className="brand-copy"><strong>gridmind</strong><span>ENERGY ANALYSIS</span></div>
      </div>
      <nav aria-label="Main navigation" className="topnav">
        {navigationItems.map((item) => (
          <button key={item.id} type="button" className={`topnav-tab${activePage === item.id ? " active" : ""}`} aria-label={item.label} aria-current={activePage === item.id ? "page" : undefined} onClick={() => onNavigate(item.id)}>
            <span className="nav-symbol" aria-hidden="true">{icons[item.id]}</span><span>{item.label}</span>
          </button>
        ))}
      </nav>
    </header>
  );
}
