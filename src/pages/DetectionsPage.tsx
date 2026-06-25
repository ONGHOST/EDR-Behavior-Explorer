import { useState } from "react";
import { Panel } from "../components/Panel";
import { DetectionsTable } from "../components/DetectionsTable";
import { api } from "../api/client";
import { usePolling } from "../hooks/usePolling";
import { useAppState } from "../store";

export function DetectionsPage() {
  const { selectedHost, refreshMs } = useAppState();
  const [minConfidence, setMinConfidence] = useState(0);

  const poll = usePolling(
    () => api.getDetections({ hostId: selectedHost || undefined, minConfidence: minConfidence || undefined }),
    refreshMs,
    [selectedHost, minConfidence],
  );

  const detections = (poll.data ?? []).slice().sort((a, b) => b.createdAt - a.createdAt);

  return (
    <div className="panel-grid">
      <Panel
        title="All detections"
        eyebrow={selectedHost || "All hosts"}
        span={12}
        noPad
        action={
          <label className="field">
            <span className="eyebrow">Min confidence: {minConfidence}</span>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={minConfidence}
              onChange={(e) => setMinConfidence(Number(e.target.value))}
            />
          </label>
        }
      >
        <DetectionsTable detections={detections} />
      </Panel>
    </div>
  );
}
