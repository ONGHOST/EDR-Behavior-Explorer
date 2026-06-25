// ============================================================================
// API Layer
// Thin HTTP surface over the BehaviorEngine. This is what a real sensor
// fleet POSTs to, and what a SOC dashboard reads from.
// ============================================================================

import Fastify from "fastify";
import { BehaviorEngine } from "../pipeline.js";

export function buildServer(engine: BehaviorEngine) {
  const app = Fastify({ logger: false });

  app.post("/events", async (req, reply) => {
    const body = req.body as unknown;
    const events = Array.isArray(body) ? body : [body];
    engine.ingestBatch(events);
    reply.code(202).send({ accepted: events.length });
  });

  app.get("/detections", async (req, reply) => {
    const { hostId, minConfidence } = req.query as { hostId?: string; minConfidence?: string };
    let results = engine.getDetections();
    if (hostId) results = results.filter((d) => d.hostId === hostId);
    if (minConfidence) results = results.filter((d) => d.confidence >= Number(minConfidence));
    reply.send(results);
  });

  app.get("/graph/:hostId", async (req, reply) => {
    const { hostId } = req.params as { hostId: string };
    const snapshot = engine.graph.snapshot(hostId);
    if (!snapshot) return reply.code(404).send({ error: "no graph data for host" });
    reply.send(snapshot);
  });

  /**
   * Live process table — all processes seen on a host, enriched with the
   * latest resource_sample metrics (cpu, working set, private bytes),
   * company name, description, and any highest-severity detection.
   * This is what the Task-Manager-style explorer page queries.
   *
   * Query params:
   *   activeOnly=true  — omit processes with a terminatedAt timestamp
   *   sortBy=cpu|mem|pid|name  — default cpu
   */
  app.get("/processes/:hostId", async (req, reply) => {
    const { hostId } = req.params as { hostId: string };
    const { activeOnly, sortBy } = req.query as { activeOnly?: string; sortBy?: string };

    const snapshot = engine.graph.snapshot(hostId);
    if (!snapshot) return reply.code(404).send({ error: "no process data for host" });

    // Build a highest-severity-detection map per pid
    const severityRank: Record<string, number> = { low: 0, medium: 1, high: 2, critical: 3 };
    const detectionByPid = new Map<
      number,
      { severity: string; confidence: number; detectionId: string }
    >();
    for (const d of engine.getDetections()) {
      if (d.hostId !== hostId) continue;
      const existing = detectionByPid.get(d.pid);
      if (!existing || severityRank[d.severity] > severityRank[existing.severity]) {
        detectionByPid.set(d.pid, {
          severity: d.severity,
          confidence: d.confidence,
          detectionId: d.detectionId,
        });
      }
    }

    let rows = snapshot.nodes
      .filter((n) => (activeOnly === "true" ? !n.terminatedAt : true))
      .map((n) => ({
        pid: n.pid,
        ppid: n.ppid,
        processName: n.processName,
        commandLine: n.commandLine ?? null,
        executablePath: n.executablePath ?? null,
        companyName: n.companyName ?? null,
        description: n.description ?? null,
        cpuPercent: n.lastCpuPercent ?? 0,
        workingSetMb:
          n.lastWorkingSetBytes != null
            ? Number((n.lastWorkingSetBytes / 1_048_576).toFixed(1))
            : null,
        privateBytesMb:
          n.lastPrivateBytesBytes != null
            ? Number((n.lastPrivateBytesBytes / 1_048_576).toFixed(1))
            : null,
        lastSampleAt: n.lastSampleAt ?? null,
        firstSeen: n.firstSeen,
        lastSeen: n.lastSeen,
        terminated: !!n.terminatedAt,
        detection: detectionByPid.get(n.pid) ?? null,
      }));

    const sort = sortBy ?? "cpu";
    rows = rows.sort((a, b) => {
      if (sort === "cpu") return b.cpuPercent - a.cpuPercent;
      if (sort === "mem") return (b.workingSetMb ?? 0) - (a.workingSetMb ?? 0);
      if (sort === "pid") return a.pid - b.pid;
      if (sort === "name") return a.processName.localeCompare(b.processName);
      return 0;
    });

    reply.send(rows);
  });

  app.get("/chunks", async (req, reply) => {
    const { entityId, format } = req.query as { entityId?: string; format?: string };
    let results = engine.getChunks();
    if (entityId) results = results.filter((c) => c.entityId === entityId);

    if (format === "features") {
      // Flat feature-vector export — ready to hand to a training pipeline.
      reply.send(results.map((c) => ({ chunkId: c.chunkId, entityId: c.entityId, ...c.features })));
      return;
    }
    reply.send(results);
  });

  app.get("/audit/verify", async (_req, reply) => {
    reply.send(engine.audit.verifyChain());
  });

  app.get("/audit/tail", async (req, reply) => {
    const { n } = req.query as { n?: string };
    reply.send(engine.audit.tail(n ? Number(n) : 20));
  });

  return app;
}
