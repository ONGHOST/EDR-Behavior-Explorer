// ============================================================================
// Core domain types — the contract every layer is built against.
// ============================================================================

export type EventType =
  | "process_create"
  | "process_terminate"
  | "network_connect"
  | "file_write"
  | "file_delete"
  | "registry_set"
  | "module_load"
  | "credential_access"
  | "resource_sample"; // periodic CPU/memory snapshot — see collectors/windows-collector.ps1

/**
 * Static metadata about a binary, captured at process_create (or the first
 * resource_sample if creation wasn't observed — e.g. the collector started
 * after the process did). All optional: not every sensor can read these
 * (protected processes, permissions, non-Windows hosts).
 */
export interface ProcessMetadata {
  companyName?: string;
  description?: string;
  executablePath?: string;
}

/** A point-in-time resource reading. Lives in RawEvent.details for a resource_sample event. */
export interface ResourceSample {
  cpuPercent: number;
  workingSetBytes: number;
  privateBytesBytes: number;
}

export interface RawEvent {
  id: string;
  hostId: string;
  pid: number;
  ppid: number;
  processName: string;
  commandLine?: string;
  userId?: string;
  eventType: EventType;
  timestamp: number; // epoch ms, sensor clock
  details: Record<string, unknown>; // event-type-specific payload — see ProcessMetadata/ResourceSample for the shapes resource_sample/process_create expect
}

/** A normalized event after the Collection Layer has validated + enriched it. */
export interface NormalizedEvent extends RawEvent {
  seq: number; // monotonic ingestion sequence number
  ingestTimestamp: number; // epoch ms, collector clock (for clock-skew checks)
  entityId: string; // `${hostId}:${pid}` — the unit chunks/graph key off of
}

/** A windowed slice of behavior for one entity, ready for rules or ML. */
export interface BehaviorChunk {
  chunkId: string;
  entityId: string;
  hostId: string;
  pid: number;
  windowStart: number;
  windowEnd: number;
  events: NormalizedEvent[];
  features: ChunkFeatures;
}

/** Flat numeric feature vector — this is what you'd hand to a model for training. */
export interface ChunkFeatures {
  eventCount: number;
  processCreateCount: number;
  networkConnectCount: number;
  fileWriteCount: number;
  fileDeleteCount: number;
  registrySetCount: number;
  moduleLoadCount: number;
  credentialAccessCount: number;
  uniqueNetworkDestinations: number;
  uniqueFilesTouched: number;
  childProcessCount: number;
  hasEncodedCommandLine: number; // 0/1
  avgInterEventGapMs: number;
  // Resource usage — populated from resource_sample events (e.g. the Windows collector).
  // 0 when no samples were observed in the window, which is indistinguishable from "truly
  // idle" without a sampleCount; resourceSampleCount disambiguates for the anomaly detector.
  resourceSampleCount: number;
  avgCpuPercent: number;
  maxCpuPercent: number;
  avgWorkingSetMb: number;
  maxWorkingSetMb: number;
  maxPrivateBytesMb: number;
}

export interface SignatureHit {
  signatureId: string;
  name: string;
  severity: "low" | "medium" | "high" | "critical";
  weight: number;
  description: string;
}

export interface TemporalFinding {
  kind: "sequence" | "beaconing";
  description: string;
  score: number; // 0-1 contribution
  evidence: string[];
}

export interface AnomalyFinding {
  feature: keyof ChunkFeatures;
  observed: number;
  baselineMean: number;
  baselineStd: number;
  zScore: number;
}

export interface Detection {
  detectionId: string;
  entityId: string;
  hostId: string;
  pid: number;
  chunkId: string;
  windowStart: number;
  windowEnd: number;
  confidence: number; // 0-100
  severity: "low" | "medium" | "high" | "critical";
  signatureHits: SignatureHit[];
  temporalFindings: TemporalFinding[];
  anomalyFindings: AnomalyFinding[];
  lineage: string[]; // process names from root ancestor to this entity
  createdAt: number;
}
