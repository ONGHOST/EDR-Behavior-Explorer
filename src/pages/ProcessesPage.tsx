import { Panel } from "../components/Panel";
import { ProcessesTable } from "../components/ProcessesTable";
import { api } from "../api/client";
import { usePolling } from "../hooks/usePolling";
import { useAppState } from "../store";

export function ProcessesPage() {
  const { selectedHost, setSelectedHost, knownHosts, refreshMs } = useAppState();

  if (!selectedHost) {
    return (
      <div className="panel-grid">
        <Panel title="Select a host" eyebrow="Live processes" span={12}>
          {knownHosts.length === 0 ? (
            <p style={{ color: "var(--text-tertiary)", fontSize: 12 }}>
              No hosts seen yet. Point a collector at this engine's <code className="mono">/events</code> endpoint —
              see the backend README's "Connecting your own machine" section.
            </p>
          ) : (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {knownHosts.map((h) => (
                <button key={h} className="host-pick-btn" onClick={() => setSelectedHost(h)}>
                  {h}
                </button>
              ))}
            </div>
          )}
        </Panel>
      </div>
    );
  }

  return <HostProcesses hostId={selectedHost} refreshMs={refreshMs} />;
}

function HostProcesses({ hostId, refreshMs }: { hostId: string; refreshMs: number }) {
  const graphPoll = usePolling(() => api.getGraph(hostId), refreshMs, [hostId]);
  const detectionsPoll = usePolling(() => api.getDetections({ hostId }), refreshMs, [hostId]);

  return (
    <div className="panel-grid">
      <Panel title="Live processes" eyebrow={hostId} span={12}>
        {!graphPoll.data ? (
          <div className="empty-state">{graphPoll.error ? "Could not load processes for this host." : "Loading…"}</div>
        ) : (
          <ProcessesTable nodes={graphPoll.data.nodes} detections={detectionsPoll.data ?? []} />
        )}
      </Panel>
    </div>
  );
}
