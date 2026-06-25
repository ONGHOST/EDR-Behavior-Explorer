import { useMemo, useState } from "react";
import type { Detection, GraphNode, Severity } from "../api/types";
import { SeverityDot } from "./SeverityBadge";
import { formatBytes, formatCpu, formatRelative, severityRank } from "../utils/format";
import "./ProcessesTable.css";

type SortKey = "processName" | "pid" | "lastCpuPercent" | "lastWorkingSetBytes" | "lastPrivateBytesBytes" | "companyName";

export function ProcessesTable({ nodes, detections }: { nodes: GraphNode[]; detections: Detection[] }) {
  const [search, setSearch] = useState("");
  const [showTerminated, setShowTerminated] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("lastCpuPercent");
  const [sortDir, setSortDir] = useState<1 | -1>(-1);

  const sevByPid = useMemo(() => {
    const map = new Map<number, Severity>();
    for (const d of detections) {
      const current = map.get(d.pid);
      if (!current || severityRank(d.severity) < severityRank(current)) map.set(d.pid, d.severity);
    }
    return map;
  }, [detections]);

  const rows = useMemo(() => {
    let list = nodes;
    if (!showTerminated) list = list.filter((n) => !n.terminatedAt);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (n) =>
          n.processName.toLowerCase().includes(q) ||
          (n.companyName ?? "").toLowerCase().includes(q) ||
          (n.description ?? "").toLowerCase().includes(q) ||
          String(n.pid).includes(q),
      );
    }
    return [...list].sort((a, b) => {
      const av = a[sortKey] ?? (typeof a[sortKey] === "string" ? "" : -Infinity);
      const bv = b[sortKey] ?? (typeof b[sortKey] === "string" ? "" : -Infinity);
      if (av < bv) return -1 * sortDir;
      if (av > bv) return 1 * sortDir;
      return 0;
    });
  }, [nodes, search, showTerminated, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 1 ? -1 : 1));
    } else {
      setSortKey(key);
      setSortDir(-1);
    }
  };

  const Th = ({ k, children }: { k: SortKey; children: React.ReactNode }) => (
    <th onClick={() => toggleSort(k)} className="pt-table__th-sort">
      {children} {sortKey === k && (sortDir === 1 ? "▲" : "▼")}
    </th>
  );

  return (
    <div className="pt">
      <div className="pt__toolbar">
        <input
          className="pt__search"
          placeholder="Filter by process, company, description, pid…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <label className="pt__toggle">
          <input type="checkbox" checked={showTerminated} onChange={(e) => setShowTerminated(e.target.checked)} />
          Show terminated
        </label>
        <span className="eyebrow">{rows.length} process(es)</span>
      </div>

      <div className="pt__scroll">
        <table className="pt-table">
          <thead>
            <tr>
              <th></th>
              <Th k="processName">Process</Th>
              <Th k="companyName">Company name</Th>
              <th>Description</th>
              <Th k="pid">PID</Th>
              <Th k="lastCpuPercent">CPU</Th>
              <Th k="lastWorkingSetBytes">Working set</Th>
              <Th k="lastPrivateBytesBytes">Private bytes</Th>
              <th>Last sample</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((n) => {
              const sev = sevByPid.get(n.pid);
              return (
                <tr key={n.pid} className={n.terminatedAt ? "pt-table__row--terminated" : ""}>
                  <td>{sev && <SeverityDot severity={sev} />}</td>
                  <td className="mono pt-table__name" title={n.executablePath}>
                    {n.processName}
                  </td>
                  <td className="pt-table__company">{n.companyName ?? <span className="pt-table__unknown">Unknown</span>}</td>
                  <td className="pt-table__desc" title={n.description}>
                    {n.description ?? "—"}
                  </td>
                  <td className="mono">
                    {n.pid} <span className="pt-table__ppid">← {n.ppid}</span>
                  </td>
                  <td className="mono">{formatCpu(n.lastCpuPercent)}</td>
                  <td className="mono">{formatBytes(n.lastWorkingSetBytes)}</td>
                  <td className="mono">{formatBytes(n.lastPrivateBytesBytes)}</td>
                  <td className="mono pt-table__sample-age">
                    {n.lastSampleAt ? formatRelative(n.lastSampleAt) : "no samples"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <div className="empty-state">No processes match.</div>}
      </div>
    </div>
  );
}
