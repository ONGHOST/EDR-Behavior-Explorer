import type { Severity } from "../../api/types";
import "./charts.css";

const COLOR_VAR: Record<Severity, string> = {
  critical: "var(--sev-critical)",
  high: "var(--sev-high)",
  medium: "var(--sev-medium)",
  low: "var(--sev-low)",
};

export function ConfidenceGauge({ value, severity, size = 36 }: { value: number; severity: Severity; size?: number }) {
  const radius = (size - 6) / 2;
  const circumference = 2 * Math.PI * radius;
  const filled = (value / 100) * circumference;
  const c = size / 2;

  return (
    <div className="gauge" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`}>
        <circle cx={c} cy={c} r={radius} fill="none" stroke="var(--border)" strokeWidth="3.5" />
        <circle
          cx={c}
          cy={c}
          r={radius}
          fill="none"
          stroke={COLOR_VAR[severity]}
          strokeWidth="3.5"
          strokeDasharray={`${filled} ${circumference - filled}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${c} ${c})`}
        />
      </svg>
      <span className="gauge__value mono">{value}</span>
    </div>
  );
}
