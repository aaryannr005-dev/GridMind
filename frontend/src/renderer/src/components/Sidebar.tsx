import { navigationItems } from "../navigation";
import type { PageId } from "../types";

interface SidebarProps {
  activePage: PageId;
  onNavigate: (page: PageId) => void;
}

const symbols: Record<PageId, string> = {
  home: "⌂",
  simulation: "◈",
  reports: "▤",
  "energy-map": "⌖",
  data: "◎",
  settings: "⚙",
};

export function Sidebar({ activePage, onNavigate }: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark" aria-hidden="true">G</div>
        <div><strong>gridmind</strong><span>ENERGY INTELLIGENCE</span></div>
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
            <span className="nav-symbol" aria-hidden="true">{symbols[item.id]}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <div className="local-status"><span className="status-dot" />LOCAL WORKSPACE</div>
        <p>Designed for reproducible energy scenarios.</p>
        <div className="version">GRIDMIND · STAGE 4</div>
      </div>
    </aside>
  );
}
