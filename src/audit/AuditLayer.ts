// ============================================================================
// Audit Layer
// Every detection (and rejected/malformed event) is written to an append-only,
// hash-chained ledger: each entry embeds the hash of the previous entry, so
// any retroactive edit or deletion breaks the chain and is detectable via
// verifyChain(). This is the forensic backbone — what a compliance review or
// incident responder trusts when everything else is in question.
// In production this would be backed by a write-once store (S3 Object Lock,
// or a dedicated append-only log service) rather than an in-memory array.
// ============================================================================

import { createHash } from "node:crypto";

export type AuditEventKind = "detection" | "detection_suppressed_duplicate" | "ingestion_rejected" | "pipeline_error" | "config_change";

export interface AuditEntry {
  index: number;
  kind: AuditEventKind;
  payload: unknown;
  timestamp: number;
  prevHash: string;
  hash: string;
}

const GENESIS_HASH = "0".repeat(64);

function hashEntry(index: number, kind: string, payload: unknown, timestamp: number, prevHash: string): string {
  const h = createHash("sha256");
  h.update(`${index}|${kind}|${JSON.stringify(payload)}|${timestamp}|${prevHash}`);
  return h.digest("hex");
}

export class AuditLayer {
  private readonly chain: AuditEntry[] = [];

  record(kind: AuditEventKind, payload: unknown): AuditEntry {
    const index = this.chain.length;
    const prevHash = index === 0 ? GENESIS_HASH : this.chain[index - 1].hash;
    const timestamp = Date.now();
    const hash = hashEntry(index, kind, payload, timestamp, prevHash);

    const entry: AuditEntry = { index, kind, payload, timestamp, prevHash, hash };
    this.chain.push(entry);
    return entry;
  }

  /** Walks the full chain recomputing hashes — detects any tampering or out-of-order edits. */
  verifyChain(): { valid: boolean; brokenAtIndex: number | null } {
    let prevHash = GENESIS_HASH;
    for (const entry of this.chain) {
      const recomputed = hashEntry(entry.index, entry.kind, entry.payload, entry.timestamp, prevHash);
      if (recomputed !== entry.hash || entry.prevHash !== prevHash) {
        return { valid: false, brokenAtIndex: entry.index };
      }
      prevHash = entry.hash;
    }
    return { valid: true, brokenAtIndex: null };
  }

  all(): readonly AuditEntry[] {
    return this.chain;
  }

  byKind(kind: AuditEventKind): AuditEntry[] {
    return this.chain.filter((e) => e.kind === kind);
  }

  tail(n: number): AuditEntry[] {
    return this.chain.slice(-n);
  }
}
