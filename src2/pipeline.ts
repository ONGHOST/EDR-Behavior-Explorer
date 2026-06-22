// ============================================================================
// Pipeline — wires every layer together in the order data actually flows:
//
//   Sensors → CollectionLayer → [ ChunkingLayer, ProcessGraph ]
//                                        |
//                  SignatureEngine + TemporalAnalysis + AnomalyDetector
//                                        |
//                              ConfidenceScoring
//                                        |
//                         Detection  →  AuditLayer (hash-chained)
//
// This file is the only place that knows about every layer — each layer
// module above has zero knowledge of the others, so any one of them
// (e.g. swap AnomalyDetector for a real ML model) can be replaced without
// touching the rest.
// ============================================================================

import { randomUUID } from "node:crypto";
import { AnomalyDetector } from "./anomaly/AnomalyDetector.js";
import { AuditLayer } from "./audit/AuditLayer.js";
import { ChunkingLayer, type ChunkerConfig } from "./chunking/ChunkingLayer.js";
import { CollectionLayer } from "./collection/CollectionLayer.js";
import { ProcessGraph } from "./graph/ProcessGraph.js";
import { runSignatures } from "./signatures/SignatureEngine.js";
import { analyzeTemporal } from "./temporal/TemporalAnalysis.js";
import { computeConfidence } from "./scoring/ConfidenceScoring.js";
import type { BehaviorChunk, Detection, NormalizedEvent } from "./types.js";

const DETECTION_CONFIDENCE_FLOOR = 20; // below this, we don't even create a Detection record

export class BehaviorEngine {
  readonly collection: CollectionLayer;
  readonly chunker: ChunkingLayer;
  readonly graph: ProcessGraph;
  readonly anomaly: AnomalyDetector;
  readonly audit: AuditLayer;

  private readonly detections: Detection[] = [];
  /** Every chunk that closes is retained here — this is the training-data
   *  export surface. Most chunks never cross the detection threshold; those
   *  benign chunks are exactly what a model needs to learn "normal" from. */
  private readonly chunks: BehaviorChunk[] = [];
  /** entityId -> fingerprint of the most recent detection, for de-duplicating
   *  alerts caused by overlapping sliding windows seeing the same underlying
   *  activity twice. We deliberately only compare against the *immediately
   *  prior* detection for that entity — a genuinely new finding later still
   *  fires, this only collapses back-to-back repeats of the same signal. */
  private readonly lastDetectionFingerprint = new Map<string, string>();

  constructor(chunkerConfig: Partial<ChunkerConfig> = {}) {
    this.collection = new CollectionLayer();
    this.chunker = new ChunkingLayer(chunkerConfig);
    this.graph = new ProcessGraph();
    this.anomaly = new AnomalyDetector();
    this.audit = new AuditLayer();

    this.collection.on("event", (e: NormalizedEvent) => this.handleEvent(e));
    this.collection.on("rejected", (raw, err) => {
      this.audit.record("ingestion_rejected", { raw, error: err.message });
    });
  }

  /** Entry point: feed a raw sensor event in. */
  ingest(raw: unknown): void {
    this.collection.ingest(raw);
  }

  ingestBatch(raws: unknown[]): void {
    for (const r of raws) this.ingest(r);
  }

  /** Force-close any open windows — call at shutdown or end of a batch replay. */
  flush(now: number): void {
    for (const chunk of this.chunker.flushAll(now)) {
      this.processChunk(chunk);
    }
  }

  getDetections(): Detection[] {
    return this.detections;
  }

  /** Training-data export: every closed BehaviorChunk with its feature vector. */
  getChunks(): BehaviorChunk[] {
    return this.chunks;
  }

  private handleEvent(event: NormalizedEvent): void {
    try {
      this.graph.ingest(event);
      const readyChunks = this.chunker.push(event);
      for (const chunk of readyChunks) this.processChunk(chunk);
    } catch (err) {
      this.audit.record("pipeline_error", {
        stage: "handleEvent",
        entityId: event.entityId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private processChunk(chunk: BehaviorChunk): void {
    this.chunks.push(chunk);
    try {
      const lineage = this.graph.lineageOf(chunk.hostId, chunk.pid);

      const signatureHits = runSignatures({ chunk, lineage });
      const temporalFindings = analyzeTemporal(chunk);
      const anomalyFindings = this.anomaly.score(chunk);

      const { confidence, severity } = computeConfidence({
        chunk,
        lineage,
        signatureHits,
        temporalFindings,
        anomalyFindings,
      });

      if (confidence < DETECTION_CONFIDENCE_FLOOR) return;

      const fingerprint = [
        ...signatureHits.map((h) => h.signatureId).sort(),
        ...temporalFindings.map((t) => `${t.kind}:${t.description}`).sort(),
      ].join("|");

      if (this.lastDetectionFingerprint.get(chunk.entityId) === fingerprint) {
        this.audit.record("detection_suppressed_duplicate", {
          entityId: chunk.entityId,
          chunkId: chunk.chunkId,
          fingerprint,
        });
        return;
      }
      this.lastDetectionFingerprint.set(chunk.entityId, fingerprint);

      const detection: Detection = {
        detectionId: randomUUID(),
        entityId: chunk.entityId,
        hostId: chunk.hostId,
        pid: chunk.pid,
        chunkId: chunk.chunkId,
        windowStart: chunk.windowStart,
        windowEnd: chunk.windowEnd,
        confidence,
        severity,
        signatureHits,
        temporalFindings,
        anomalyFindings,
        lineage,
        createdAt: Date.now(),
      };

      this.detections.push(detection);
      this.audit.record("detection", detection);
    } catch (err) {
      this.audit.record("pipeline_error", {
        stage: "processChunk",
        chunkId: chunk.chunkId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
