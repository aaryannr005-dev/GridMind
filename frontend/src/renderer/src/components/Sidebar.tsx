import type { ReactNode } from "react";
import { navigationItems } from "../navigation";
import type { PageId } from "../types";

interface SidebarProps {
  activePage: PageId;
  onNavigate: (page: PageId) => void;
}

function NavIcon({ viewBox, children }: { viewBox: string; children: ReactNode }) {
  return (
    <svg viewBox={viewBox} width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

const icons: Record<PageId, ReactNode> = {
  // Overview: gauge dial
  home: (
    <NavIcon viewBox="0 0 24 24">
      <path d="M4 14.5a8 8 0 1 1 16 0" />
      <path d="M12 14.5 15.8 9.6" />
      <path d="M4 18.5h16" />
    </NavIcon>
  ),
  // Simulation lab: waveform with node
  simulation: (
    <NavIcon viewBox="0 0 24 24">
      <path d="M2.5 12h3l2.5-6.5L13 18.5l2.5-6.5h6" />
    </NavIcon>
  ),
  // Reports: document with lines
  reports: (
    <NavIcon viewBox="0 0 24 24">
      <path d="M6.5 2.5h8l4 4v15h-12z" />
      <path d="M14.5 2.5v4h4" />
      <path d="M9 12h6M9 15.5h6M9 8h2" />
    </NavIcon>
  ),
  // Energy map: location pin
  "energy-map": (
    <NavIcon viewBox="0 0 24 24">
      <path d="M12 21s6.5-6.2 6.5-11A6.5 6.5 0 0 0 5.5 10c0 4.8 6.5 11 6.5 11Z" />
      <circle cx="12" cy="9.6" r="2.4" />
    </NavIcon>
  ),
  // Data sources: database
  data: (
    <NavIcon viewBox="0 0 24 24">
      <ellipse cx="12" cy="5.5" rx="7" ry="2.8" />
      <path d="M5 5.5v7c0 1.55 3.13 2.8 7 2.8s7-1.25 7-2.8v-7" />
      <path d="M5 12.5v6c0 1.55 3.13 2.8 7 2.8s7-1.25 7-2.8v-6" />
    </NavIcon>
  ),
  // Preferences: sliders
  settings: (
    <NavIcon viewBox="0 0 24 24">
      <path d="M4 7.5h11M18.5 7.5H20M4 16.5h3M10.5 16.5H20" />
      <circle cx="16.75" cy="7.5" r="2" />
      <circle cx="7.25" cy="16.5" r="2" />
    </NavIcon>
  ),
};

export function Sidebar({ activePage, onNavigate }: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark" aria-hidden="true">G</div>
        <div><strong>gridmind</strong><span>ENERGY ANALYSIS</span></div>
      </div>
      <div className="nav-caption">WORKSPACE</div>
      <nav aria-label="Main navigation" className="nav-list">
        {navigationItems.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`nav-item ${activePage === item.id ? "active" : ""}`}
            aria-label={item.label}
            aria-current={activePage === item.id ? "page" : undefined}
            onClick={() => onNavigate(item.id)}
          >
            <span className="nav-symbol" aria-hidden="true">{icons[item.id]}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <div className="local-status"><span className="status-dot" />LOCAL WORKSPACE</div>
        <p>Reproducible energy scenarios, computed entirely on this device.</p>
        <div className="version">GRIDMIND · STAGE 4</div>
      </div>
    </aside>
  );
}
