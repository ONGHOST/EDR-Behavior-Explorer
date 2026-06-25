import { useMemo, useState } from "react";
import { stratify, tree, type HierarchyPointNode } from "d3-hierarchy";
import type { Detection, GraphNode, GraphSnapshot, Severity } from "../api/types";
import { SeverityDot } from "./SeverityBadge";
import { formatBytes, formatCpu, formatDateTime, severityRank } from "../utils/format";
import "./ProcessGraph.css";

interface StratRow {
  id: string;
  parentId: string | null;
  node?: GraphNode;
}

const NODE_W = 152;
const NODE_H = 46;
const COLOR_VAR: Record<Severity, string> = {
  critical: "var(--sev-critical)",
  high: "var(--sev-high)",
  medium: "var(--sev-medium)",
  low: "var(--sev-low)",
};

function buildLayout(snapshot: GraphSnapshot) {
  const ids = new Set(snapshot.nodes.map((n) => String(n.pid)));
  const rows: StratRow[] = [{ id: "__root__", parentId: null }];
  for (const n of snapshot.nodes) {
    const parentId = n.pid === n.ppid || !ids.has(String(n.ppid)) ? "__root__" : String(n.ppid);
    rows.push({ id: String(n.pid), parentId, node: n });
  }

  const root = stratify<StratRow>()
    .id((d) => d.id)
    .parentId((d) => d.parentId)(rows);

  const layout = tree<StratRow>().nodeSize([NODE_W + 28, NODE_H + 54]);
  const positioned = layout(root);

  const real = positioned.descendants().filter((d) => d.data.node) as HierarchyPointNode<StratRow>[];
  const edges = real.filter((d) => d.parent?.data.node).map((d) => ({ parent: d.parent!, child: d }));

  const xs = real.map((d) => d.x);
  const minX = xs.length ? Math.min(...xs) : 0;
  const maxX = xs.length ? Math.max(...xs) : 0;
  const maxY = real.length ? Math.max(...real.map((d) => d.y)) : 0;

  return {
    nodes: real,
    edges,
    width: maxX - minX + NODE_W + 80,
    height: maxY + NODE_H + 80,
    offsetX: -minX + 40,
  };
}

function severityMap(detections: Detection[], hostId: string): Map<number, Severity> {
  const map = new Map<number, Severity>();
  for (const d of detections) {
    if (d.hostId !== hostId) continue;
    const current = map.get(d.pid);
    if (!current || severityRank(d.severity) < severityRank(current)) {
      map.set(d.pid, d.severity);
    }
  }
  return map;
}

function elbowPath(x1: number, y1: number, x2: number, y2: number): string {
  const midY = y1 + (y2 - y1) / 2;
  return `M ${x1} ${y1} V ${midY} H ${x2} V ${y2}`;
}

export function ProcessGraph({ snapshot, detections }: { snapshot: GraphSnapshot; detections: Detection[] }) {
  const [selectedPid, setSelectedPid] = useState<number | null>(null);
  const layout = useMemo(() => buildLayout(snapshot), [snapshot]);
  const sevByPid = useMemo(() => severityMap(detections, snapshot.hostId), [detections, snapshot.hostId]);

  const selected = layout.nodes.find((n) => n.data.node!.pid === selectedPid)?.data.node ?? null;
  const selectedDetections = selected ? detections.filter((d) => d.pid === selected.pid && d.hostId === selected.hostId) : [];
  const selectedLineage = selected ? buildLineagePath(layout.nodes, selected.pid) : [];

  return (
    <div className="pg">
      <div className="pg__canvas-wrap">
        <svg
          className="pg__svg"
          width={layout.width}
          height={layout.height}
          viewBox={`0 0 ${layout.width} ${layout.height}`}
        >
          <g transform={`translate(${layout.offsetX}, 30)`}>
            {layout.edges.map(({ parent, child }, i) => {
              const childSev = sevByPid.get(child.data.node!.pid);
              const cls = childSev ? `pg-edge pg-edge--${childSev}` : "pg-edge";
              return (
                <path
                  key={i}
                  className={cls}
                  d={elbowPath(parent.x, parent.y + NODE_H / 2, child.x, child.y - NODE_H / 2)}
                  fill="none"
                />
              );
            })}

            {layout.nodes.map((n) => {
              const node = n.data.node!;
              const sev = sevByPid.get(node.pid);
              const isSelected = selectedPid === node.pid;
              return (
                <g
                  key={node.pid}
                  transform={`translate(${n.x - NODE_W / 2}, ${n.y - NODE_H / 2})`}
                  className={`pg-node ${sev ? `pg-node--${sev}` : ""} ${isSelected ? "pg-node--selected" : ""}`}
                  onClick={() => setSelectedPid(node.pid)}
                  tabIndex={0}
                  role="button"
                  aria-label={`${node.processName}, pid ${node.pid}`}
                  onKeyDown={(e) => e.key === "Enter" && setSelectedPid(node.pid)}
                >
                  <rect width={NODE_W} height={NODE_H} rx={6} className="pg-node__rect" />
                  <text x={10} y={18} className="pg-node__name">
                    {truncate(node.processName, 19)}
                  </text>
                  <text x={10} y={34} className="pg-node__pid">
                    pid {node.pid} · ppid {node.ppid}
                  </text>
                  {sev && <circle cx={NODE_W - 12} cy={12} r={4} fill={COLOR_VAR[sev]} />}
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      <aside className="pg__detail">
        {!selected ? (
          <div className="pg__detail-empty">
            <div className="eyebrow">Process detail</div>
            <p>Click any node to inspect its command line, lineage, and associated detections.</p>
            <div className="pg__legend">
              <div className="eyebrow">Legend</div>
              {(["critical", "high", "medium", "low"] as Severity[]).map((s) => (
                <div className="pg__legend-row" key={s}>
                  <SeverityDot severity={s} />
                  <span>{s} — has an associated detection</span>
                </div>
              ))}
              <div className="pg__legend-row">
                <span className="pg__legend-line" />
                <span>no associated detection</span>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="eyebrow">Process detail</div>
            <h3 className="pg__detail-name">{selected.processName}</h3>
            {sevByPid.has(selected.pid) && <SeverityDot severity={sevByPid.get(selected.pid)!} />}
            <dl className="pg__fields">
              <dt>PID</dt>
              <dd className="mono">{selected.pid}</dd>
              <dt>PPID</dt>
              <dd className="mono">{selected.ppid}</dd>
              <dt>Company</dt>
              <dd className="mono">{selected.companyName ?? "Unknown"}</dd>
              <dt>Description</dt>
              <dd className="mono">{selected.description ?? "—"}</dd>
              <dt>CPU</dt>
              <dd className="mono">{formatCpu(selected.lastCpuPercent)}</dd>
              <dt>Working set</dt>
              <dd className="mono">{formatBytes(selected.lastWorkingSetBytes)}</dd>
              <dt>Private bytes</dt>
              <dd className="mono">{formatBytes(selected.lastPrivateBytesBytes)}</dd>
              <dt>First seen</dt>
              <dd className="mono">{formatDateTime(selected.firstSeen)}</dd>
              <dt>Last seen</dt>
              <dd className="mono">{formatDateTime(selected.lastSeen)}</dd>
              <dt>Terminated</dt>
              <dd className="mono">{selected.terminatedAt ? formatDateTime(selected.terminatedAt) : "—"}</dd>
              {selected.commandLine && (
                <>
                  <dt>Command line</dt>
                  <dd className="mono pg__cmdline">{selected.commandLine}</dd>
                </>
              )}
            </dl>

            <div className="eyebrow">Lineage</div>
            <div className="pg__lineage mono">{selectedLineage.join(" → ")}</div>

            <div className="eyebrow">Detections ({selectedDetections.length})</div>
            {selectedDetections.length === 0 ? (
              <p className="pg__no-det">No detections tied to this process.</p>
            ) : (
              <ul className="pg__det-list">
                {selectedDetections.map((d) => (
                  <li key={d.detectionId}>
                    <SeverityDot severity={d.severity} /> confidence {d.confidence} · {d.signatureHits.length} signature(s)
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </aside>
    </div>
  );
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function buildLineagePath(nodes: HierarchyPointNode<StratRow>[], pid: number): string[] {
  const byPid = new Map(nodes.map((n) => [n.data.node!.pid, n]));
  const chain: string[] = [];
  let current = byPid.get(pid);
  const visited = new Set<number>();
  while (current && !visited.has(current.data.node!.pid)) {
    chain.unshift(current.data.node!.processName);
    visited.add(current.data.node!.pid);
    current = current.parent && current.parent.data.node ? byPid.get(current.parent.data.node.pid) : undefined;
  }
  return chain;
}
