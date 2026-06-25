import { Panel } from "../components/Panel";
import { AuditStatusBanner, AuditTable } from "../components/AuditPanel";
import { api } from "../api/client";
import { usePolling } from "../hooks/usePolling";
import { useAppState } from "../store";

export function AuditPage() {
  const { refreshMs } = useAppState();
  const verifyPoll = usePolling(() => api.verifyAudit(), refreshMs);
  const tailPoll = usePolling(() => api.getAuditTail(100), refreshMs);

  return (
    <div className="panel-grid">
      <Panel title="Chain integrity" eyebrow="Hash-chained, tamper-evident ledger" span={12}>
        <AuditStatusBanner result={verifyPoll.data} onVerify={verifyPoll.refresh} />
      </Panel>

      <Panel title="Ledger" eyebrow={`Last ${tailPoll.data?.length ?? 0} entries`} span={12} noPad>
        <AuditTable entries={tailPoll.data ?? []} />
      </Panel>
    </div>
  );
}
