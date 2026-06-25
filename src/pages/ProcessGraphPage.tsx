import { Panel } from "../components/Panel";
import { ProcessGraph } from "../components/ProcessGraph";
import { api } from "../api/client";
import { usePolling } from "../hooks/usePolling";
import { useAppState } from "../store";

export function ProcessGraphPage() {
  const { selectedHost, setSelectedHost, knownHosts, refreshMs } = useAppState();

  if (!selectedHost) {
    return (
      <div className="panel-grid">
        <Panel title="Select a host" eyebrow="Process graph" span={12}>
          {knownHosts.length === 0 ? (
            <p style={{ color: "var(--text-tertiary)", fontSize: 12 }}>
              No hosts seen yet. Once telemetry is ingested, hosts will appear here.
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

  return <HostGraph hostId={selectedHost} refreshMs={refreshMs} />;
}

function HostGraph({ hostId, refreshMs }: { hostId: string; refreshMs: number }) {
  const graphPoll = usePolling(() => api.getGraph(hostId), refreshMs, [hostId]);
  const detectionsPoll = usePolling(() => api.getDetections({ hostId }), refreshMs, [hostId]);

  return (
    <div className="panel-grid">
      <Panel
        title="Process lineage"
        eyebrow={hostId}
        span={12}
        action={
          graphPoll.data && (
            <span className="eyebrow">
              {graphPoll.data.nodes.length} nodes · {graphPoll.data.edges.length} edges
            </span>
          )
        }
      >
        {!graphPoll.data ? (
          <div className="empty-state">{graphPoll.error ? "Could not load graph for this host." : "Loading…"}</div>
        ) : (
          <ProcessGraph snapshot={graphPoll.data} detections={detectionsPoll.data ?? []} />
        )}
      </Panel>
    </div>
  );
}
