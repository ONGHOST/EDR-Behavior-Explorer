import type { ReactNode } from "react";
import "./StatCard.css";

export function StatCard({
  label,
  value,
  tone = "neutral",
  hint,
}: {
  label: string;
  value: ReactNode;
  tone?: "neutral" | "critical" | "ok" | "warn";
  hint?: string;
}) {
  return (
    <div className={`stat-card stat-card--${tone}`}>
      <div className="eyebrow">{label}</div>
      <div className="stat-card__value">{value}</div>
      {hint && <div className="stat-card__hint">{hint}</div>}
    </div>
  );
}
