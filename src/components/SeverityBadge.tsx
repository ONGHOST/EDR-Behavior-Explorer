import type { Severity } from "../api/types";
import "./SeverityBadge.css";

const LABEL: Record<Severity, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span className={`sev-badge sev-badge--${severity}`}>
      <span className="sev-badge__dot" />
      {LABEL[severity]}
    </span>
  );
}

export function SeverityDot({ severity }: { severity: Severity }) {
  return <span className={`sev-dot sev-dot--${severity}`} />;
}
