// ============================================================================
// Collection Layer
// In production this sits behind real sensors (Sysmon, ETW, eBPF, osquery)
// and a durable bus (Kafka/Kinesis). Here it's a validated ingestion funnel
// with an in-memory EventEmitter standing in for that bus, so the rest of
// the pipeline is written against the same contract you'd use in prod.
// ============================================================================

import { EventEmitter } from "node:events";
import { z } from "zod";
import type { NormalizedEvent, RawEvent } from "../types.js";

const RawEventSchema = z.object({
  id: z.string().min(1),
  hostId: z.string().min(1),
  pid: z.number().int().nonnegative(),
  ppid: z.number().int().nonnegative(),
  processName: z.string().min(1),
  // .nullable() matters here: a real-world sensor's JSON serializer (e.g.
  // PowerShell's ConvertTo-Json) emits explicit `null` for an absent
  // optional field rather than omitting the key — plain .optional() only
  // tolerates `undefined` and would reject every such event.
  commandLine: z.string().nullable().optional().transform((v) => v ?? undefined),
  userId: z.string().nullable().optional().transform((v) => v ?? undefined),
  eventType: z.enum([
    "process_create",
    "process_terminate",
    "network_connect",
    "file_write",
    "file_delete",
    "registry_set",
    "module_load",
    "credential_access",
    "resource_sample",
  ]),
  timestamp: z.number().int().positive(),
  details: z.record(z.string(), z.unknown()).nullable().optional().transform((v) => v ?? {}),
});

export class IngestionError extends Error {
  constructor(public readonly issues: z.ZodIssue[]) {
    super(`Event failed validation: ${issues.map((i) => i.message).join("; ")}`);
    this.name = "IngestionError";
  }
}

export interface CollectionEvents {
  event: (e: NormalizedEvent) => void;
  rejected: (raw: unknown, err: IngestionError) => void;
}

/**
 * CollectionLayer is the single entry point for telemetry. It is intentionally
 * strict: malformed events are rejected (not dropped silently) and emitted on
 * the `rejected` channel so an operator/audit trail can see sensor drift.
 */
export class CollectionLayer extends EventEmitter {
  private seqCounter = 0;
  private readonly maxClockSkewMs: number;

  constructor(opts: { maxClockSkewMs?: number } = {}) {
    super();
    this.maxClockSkewMs = opts.maxClockSkewMs ?? 5 * 60_000; // 5 min default
  }

  /** Validate, normalize, and forward a single raw event. Returns the normalized event or null if rejected. */
  ingest(raw: unknown): NormalizedEvent | null {
    const parsed = RawEventSchema.safeParse(raw);
    if (!parsed.success) {
      const err = new IngestionError(parsed.error.issues);
      this.emit("rejected", raw, err);
      return null;
    }

    const event = parsed.data as RawEvent;
    const ingestTimestamp = Date.now();
    const skew = Math.abs(ingestTimestamp - event.timestamp);
    if (skew > this.maxClockSkewMs) {
      // Don't drop — clock skew is itself a signal (tampering / sensor fault) —
      // but flag it loudly via details so downstream layers can weigh it.
      event.details = { ...event.details, _clockSkewMs: skew };
    }

    const normalized: NormalizedEvent = {
      ...event,
      seq: this.seqCounter++,
      ingestTimestamp,
      entityId: `${event.hostId}:${event.pid}`,
    };

    this.emit("event", normalized);
    return normalized;
  }

  /** Bulk ingest, e.g. for replaying a batch of sensor telemetry or a demo dataset. */
  ingestBatch(raws: unknown[]): NormalizedEvent[] {
    const out: NormalizedEvent[] = [];
    for (const r of raws) {
      const n = this.ingest(r);
      if (n) out.push(n);
    }
    return out;
  }
}
