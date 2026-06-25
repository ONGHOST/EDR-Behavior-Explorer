import { Fragment, useState } from "react";
import type { Detection } from "../api/types";
import { SeverityBadge } from "./SeverityBadge";
import { ConfidenceGauge } from "./charts/ConfidenceGauge";
import { formatDateTime, formatRelative } from "../utils/format";
import "./DetectionsTable.css";

export function DetectionsTable({ detections, limit }: { detections: Detection[]; limit?: number }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const rows = limit ? detections.slice(0, limit) : detections;

  if (rows.length === 0) {
    return <div className="empty-state">No detections to show. The pipeline is quiet — or not yet wired up.</div>;
  }

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <table className="det-table">
      <thead>
        <tr>
          <th></th>
          <th>Severity</th>
          <th>Confidence</th>
          <th>Entity</th>
          <th>Lineage</th>
          <th>Window</th>
          <th>Detected</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((d) => {
          const isOpen = expanded.has(d.detectionId);
          return (
            <Fragment key={d.detectionId}>
              <tr
                className={`det-table__row ${isOpen ? "det-table__row--open" : ""}`}
                onClick={() => toggle(d.detectionId)}
              >
                <td className="det-table__chevron">{isOpen ? "▾" : "▸"}</td>
                <td>
                  <SeverityBadge severity={d.severity} />
                </td>
                <td>
                  <div className="det-table__conf">
                    <ConfidenceGauge value={d.confidence} severity={d.severity} size={28} />
                  </div>
                </td>
                <td className="mono">
                  {d.entityId}
                  <div className="det-table__pid">pid {d.pid} · {d.hostId}</div>
                </td>
                <td className="mono det-table__lineage">{d.lineage.join(" → ")}</td>
                <td className="mono det-table__window">
                  {formatDateTime(d.windowStart)} – {formatDateTime(d.windowEnd)}
                </td>
                <td className="det-table__relative" title={formatDateTime(d.createdAt)}>
                  {formatRelative(d.createdAt)}
                </td>
              </tr>
              {isOpen && (
                <tr className="det-table__detail-row">
                  <td colSpan={7}>
                    <DetectionDetail detection={d} />
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

function DetectionDetail({ detection }: { detection: Detection }) {
  return (
    <div className="det-detail">
      {detection.signatureHits.length > 0 && (
        <div className="det-detail__group">
          <div className="eyebrow">Signature hits</div>
          <ul>
            {detection.signatureHits.map((s) => (
              <li key={s.signatureId}>
                <span className="mono det-detail__id">{s.signatureId}</span>
                <strong>{s.name}</strong>
                <span className="det-detail__weight mono">+{s.weight}</span>
                <p>{s.description}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {detection.temporalFindings.length > 0 && (
        <div className="det-detail__group">
          <div className="eyebrow">Temporal findings</div>
          <ul>
            {detection.temporalFindings.map((t, i) => (
              <li key={i}>
                <span className="det-detail__kind mono">{t.kind}</span>
                <strong>{t.description}</strong>
                <span className="det-detail__weight mono">score {t.score.toFixed(2)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {detection.anomalyFindings.length > 0 && (
        <div className="det-detail__group">
          <div className="eyebrow">Anomaly findings (vs. process baseline)</div>
          <ul>
            {detection.anomalyFindings.map((a, i) => (
              <li key={i}>
                <span className="mono">{a.feature}</span>
                <span className="mono">
                  observed <strong>{a.observed}</strong> vs baseline {a.baselineMean}±{a.baselineStd}
                </span>
                <span className="det-detail__weight mono">z={a.zScore}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="det-detail__group">
        <div className="eyebrow">Process lineage</div>
        <div className="det-detail__lineage mono">
          {detection.lineage.map((p, i) => (
            <span key={i}>
              {i > 0 && <span className="det-detail__arrow">→</span>}
              <span className={i === detection.lineage.length - 1 ? "det-detail__leaf" : ""}>{p}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
