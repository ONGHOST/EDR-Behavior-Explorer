// ============================================================================
// Chunking Layer
// Groups a per-entity (host+pid) event stream into fixed-size, overlapping
// time windows ("behavioral chunks"). Each chunk gets a flat feature vector —
// this is the artifact you'd persist to a feature store and use for both
// rule-based scoring (below) AND training an ML model later, unmodified.
// ============================================================================

import type { BehaviorChunk, ChunkFeatures, NormalizedEvent } from "../types.js";

export interface ChunkerConfig {
  windowMs: number; // size of each window
  strideMs: number; // how far the window slides forward; strideMs < windowMs => overlap
}

const DEFAULT_CONFIG: ChunkerConfig = {
  windowMs: 60_000, // 60s windows
  strideMs: 30_000, // 50% overlap, standard for catching events that straddle a boundary
};

const ENCODED_CMD_PATTERN = /-enc(odedcommand)?\b|-e\s+[A-Za-z0-9+/=]{40,}|FromBase64String/i;

export class ChunkingLayer {
  private readonly config: ChunkerConfig;
  /** Per-entity rolling event buffer, trimmed as windows close. */
  private readonly buffers = new Map<string, NormalizedEvent[]>();
  /** Per-entity timestamp of the next window's start. */
  private readonly nextWindowStart = new Map<string, number>();

  constructor(config: Partial<ChunkerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Feed one event in. Returns any chunks that became ready to close as a
   * result (usually 0, occasionally 1+ if events arrived in a burst after a gap).
   */
  push(event: NormalizedEvent): BehaviorChunk[] {
    const buf = this.buffers.get(event.entityId) ?? [];
    buf.push(event);
    this.buffers.set(event.entityId, buf);

    if (!this.nextWindowStart.has(event.entityId)) {
      this.nextWindowStart.set(event.entityId, event.timestamp);
    }

    return this.flushReadyWindows(event.entityId, event.timestamp);
  }

  /** Force-close any windows that are ready given the current "now" (use at shutdown or for batch replay). */
  flushAll(now: number): BehaviorChunk[] {
    const out: BehaviorChunk[] = [];
    for (const entityId of this.buffers.keys()) {
      out.push(...this.flushReadyWindows(entityId, now, true));
    }
    return out;
  }

  private flushReadyWindows(entityId: string, now: number, force = false): BehaviorChunk[] {
    const chunks: BehaviorChunk[] = [];
    let windowStart = this.nextWindowStart.get(entityId)!;

    if (force) {
      // Forced flushes (periodic wall-clock sweep, or shutdown) can be called
      // with a 'now' far past this entity's last activity. Stepping one
      // stride at a time from an old anchor up to 'now' would be O(gap/stride)
      // per entity — fine for a handful of entities, not for a real fleet.
      // Fast-forward to just before the earliest still-buffered event,
      // preserving the existing stride-grid phase so window boundaries stay
      // consistent with what would have been produced incrementally.
      const buffer = this.buffers.get(entityId) ?? [];
      if (buffer.length > 0) {
        const earliest = Math.min(...buffer.map((e) => e.timestamp));
        const stridesToSkip = Math.max(
          0,
          Math.floor((earliest - this.config.windowMs - windowStart) / this.config.strideMs),
        );
        windowStart += stridesToSkip * this.config.strideMs;
      } else if (now - windowStart > this.config.windowMs) {
        // Nothing buffered and we're way past the window — nothing to find, skip straight to now.
        windowStart = now;
      }
    }

    while (now - windowStart >= this.config.windowMs || (force && now > windowStart)) {
      const windowEnd = windowStart + this.config.windowMs;
      const events = (this.buffers.get(entityId) ?? []).filter(
        (e) => e.timestamp >= windowStart && e.timestamp < windowEnd,
      );

      if (events.length > 0) {
        chunks.push(this.buildChunk(entityId, windowStart, windowEnd, events));
      }

      windowStart += this.config.strideMs;
      if (force && now <= windowStart) break;
    }

    this.nextWindowStart.set(entityId, windowStart);
    // Trim buffer: drop events older than the new window start minus one full window
    // (keeps memory bounded; overlap window still needs the trailing window's worth of history).
    const cutoff = windowStart - this.config.windowMs;
    this.buffers.set(
      entityId,
      (this.buffers.get(entityId) ?? []).filter((e) => e.timestamp >= cutoff),
    );

    return chunks;
  }

  private buildChunk(
    entityId: string,
    windowStart: number,
    windowEnd: number,
    events: NormalizedEvent[],
  ): BehaviorChunk {
    const [hostId, pidStr] = entityId.split(":");
    const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);

    return {
      chunkId: `${entityId}:${windowStart}`,
      entityId,
      hostId,
      pid: Number(pidStr),
      windowStart,
      windowEnd,
      events: sorted,
      features: extractFeatures(sorted),
    };
  }
}

export function extractFeatures(events: NormalizedEvent[]): ChunkFeatures {
  const count = (t: NormalizedEvent["eventType"]) => events.filter((e) => e.eventType === t).length;

  const networkDestinations = new Set(
    events
      .filter((e) => e.eventType === "network_connect")
      .map((e) => String(e.details["remoteAddr"] ?? e.details["destination"] ?? "unknown")),
  );
  const filesTouched = new Set(
    events
      .filter((e) => e.eventType === "file_write" || e.eventType === "file_delete")
      .map((e) => String(e.details["path"] ?? "unknown")),
  );
  const hasEncoded = events.some(
    (e) => e.eventType === "process_create" && ENCODED_CMD_PATTERN.test(e.commandLine ?? ""),
  );

  let gapSum = 0;
  for (let i = 1; i < events.length; i++) gapSum += events[i].timestamp - events[i - 1].timestamp;
  const avgInterEventGapMs = events.length > 1 ? gapSum / (events.length - 1) : 0;

  return {
    eventCount: events.length,
    processCreateCount: count("process_create"),
    networkConnectCount: count("network_connect"),
    fileWriteCount: count("file_write"),
    fileDeleteCount: count("file_delete"),
    registrySetCount: count("registry_set"),
    moduleLoadCount: count("module_load"),
    credentialAccessCount: count("credential_access"),
    uniqueNetworkDestinations: networkDestinations.size,
    uniqueFilesTouched: filesTouched.size,
    childProcessCount: count("process_create"),
    hasEncodedCommandLine: hasEncoded ? 1 : 0,
    avgInterEventGapMs,
  };
}
