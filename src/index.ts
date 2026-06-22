import { BehaviorEngine } from "./pipeline.js";
import { buildServer } from "./api/server.js";

const engine = new BehaviorEngine({ windowMs: 60_000, strideMs: 30_000 });
engine.startAutoFlush(Number(process.env.EDR_AUTOFLUSH_MS) || 15_000);
const app = buildServer(engine);

const port = Number(process.env.PORT ?? 8787);
app.listen({ port, host: "0.0.0.0" }).then(() => {
  console.log(`Behavior Explorer engine listening on :${port}`);
  console.log(`POST /events            ingest telemetry`);
  console.log(`GET  /detections        list detections`);
  console.log(`GET  /graph/:hostId     process graph snapshot`);
  console.log(`GET  /audit/verify      verify audit chain integrity`);
  console.log(`GET  /audit/tail?n=20   recent audit entries`);
});
