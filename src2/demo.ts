// ============================================================================
// Demo: runs a simulated host's telemetry through the full engine and prints
// what comes out — detections, confidence scores, audit chain verification,
// and a sample of the training-data chunk export.
//
// Run with: npm run demo
// ============================================================================

import { BehaviorEngine } from "./pipeline.js";
import type { RawEvent } from "./types.js";

const HOST = "WIN-CORP-0731";
let idCounter = 0;
const nextId = () => `evt-${idCounter++}`;

function evt(partial: Omit<RawEvent, "id">): RawEvent {
  return { id: nextId(), ...partial };
}

const T0 = 1_750_000_000_000; // arbitrary fixed epoch so the demo is reproducible
const events: RawEvent[] = [];

// ---------------------------------------------------------------------------
// 1) Benign baseline traffic for svchost.exe across 10 separate process
//    instances, so the AnomalyDetector has a real baseline to compare against.
// ---------------------------------------------------------------------------
for (let i = 0; i < 10; i++) {
  const pid = 8000 + i;
  const base = T0 + i * 90_000;
  events.push(
    evt({ hostId: HOST, pid, ppid: 4, processName: "svchost.exe", eventType: "process_create", timestamp: base, details: {} }),
  );
  events.push(
    evt({
      hostId: HOST, pid, ppid: 4, processName: "svchost.exe", eventType: "network_connect",
      timestamp: base + 2_000 + (i % 3) * 400,
      details: { remoteAddr: "10.0.0.53:443" },
    }),
  );
  if (i % 2 === 0) {
    events.push(
      evt({
        hostId: HOST, pid, ppid: 4, processName: "svchost.exe", eventType: "registry_set",
        timestamp: base + 3_500, details: { key: "HKLM\\Software\\Policies" },
      }),
    );
  }
}

// ---------------------------------------------------------------------------
// 2) Anomalous svchost.exe instance: same process name, wildly different
//    behavior — should fire AnomalyDetector against the baseline above,
//    without tripping any signature (this isolates the anomaly layer).
// ---------------------------------------------------------------------------
{
  const pid = 8011;
  const base = T0 + 10 * 90_000;
  events.push(evt({ hostId: HOST, pid, ppid: 4, processName: "svchost.exe", eventType: "process_create", timestamp: base, details: {} }));
  for (let i = 0; i < 12; i++) {
    events.push(
      evt({
        hostId: HOST, pid, ppid: 4, processName: "svchost.exe", eventType: "network_connect",
        timestamp: base + 1_000 + i * 800, details: { remoteAddr: `198.51.100.${i}:8443` },
      }),
    );
  }
  for (let i = 0; i < 18; i++) {
    events.push(
      evt({
        hostId: HOST, pid, ppid: 4, processName: "svchost.exe", eventType: "file_write",
        timestamp: base + 12_000 + i * 300, details: { path: `C:\\Users\\Public\\tmp${i}.dat` },
      }),
    );
  }
}

// ---------------------------------------------------------------------------
// 3) Attack chain: explorer.exe -> winword.exe -> cmd.exe -> powershell.exe
//    (encoded command), powershell beacons out, drops a payload, touches
//    credentials, then stages mass file writes (ransomware pattern).
// ---------------------------------------------------------------------------
{
  const A0 = T0 + 2_000_000;
  events.push(evt({ hostId: HOST, pid: 50, ppid: 1, processName: "explorer.exe", eventType: "process_create", timestamp: A0 - 5_000, details: {} }));
  events.push(evt({ hostId: HOST, pid: 300, ppid: 50, processName: "winword.exe", commandLine: "winword.exe invoice_q3.docm", eventType: "process_create", timestamp: A0, details: {} }));
  events.push(evt({ hostId: HOST, pid: 301, ppid: 300, processName: "cmd.exe", commandLine: "cmd.exe /c powershell -nop -w hidden", eventType: "process_create", timestamp: A0 + 500, details: {} }));
  events.push(
    evt({
      hostId: HOST, pid: 302, ppid: 301, processName: "powershell.exe",
      commandLine: "powershell.exe -enc JABjAGwAaQBlAG4AdAAgAD0AIABOAGUAdwAtAE8AYgBqAGUAYwB0ACAATgBlAHQALgBXAGUAYgBDAGwAaQBlAG4AdAA=",
      eventType: "process_create", timestamp: A0 + 1_000, details: {},
    }),
  );

  // Beaconing: 5 connections to the same C2 host at a regular ~10s interval.
  for (let i = 0; i < 5; i++) {
    events.push(
      evt({
        hostId: HOST, pid: 302, ppid: 301, processName: "powershell.exe", eventType: "network_connect",
        timestamp: A0 + 1_500 + i * 10_000, details: { remoteAddr: "203.0.113.50:443" },
      }),
    );
  }

  // Dropper write, fast on the heels of the first connect (sequence rule).
  events.push(
    evt({
      hostId: HOST, pid: 302, ppid: 301, processName: "powershell.exe", eventType: "file_write",
      timestamp: A0 + 2_400, details: { path: "C:\\Users\\Public\\update.exe" },
    }),
  );

  // Credential access.
  events.push(
    evt({
      hostId: HOST, pid: 302, ppid: 301, processName: "powershell.exe", eventType: "credential_access",
      timestamp: A0 + 43_000, details: { target: "lsass.exe" },
    }),
  );

  // Mass file write — ransomware staging pattern, 30 distinct files.
  for (let i = 0; i < 30; i++) {
    events.push(
      evt({
        hostId: HOST, pid: 302, ppid: 301, processName: "powershell.exe", eventType: "file_write",
        timestamp: A0 + 45_000 + i * 150,
        details: { path: `C:\\Users\\corp_user\\Documents\\file_${i}.docx.locked` },
      }),
    );
  }
}

// ---------------------------------------------------------------------------
// 4) LOLBin chain, separate from the above, to exercise SIG-003 / SIG-006.
// ---------------------------------------------------------------------------
{
  const B0 = T0 + 4_000_000;
  events.push(evt({ hostId: HOST, pid: 400, ppid: 50, processName: "rundll32.exe", commandLine: "rundll32.exe payload.dll,EntryPoint", eventType: "process_create", timestamp: B0, details: {} }));
  events.push(evt({ hostId: HOST, pid: 400, ppid: 50, processName: "rundll32.exe", eventType: "network_connect", timestamp: B0 + 1_000, details: { remoteAddr: "198.51.100.77:80" } }));
  events.push(evt({ hostId: HOST, pid: 401, ppid: 400, processName: "cmd.exe", eventType: "process_create", timestamp: B0 + 2_000, details: {} }));
}

// ---------------------------------------------------------------------------
// Run it all through the engine.
// ---------------------------------------------------------------------------
const engine = new BehaviorEngine({ windowMs: 60_000, strideMs: 30_000 });

// Also feed one deliberately malformed event to prove the audit trail
// captures rejected telemetry, not just detections.
engine.ingest({ hostId: HOST, pid: -1, processName: "" }); // missing required fields

events.sort((a, b) => a.timestamp - b.timestamp);
engine.ingestBatch(events);
engine.flush(T0 + 10_000_000); // force-close every open window

// ---------------------------------------------------------------------------
// Report.
// ---------------------------------------------------------------------------
const detections = engine.getDetections().sort((a, b) => b.confidence - a.confidence);

console.log(`\n=== ${detections.length} detection(s) ===\n`);
for (const d of detections) {
  console.log(`[${d.severity.toUpperCase()}] confidence=${d.confidence} entity=${d.entityId} pid=${d.pid}`);
  console.log(`  lineage: ${d.lineage.join(" -> ")}`);
  if (d.signatureHits.length) {
    console.log(`  signatures: ${d.signatureHits.map((s) => `${s.name} (+${s.weight})`).join(" | ")}`);
  }
  if (d.temporalFindings.length) {
    console.log(`  temporal: ${d.temporalFindings.map((t) => `${t.description} (score ${t.score.toFixed(2)})`).join(" | ")}`);
  }
  if (d.anomalyFindings.length) {
    console.log(
      `  anomaly: ${d.anomalyFindings.map((a) => `${a.feature}=${a.observed} vs baseline ${a.baselineMean}±${a.baselineStd} (z=${a.zScore})`).join(" | ")}`,
    );
  }
  console.log("");
}

console.log(`=== Training chunk export (${engine.getChunks().length} chunks total) ===`);
console.log("Sample chunk feature vector (attack entity):");
const sample = engine.getChunks().find((c) => c.entityId === `${HOST}:302`);
if (sample) console.log(JSON.stringify(sample.features, null, 2));

console.log("\n=== Process graph snapshot (attack host) ===");
const snapshot = engine.graph.snapshot(HOST);
console.log(`nodes=${snapshot?.nodes.length} edges=${snapshot?.edges.length}`);

console.log("\n=== Audit layer ===");
console.log("Chain verification:", engine.audit.verifyChain());
console.log(`Total audit entries: ${engine.audit.all().length}`);
console.log(`  detections: ${engine.audit.byKind("detection").length}`);
console.log(`  rejected ingestions: ${engine.audit.byKind("ingestion_rejected").length}`);

// Tamper demo: mutate a recorded entry's payload directly and re-verify.
const tampered = engine.audit.all() as any[];
if (tampered.length > 0) {
  const original = tampered[0].payload;
  tampered[0].payload = { ...((typeof original === "object" && original) || {}), tampered: true };
  console.log("\nAfter tampering with entry #0 in place:", engine.audit.verifyChain());
}
