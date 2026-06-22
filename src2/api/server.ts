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
