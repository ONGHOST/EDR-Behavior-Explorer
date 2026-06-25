import type { ReactElement } from "react";
import type { Route } from "../hooks/useHashRoute";
import { useAppState } from "../store";
import { usePolling } from "../hooks/usePolling";
import { api } from "../api/client";
import "./Layout.css";

const NAV: Array<{ route: Route; label: string; icon: ReactElement }> = [
  {
    route: "overview",
    label: "Overview",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <rect x="3.5" y="3.5" width="7" height="7" rx="1.2" />
        <rect x="13.5" y="3.5" width="7" height="7" rx="1.2" />
        <rect x="3.5" y="13.5" width="7" height="7" rx="1.2" />
        <rect x="13.5" y="13.5" width="7" height="7" rx="1.2" />
      </svg>
    ),
  },
  {
    route: "processes",
    label: "Processes",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <rect x="3.5" y="5" width="17" height="14" rx="1.5" />
        <path d="M3.5 9.5h17" />
        <circle cx="6.3" cy="7.2" r="0.5" fill="currentColor" stroke="none" />
        <path d="M7.5 13h9M7.5 16h6" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    route: "detections",
    label: "Detections",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M12 3.5 4 7v5.2c0 4.6 3.3 7.6 8 8.8 4.7-1.2 8-4.2 8-8.8V7l-8-3.5Z" />
        <path d="M12 8v5" strokeLinecap="round" />
        <circle cx="12" cy="16" r="0.6" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    route: "graph",
    label: "Process Graph",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <circle cx="12" cy="5" r="2" />
        <circle cx="5.5" cy="18" r="2" />
        <circle cx="18.5" cy="18" r="2" />
        <path d="M12 7v4M12 11 6.6 16.3M12 11l5.4 5.3" />
      </svg>
    ),
  },
  {
    route: "audit",
    label: "Audit Log",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <rect x="4.5" y="3.5" width="15" height="17" rx="1.5" />
        <path d="M8 8h8M8 12h8M8 16h5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    route: "chunks",
    label: "Training Chunks",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <ellipse cx="12" cy="6" rx="7" ry="2.6" />
        <path d="M5 6v6c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6V6" />
        <path d="M5 12v6c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6v-6" />
      </svg>
    ),
  },
];

export function Rail({ route, navigate }: { route: Route; navigate: (r: Route) => void }) {
  return (
    <nav className="rail">
      <div className="rail__mark" title="Behavior Explorer">
        BX
      </div>
      {NAV.map((item) => (
        <button
          key={item.route}
          className={`rail__item ${route === item.route ? "rail__item--active" : ""}`}
          onClick={() => navigate(item.route)}
          title={item.label}
          aria-label={item.label}
          aria-current={route === item.route ? "page" : undefined}
        >
          {item.icon}
        </button>
      ))}
    </nav>
  );
}

const PAGE_TITLES: Record<Route, string> = {
  overview: "Overview",
  processes: "Live Processes",
  detections: "Detections",
  graph: "Process Graph",
  audit: "Audit Log",
  chunks: "Training Chunks",
};

export function Topbar({ route }: { route: Route }) {
  const { selectedHost, setSelectedHost, knownHosts, refreshMs, setRefreshMs } = useAppState();
  const heartbeat = usePolling(() => api.verifyAudit(), refreshMs);

  return (
    <header className="topbar">
      <div className="topbar__title">
        <h1>{PAGE_TITLES[route]}</h1>
        <span className="eyebrow">EDR Behavior Explorer</span>
      </div>

      <div className="topbar__controls">
        <label className="field">
          <span className="eyebrow">Host</span>
          <select value={selectedHost} onChange={(e) => setSelectedHost(e.target.value)}>
            <option value="">All hosts</option>
            {knownHosts.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span className="eyebrow">Refresh</span>
          <select value={refreshMs} onChange={(e) => setRefreshMs(Number(e.target.value))}>
            <option value={2000}>2s</option>
            <option value={5000}>5s</option>
            <option value={15000}>15s</option>
            <option value={30000}>30s</option>
          </select>
        </label>

        <div className={`status-pill ${heartbeat.connected ? "status-pill--ok" : "status-pill--down"}`}>
          <span className="status-pill__dot" />
          {heartbeat.connected ? "Connected" : "Unreachable"}
          {heartbeat.connected && heartbeat.data && !heartbeat.data.valid && (
            <span className="status-pill__warn">· chain tampered</span>
          )}
        </div>
      </div>
    </header>
  );
}
