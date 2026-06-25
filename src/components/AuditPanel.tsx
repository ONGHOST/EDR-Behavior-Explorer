import type { AuditEntry, AuditEventKind, AuditVerifyResult } from "../api/types";
import { formatDateTime, formatRelative } from "../utils/format";
import "./AuditPanel.css";

const KIND_LABEL: Record<AuditEventKind, string> = {
  detection: "Detection",
  detection_suppressed_duplicate: "Suppressed (duplicate)",
  ingestion_rejected: "Ingestion rejected",
  pipeline_error: "Pipeline error",
  config_change: "Config change",
};

export function AuditStatusBanner({ result, onVerify }: { result: AuditVerifyResult | null; onVerify: () => void }) {
  if (!result) {
    return <div className="audit-status audit-status--pending">Checking chain integrity…</div>;
  }
  return (
    <div className={`audit-status ${result.valid ? "audit-status--ok" : "audit-status--broken"}`}>
      <div className="audit-status__icon">{result.valid ? "✓" : "✕"}</div>
      <div>
        <div className="audit-status__title">
          {result.valid ? "Hash chain intact" : `Tampering detected at entry #${result.brokenAtIndex}`}
        </div>
        <div className="audit-status__sub">
          {result.valid
            ? "Every entry's hash matches its recorded predecessor. No retroactive edits detected."
            : "A recorded entry no longer matches its hash — the ledger has been altered after the fact."}
        </div>
      </div>
      <button className="audit-status__btn" onClick={onVerify}>
        Re-verify
      </button>
    </div>
  );
}

export function AuditTable({ entries }: { entries: AuditEntry[] }) {
  if (entries.length === 0) {
    return <div className="empty-state">No audit entries yet.</div>;
  }
  return (
    <table className="audit-table">
      <thead>
        <tr>
          <th>#</th>
          <th>Kind</th>
          <th>Hash</th>
          <th>Time</th>
        </tr>
      </thead>
      <tbody>
        {[...entries].reverse().map((e) => (
          <tr key={e.index}>
            <td className="mono">{e.index}</td>
            <td>
              <span className={`audit-kind audit-kind--${e.kind}`}>{KIND_LABEL[e.kind]}</span>
            </td>
            <td className="mono audit-table__hash" title={e.hash}>
              {e.hash.slice(0, 12)}…
            </td>
            <td className="mono" title={formatDateTime(e.timestamp)}>
              {formatRelative(e.timestamp)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
