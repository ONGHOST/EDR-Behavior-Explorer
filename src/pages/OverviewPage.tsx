import { useEffect, useMemo } from "react";
import { Panel } from "../components/Panel";
import { StatCard } from "../components/StatCard";
import { SeverityDonut } from "../components/charts/SeverityDonut";
import { TimelineBars } from "../components/charts/TimelineBars";
import { DetectionsTable } from "../components/DetectionsTable";
import { api } from "../api/client";
import { usePolling } from "../hooks/usePolling";
import { useAppState } from "../store";
import type { Severity } from "../api/types";

export function OverviewPage() {
  const { refreshMs, registerHosts } = useAppState();
  const detectionsPoll = usePolling(() => api.getDetections(), refreshMs);
  const chunksPoll = usePolling(() => api.getChunks(), refreshMs);
  const auditPoll = usePolling(() => api.verifyAudit(), refreshMs);

  const detections = detectionsPoll.data ?? [];
  const chunks = chunksPoll.data ?? [];

  useEffect(() => {
    const hosts = new Set<string>();
    detections.forEach((d) => hosts.add(d.hostId));
    chunks.forEach((c) => hosts.add(c.hostId));
    if (hosts.size > 0) registerHosts([...hosts]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detections.length, chunks.length]);

  const counts = useMemo(() => {
    const c: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0 };
    detections.forEach((d) => c[d.severity]++);
    return c;
  }, [detections]);

  const recent = useMemo(
    () => [...detections].sort((a, b) => b.createdAt - a.createdAt),
    [detections],
  );

  return (
    <div className="panel-grid">
      <div className="panel-grid" style={{ gridColumn: "span 12", gridTemplateColumns: "repeat(4, 1fr)" }}>
        <StatCard label="Total detections" value={detections.length} />
        <StatCard
          label="Critical + high"
          value={counts.critical + counts.high}
          tone={counts.critical > 0 ? "critical" : counts.high > 0 ? "warn" : "neutral"}
        />
        <StatCard label="Training chunks" value={chunks.length} hint="closed windows, feature-vector ready" />
        <StatCard
          label="Audit chain"
          value={auditPoll.data ? (auditPoll.data.valid ? "Intact" : "Tampered") : "—"}
          tone={auditPoll.data ? (auditPoll.data.valid ? "ok" : "critical") : "neutral"}
        />
      </div>

      <Panel title="Severity breakdown" eyebrow="All hosts" span={5}>
        <SeverityDonut counts={counts} />
      </Panel>

      <Panel title="Detections over time" eyebrow={`${detections.length} total`} span={7}>
        <TimelineBars detections={detections} />
      </Panel>

      <Panel title="Recent detections" eyebrow="Latest 8, across all hosts" span={12} noPad>
        <DetectionsTable detections={recent} limit={8} />
      </Panel>
    </div>
  );
}
