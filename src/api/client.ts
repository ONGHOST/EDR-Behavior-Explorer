import type {
  AuditEntry,
  AuditVerifyResult,
  BehaviorChunk,
  Detection,
  GraphSnapshot,
  ProcessRow,
} from "./types";

// All requests go through the /api prefix, which Vite's dev server proxies
// to the backend (see vite.config.ts). In a production build, serve this
// app behind the same reverse proxy / origin as the engine, or set
// VITE_API_BASE at build time to point at an absolute URL.
const BASE = (import.meta as any).env?.VITE_API_BASE ?? "/api";

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) {
    throw new ApiError(res.status, `${path} -> ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  getDetections(opts: { hostId?: string; minConfidence?: number } = {}): Promise<Detection[]> {
    const params = new URLSearchParams();
    if (opts.hostId) params.set("hostId", opts.hostId);
    if (opts.minConfidence !== undefined) params.set("minConfidence", String(opts.minConfidence));
    const qs = params.toString();
    return getJson(`/detections${qs ? `?${qs}` : ""}`);
  },

  getGraph(hostId: string): Promise<GraphSnapshot> {
    return getJson(`/graph/${encodeURIComponent(hostId)}`);
  },

  getChunks(opts: { entityId?: string } = {}): Promise<BehaviorChunk[]> {
    const params = new URLSearchParams();
    if (opts.entityId) params.set("entityId", opts.entityId);
    const qs = params.toString();
    return getJson(`/chunks${qs ? `?${qs}` : ""}`);
  },

  verifyAudit(): Promise<AuditVerifyResult> {
    return getJson(`/audit/verify`);
  },

  getAuditTail(n = 50): Promise<AuditEntry[]> {
    return getJson(`/audit/tail?n=${n}`);
  },

  getProcesses(hostId: string, opts: { activeOnly?: boolean; sortBy?: "cpu" | "mem" | "pid" | "name" } = {}): Promise<ProcessRow[]> {
    const params = new URLSearchParams();
    if (opts.activeOnly) params.set("activeOnly", "true");
    if (opts.sortBy) params.set("sortBy", opts.sortBy);
    const qs = params.toString();
    return getJson(`/processes/${encodeURIComponent(hostId)}${qs ? `?${qs}` : ""}`);
  },
};

export { ApiError };
