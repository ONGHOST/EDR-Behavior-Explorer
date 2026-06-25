// Mirrors src/types.ts in the edr-behavior-engine backend. Kept as a plain
// duplicate rather than a shared package since the two projects ship and
// version independently — see README for the tradeoff.

export type Severity = "low" | "medium" | "high" | "critical";

export interface SignatureHit {
  signatureId: string;
  name: string;
  severity: Severity;
  weight: number;
  description: string;
}

export interface TemporalFinding {
  kind: "sequence" | "beaconing";
  description: string;
  score: number;
  evidence: string[];
}

export interface AnomalyFinding {
  feature: string;
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
  confidence: number;
  severity: Severity;
  signatureHits: SignatureHit[];
  temporalFindings: TemporalFinding[];
  anomalyFindings: AnomalyFinding[];
  lineage: string[];
  createdAt: number;
}

export interface GraphNode {
  hostId: string;
  pid: number;
  ppid: number;
  processName: string;
  commandLine?: string;
  companyName?: string;
  description?: string;
  executablePath?: string;
  lastCpuPercent?: number;
  lastWorkingSetBytes?: number;
  lastPrivateBytesBytes?: number;
  lastSampleAt?: number;
  firstSeen: number;
  lastSeen: number;
  terminatedAt?: number;
  children: number[];
}

export interface GraphSnapshot {
  hostId: string;
  nodes: GraphNode[];
  edges: Array<{ from: number; to: number }>;
}

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
  hasEncodedCommandLine: number;
  avgInterEventGapMs: number;
  resourceSampleCount: number;
  avgCpuPercent: number;
  maxCpuPercent: number;
  avgWorkingSetMb: number;
  maxWorkingSetMb: number;
  maxPrivateBytesMb: number;
}

export interface BehaviorChunk {
  chunkId: string;
  entityId: string;
  hostId: string;
  pid: number;
  windowStart: number;
  windowEnd: number;
  features: ChunkFeatures;
}

export type AuditEventKind =
  | "detection"
  | "detection_suppressed_duplicate"
  | "ingestion_rejected"
  | "pipeline_error"
  | "config_change";

export interface AuditEntry {
  index: number;
  kind: AuditEventKind;
  payload: unknown;
  timestamp: number;
  prevHash: string;
  hash: string;
}

export interface AuditVerifyResult {
  valid: boolean;
  brokenAtIndex: number | null;
}

/** Row shape returned by GET /processes/:hostId */
export interface ProcessRow {
  pid: number;
  ppid: number;
  processName: string;
  commandLine: string | null;
  executablePath: string | null;
  companyName: string | null;
  description: string | null;
  cpuPercent: number;
  workingSetMb: number | null;
  privateBytesMb: number | null;
  lastSampleAt: number | null;
  firstSeen: number;
  lastSeen: number;
  terminated: boolean;
  detection: {
    severity: Severity;
    confidence: number;
    detectionId: string;
  } | null;
}
