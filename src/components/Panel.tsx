import type { ReactNode } from "react";
import "./Panel.css";

interface PanelProps {
  title: string;
  eyebrow?: string;
  span?: number; // out of 12 columns
  action?: ReactNode;
  children: ReactNode;
  noPad?: boolean;
}

export function Panel({ title, eyebrow, span = 12, action, children, noPad }: PanelProps) {
  return (
    <section className="panel" style={{ gridColumn: `span ${span}` }}>
      <header className="panel__head">
        <div>
          {eyebrow && <div className="eyebrow">{eyebrow}</div>}
          <h2 className="panel__title">{title}</h2>
        </div>
        {action && <div className="panel__action">{action}</div>}
      </header>
      <div className={noPad ? "panel__body panel__body--flush" : "panel__body"}>{children}</div>
    </section>
  );
}
