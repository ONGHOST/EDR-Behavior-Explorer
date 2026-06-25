import type { Severity } from "../../api/types";
import { SEVERITY_ORDER } from "../../utils/format";
import "./charts.css";

const COLOR_VAR: Record<Severity, string> = {
  critical: "var(--sev-critical)",
  high: "var(--sev-high)",
  medium: "var(--sev-medium)",
  low: "var(--sev-low)",
};

export function SeverityDonut({ counts }: { counts: Record<Severity, number> }) {
  const total = SEVERITY_ORDER.reduce((sum, s) => sum + counts[s], 0);
  const radius = 52;
  const circumference = 2 * Math.PI * radius;

  let offset = 0;
  const segments = SEVERITY_ORDER.filter((s) => counts[s] > 0).map((sev) => {
    const fraction = total > 0 ? counts[sev] / total : 0;
    const length = fraction * circumference;
    const seg = { sev, length, offset };
    offset += length;
    return seg;
  });

  return (
    <div className="donut">
      <svg viewBox="0 0 140 140" className="donut__svg">
        <circle cx="70" cy="70" r={radius} fill="none" stroke="var(--border)" strokeWidth="14" />
        {segments.map((seg) => (
          <circle
            key={seg.sev}
            cx="70"
            cy="70"
            r={radius}
            fill="none"
            stroke={COLOR_VAR[seg.sev]}
            strokeWidth="14"
            strokeDasharray={`${seg.length} ${circumference - seg.length}`}
            strokeDashoffset={-seg.offset}
            transform="rotate(-90 70 70)"
            strokeLinecap="butt"
          />
        ))}
        <text x="70" y="66" textAnchor="middle" className="donut__total">
          {total}
        </text>
        <text x="70" y="82" textAnchor="middle" className="donut__total-label">
          DETECTIONS
        </text>
      </svg>
      <ul className="donut__legend">
        {SEVERITY_ORDER.map((sev) => (
          <li key={sev}>
            <span className="donut__legend-dot" style={{ background: COLOR_VAR[sev] }} />
            <span className="donut__legend-label">{sev}</span>
            <span className="donut__legend-count mono">{counts[sev]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
