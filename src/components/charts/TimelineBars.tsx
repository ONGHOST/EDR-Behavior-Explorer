import type { Detection, Severity } from "../../api/types";
import { SEVERITY_ORDER, formatTime } from "../../utils/format";
import "./charts.css";

const COLOR_VAR: Record<Severity, string> = {
  critical: "var(--sev-critical)",
  high: "var(--sev-high)",
  medium: "var(--sev-medium)",
  low: "var(--sev-low)",
};

const BUCKET_COUNT = 24;

export function TimelineBars({ detections }: { detections: Detection[] }) {
  if (detections.length === 0) {
    return <div className="empty-state">No detections in range yet.</div>;
  }

  const times = detections.map((d) => d.createdAt);
  const min = Math.min(...times);
  const max = Math.max(...times);
  const span = Math.max(1, max - min);
  const bucketMs = span / BUCKET_COUNT;

  const buckets: Record<Severity, number>[] = Array.from({ length: BUCKET_COUNT }, () => ({
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
  }));
  const bucketStart: number[] = Array.from({ length: BUCKET_COUNT }, (_, i) => min + i * bucketMs);

  for (const d of detections) {
    const idx = Math.min(BUCKET_COUNT - 1, Math.floor((d.createdAt - min) / bucketMs));
    buckets[idx][d.severity]++;
  }

  const maxStack = Math.max(...buckets.map((b) => SEVERITY_ORDER.reduce((s, sev) => s + b[sev], 0)), 1);

  return (
    <div className="timeline">
      <div className="timeline__bars">
        {buckets.map((b, i) => {
          const stackTotal = SEVERITY_ORDER.reduce((s, sev) => s + b[sev], 0);
          return (
            <div className="timeline__col" key={i} title={`${formatTime(bucketStart[i])} — ${stackTotal} detection(s)`}>
              <div className="timeline__stack" style={{ height: `${(stackTotal / maxStack) * 100}%` }}>
                {SEVERITY_ORDER.filter((sev) => b[sev] > 0).map((sev) => (
                  <div
                    key={sev}
                    className="timeline__seg"
                    style={{
                      flex: b[sev],
                      background: COLOR_VAR[sev],
                    }}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <div className="timeline__axis">
        <span>{formatTime(min)}</span>
        <span>{formatTime(max)}</span>
      </div>
    </div>
  );
}
