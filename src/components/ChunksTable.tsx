import type { BehaviorChunk } from "../api/types";
import { downloadCsv, formatDateTime } from "../utils/format";
import "./ChunksTable.css";

const FEATURE_COLS: Array<keyof BehaviorChunk["features"]> = [
  "eventCount",
  "processCreateCount",
  "networkConnectCount",
  "fileWriteCount",
  "fileDeleteCount",
  "registrySetCount",
  "credentialAccessCount",
  "uniqueNetworkDestinations",
  "uniqueFilesTouched",
  "hasEncodedCommandLine",
  "avgCpuPercent",
  "maxWorkingSetMb",
];

export function ChunksTable({ chunks }: { chunks: BehaviorChunk[] }) {
  if (chunks.length === 0) {
    return <div className="empty-state">No chunks closed yet — they appear once a sliding window completes.</div>;
  }

  const exportCsv = () => {
    downloadCsv(
      `behavior-chunks-${Date.now()}.csv`,
      chunks.map((c) => ({ chunkId: c.chunkId, entityId: c.entityId, windowStart: c.windowStart, windowEnd: c.windowEnd, ...c.features })),
    );
  };

  return (
    <div className="chunks">
      <div className="chunks__toolbar">
        <span className="eyebrow">{chunks.length} chunk(s) — every closed window, training-ready</span>
        <button className="chunks__export" onClick={exportCsv}>
          Export CSV
        </button>
      </div>
      <div className="chunks__scroll">
        <table className="chunks-table">
          <thead>
            <tr>
              <th>Entity</th>
              <th>Window</th>
              {FEATURE_COLS.map((f) => (
                <th key={f}>{f}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {chunks.map((c) => (
              <tr key={c.chunkId}>
                <td className="mono">{c.entityId}</td>
                <td className="mono chunks-table__window">{formatDateTime(c.windowStart)}</td>
                {FEATURE_COLS.map((f) => (
                  <td key={f} className="mono">
                    {c.features[f]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
