import { useEffect } from "react";
import { Panel } from "../components/Panel";
import { ChunksTable } from "../components/ChunksTable";
import { api } from "../api/client";
import { usePolling } from "../hooks/usePolling";
import { useAppState } from "../store";

export function ChunksPage() {
  const { selectedHost, refreshMs, registerHosts } = useAppState();
  const poll = usePolling(() => api.getChunks(), refreshMs);
  const all = poll.data ?? [];

  useEffect(() => {
    const hosts = [...new Set(all.map((c) => c.hostId))];
    if (hosts.length > 0) registerHosts(hosts);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all.length]);

  const filtered = selectedHost ? all.filter((c) => c.hostId === selectedHost) : all;

  return (
    <div className="panel-grid">
      <Panel title="Training chunk export" eyebrow={selectedHost || "All hosts"} span={12}>
        <ChunksTable chunks={filtered} />
      </Panel>
    </div>
  );
}
