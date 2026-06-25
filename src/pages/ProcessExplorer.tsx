import { useMemo, useState } from "react";
import type { ProcessRow, Severity } from "../api/types";
import { api } from "../api/client";
import { usePolling } from "../hooks/usePolling";
import { useAppState } from "../store";
import { SeverityBadge, SeverityDot } from "../components/SeverityBadge";
import { formatRelative } from "../utils/format";
import "./ProcessExplorer.css";

type SortKey = "cpu" | "mem" | "pid" | "name" | "private";
type SortDir = "asc" | "desc";

// ─── Column header button ─────────────────────────────────────────────────────
function ColHeader({
  label, sortKey, current, dir, onClick,
}: {
  label: string; sortKey: SortKey; current: SortKey; dir: SortDir; onClick: (k: SortKey) => void;
}) {
  const active = current === sortKey;
  return (
    <th className={`pe-th ${active ? "pe-th--active" : ""}`} onClick={() => onClick(sortKey)}>
      {label} {active ? (dir === "desc" ? "↓" : "↑") : ""}
    </th>
  );
}

// ─── Sparkline-style inline bar (CPU / memory) ───────────────────────────────
function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = Math.min(100, max > 0 ? (value / max) * 100 : 0);
  return (
    <div className="pe-bar-wrap">
      <div className="pe-bar" style={{ width: `${pct}%`, background: color }} />
      <span className="pe-bar-label mono">{value.toFixed(1)}</span>
    </div>
  );
}

// ─── Inline mini process-name tree indicator ──────────────────────────────────
function TreeIndent({ depth }: { depth: number }) {
  if (depth === 0) return null;
  return (
    <span className="pe-indent" aria-hidden>
      {Array.from({ length: depth - 1 }).map((_, i) => (
        <span key={i} className="pe-indent__pipe">│ </span>
      ))}
      <span className="pe-indent__elbow">└ </span>
    </span>
  );
}

// ─── Build a pid→depth map via BFS from root ─────────────────────────────────
function buildDepthMap(rows: ProcessRow[]): Map<number, number> {
  const pidSet = new Set(rows.map((r) => r.pid));
  const childrenOf = new Map<number, number[]>();
  const roots: number[] = [];

  for (const r of rows) {
    if (!pidSet.has(r.ppid) || r.ppid === r.pid) {
      roots.push(r.pid);
    } else {
      const c = childrenOf.get(r.ppid) ?? [];
      c.push(r.pid);
      childrenOf.set(r.ppid, c);
    }
  }

  const depth = new Map<number, number>();
  const queue = roots.map((pid) => ({ pid, d: 0 }));
  while (queue.length) {
    const { pid, d } = queue.shift()!;
    depth.set(pid, d);
    for (const child of childrenOf.get(pid) ?? []) {
      queue.push({ pid: child, d: d + 1 });
    }
  }
  return depth;
}

// ─── Build flat tree order (DFS, parent before children) ─────────────────────
function treeOrder(rows: ProcessRow[]): ProcessRow[] {
  const byPid = new Map(rows.map((r) => [r.pid, r]));
  const pidSet = new Set(rows.map((r) => r.pid));
  const childrenOf = new Map<number, ProcessRow[]>();
  const roots: ProcessRow[] = [];

  for (const r of rows) {
    if (!pidSet.has(r.ppid) || r.ppid === r.pid) {
      roots.push(r);
    } else {
      const c = childrenOf.get(r.ppid) ?? [];
      c.push(r);
      childrenOf.set(r.ppid, c);
    }
  }

  const result: ProcessRow[] = [];
  const visit = (r: ProcessRow) => {
    result.push(r);
    for (const child of childrenOf.get(r.pid) ?? []) visit(child);
  };
  roots.forEach(visit);
  // any orphaned rows not reachable from roots
  for (const r of rows) if (!result.includes(r)) result.push(r);
  return result;
}

// ─── Main component ────────────────────────────────────────────────────────────
export function ProcessExplorer() {
  const { selectedHost, setSelectedHost, knownHosts, refreshMs } = useAppState();

  const [sortKey, setSortKey] = useState<SortKey>("cpu");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [activeOnly, setActiveOnly] = useState(true);
  const [treeMode, setTreeMode] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<ProcessRow | null>(null);
  const [filterSeverity, setFilterSeverity] = useState<Severity | "">("");

  const apiSortKey = sortKey === "private" ? "mem" : sortKey === "mem" ? "mem" : sortKey;

  const poll = usePolling(
    () =>
      selectedHost
        ? api.getProcesses(selectedHost, { activeOnly, sortBy: apiSortKey as "cpu" | "mem" | "pid" | "name" })
        : Promise.resolve([]),
    refreshMs,
    [selectedHost, activeOnly, apiSortKey],
  );

  const rows = poll.data ?? [];

  const maxCpu = useMemo(() => Math.max(...rows.map((r) => r.cpuPercent), 0.1), [rows]);
  const maxMem = useMemo(() => Math.max(...rows.map((r) => r.workingSetMb ?? 0), 1), [rows]);

  const filtered = useMemo(() => {
    let out = rows;
    if (search.trim()) {
      const q = search.toLowerCase();
      out = out.filter(
        (r) =>
          r.processName.toLowerCase().includes(q) ||
          (r.description ?? "").toLowerCase().includes(q) ||
          (r.companyName ?? "").toLowerCase().includes(q) ||
          String(r.pid).includes(q),
      );
    }
    if (filterSeverity) {
      out = out.filter((r) => r.detection?.severity === filterSeverity);
    }
    return out;
  }, [rows, search, filterSeverity]);

  const displayed = useMemo(() => {
    if (treeMode) return treeOrder(filtered);

    return [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "cpu") cmp = a.cpuPercent - b.cpuPercent;
      else if (sortKey === "mem") cmp = (a.workingSetMb ?? 0) - (b.workingSetMb ?? 0);
      else if (sortKey === "private") cmp = (a.privateBytesMb ?? 0) - (b.privateBytesMb ?? 0);
      else if (sortKey === "pid") cmp = a.pid - b.pid;
      else if (sortKey === "name") cmp = a.processName.localeCompare(b.processName);
      return sortDir === "desc" ? -cmp : cmp;
    });
  }, [filtered, treeMode, sortKey, sortDir]);

  const depthMap = useMemo(() => (treeMode ? buildDepthMap(displayed) : new Map<number, number>()), [treeMode, displayed]);

  const handleSort = (k: SortKey) => {
    if (k === sortKey) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSortKey(k); setSortDir("desc"); }
  };

  const totalCpu = useMemo(() => rows.reduce((s, r) => s + r.cpuPercent, 0), [rows]);
  const totalMemMb = useMemo(() => rows.reduce((s, r) => s + (r.workingSetMb ?? 0), 0), [rows]);

  if (!selectedHost) {
    return (
      <div className="pe-no-host">
        <div className="eyebrow">No host selected</div>
        <p>Choose a host in the toolbar above, or click one below once telemetry has arrived.</p>
        <div className="pe-host-list">
          {knownHosts.map((h) => (
            <button key={h} className="host-pick-btn" onClick={() => setSelectedHost(h)}>{h}</button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="pe">
      {/* ── Toolbar ── */}
      <div className="pe-toolbar">
        <div className="pe-toolbar__left">
          <input
            className="pe-search mono"
            type="search"
            placeholder="Filter — name, description, company, PID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="pe-severity-filter mono"
            value={filterSeverity}
            onChange={(e) => setFilterSeverity(e.target.value as Severity | "")}
          >
            <option value="">All severities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>

        <div className="pe-toolbar__right">
          <label className="pe-toggle">
            <input type="checkbox" checked={treeMode} onChange={(e) => setTreeMode(e.target.checked)} />
            <span>Tree view</span>
          </label>
          <label className="pe-toggle">
            <input type="checkbox" checked={activeOnly} onChange={(e) => setActiveOnly(e.target.checked)} />
            <span>Active only</span>
          </label>

          <div className="pe-summary">
            <span className="mono">{displayed.length} proc{displayed.length !== 1 ? "s" : ""}</span>
            <span className="pe-summary__sep" />
            <span className="mono">CPU {totalCpu.toFixed(1)}%</span>
            <span className="pe-summary__sep" />
            <span className="mono">RAM {(totalMemMb / 1024).toFixed(1)} GB</span>
          </div>
        </div>
      </div>

      <div className="pe-layout">
        {/* ── Table ── */}
        <div className="pe-table-wrap">
          {poll.loading && rows.length === 0 ? (
            <div className="pe-loading">
              {poll.error
                ? `Cannot reach backend: ${poll.error.message}`
                : "Waiting for sensor telemetry… Start sensor-agent.ps1 on the target machine."}
            </div>
          ) : (
            <table className="pe-table">
              <thead>
                <tr>
                  <th className="pe-th"></th>{/* severity dot */}
                  <ColHeader label="Process" sortKey="name" current={sortKey} dir={sortDir} onClick={handleSort} />
                  <ColHeader label="PID" sortKey="pid" current={sortKey} dir={sortDir} onClick={handleSort} />
                  <th className="pe-th">Company</th>
                  <th className="pe-th">Description</th>
                  <ColHeader label="CPU %" sortKey="cpu" current={sortKey} dir={sortDir} onClick={handleSort} />
                  <ColHeader label="Working Set" sortKey="mem" current={sortKey} dir={sortDir} onClick={handleSort} />
                  <ColHeader label="Private Bytes" sortKey="private" current={sortKey} dir={sortDir} onClick={handleSort} />
                  <th className="pe-th">Detection</th>
                  <th className="pe-th">Last seen</th>
                </tr>
              </thead>
              <tbody>
                {displayed.map((row) => {
                  const isSelected = selected?.pid === row.pid;
                  const depth = depthMap.get(row.pid) ?? 0;
                  return (
                    <tr
                      key={row.pid}
                      className={[
                        "pe-row",
                        isSelected ? "pe-row--selected" : "",
                        row.terminated ? "pe-row--terminated" : "",
                        row.detection ? `pe-row--${row.detection.severity}` : "",
                      ].join(" ")}
                      onClick={() => setSelected(isSelected ? null : row)}
                    >
                      <td className="pe-td pe-td--dot">
                        {row.detection && <SeverityDot severity={row.detection.severity} />}
                      </td>
                      <td className="pe-td pe-td--name">
                        {treeMode && <TreeIndent depth={depth} />}
                        <span className="pe-proc-name">{row.processName}</span>
                      </td>
                      <td className="pe-td pe-td--pid mono">{row.pid}</td>
                      <td className="pe-td pe-td--company">{row.companyName ?? <span className="pe-nil">—</span>}</td>
                      <td className="pe-td pe-td--desc">{row.description ?? <span className="pe-nil">—</span>}</td>
                      <td className="pe-td pe-td--bar">
                        <Bar value={row.cpuPercent} max={maxCpu} color="var(--accent)" />
                      </td>
                      <td className="pe-td pe-td--bar">
                        <Bar value={row.workingSetMb ?? 0} max={maxMem} color="var(--trace)" />
                      </td>
                      <td className="pe-td pe-td--bar">
                        <Bar value={row.privateBytesMb ?? 0} max={maxMem} color="var(--sev-medium)" />
                      </td>
                      <td className="pe-td">
                        {row.detection
                          ? <SeverityBadge severity={row.detection.severity} />
                          : <span className="pe-nil">—</span>}
                      </td>
                      <td className="pe-td pe-td--time mono">{formatRelative(row.lastSeen)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* ── Detail side panel ── */}
        {selected && (
          <aside className="pe-detail">
            <div className="pe-detail__head">
              <div>
                <div className="eyebrow">Process detail</div>
                <h2 className="pe-detail__name">{selected.processName}</h2>
                {selected.description && <p className="pe-detail__desc">{selected.description}</p>}
              </div>
              <button className="pe-detail__close" onClick={() => setSelected(null)} aria-label="Close">✕</button>
            </div>

            {selected.detection && (
              <div className="pe-detail__alert">
                <SeverityBadge severity={selected.detection.severity} />
                <span className="mono">confidence {selected.detection.confidence}</span>
              </div>
            )}

            <dl className="pe-detail__fields">
              <dt>PID</dt><dd className="mono">{selected.pid}</dd>
              <dt>PPID</dt><dd className="mono">{selected.ppid}</dd>
              <dt>Company</dt><dd>{selected.companyName ?? "—"}</dd>
              <dt>CPU %</dt><dd className="mono">{selected.cpuPercent.toFixed(2)}</dd>
              <dt>Working Set</dt><dd className="mono">{selected.workingSetMb != null ? `${selected.workingSetMb} MB` : "—"}</dd>
              <dt>Private Bytes</dt><dd className="mono">{selected.privateBytesMb != null ? `${selected.privateBytesMb} MB` : "—"}</dd>
              <dt>First seen</dt><dd className="mono">{formatRelative(selected.firstSeen)}</dd>
              <dt>Last seen</dt><dd className="mono">{formatRelative(selected.lastSeen)}</dd>
              <dt>Status</dt><dd className="mono">{selected.terminated ? "Terminated" : "Running"}</dd>
            </dl>

            {selected.executablePath && (
              <>
                <div className="eyebrow" style={{ marginTop: 12 }}>Executable path</div>
                <div className="pe-cmdline mono">{selected.executablePath}</div>
              </>
            )}

            {selected.commandLine && (
              <>
                <div className="eyebrow" style={{ marginTop: 12 }}>Command line</div>
                <div className="pe-cmdline mono">{selected.commandLine}</div>
              </>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}
