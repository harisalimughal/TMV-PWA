import express from "express";
import { env, warmupAuth } from "./config/env";
import { log } from "./utils/logger";
import { readDataset } from "./read/sheet-reader";
import { normalizeDataset } from "./normalize/normalize";

const app = express();
app.use(express.json({ limit: "2mb" }));

app.get("/healthz", (_req, res) => res.status(200).json({ ok: true }));

// Smoke-test route: proves the copied Sheets/normalize layer actually works end-to-end
// from this project, not just that it compiles. Remove once real routes exist.
app.get("/api/debug/jobs", async (_req, res) => {
  try {
    const dataset = await readDataset();
    const jobs = normalizeDataset(dataset);
    res.status(200).json({ ok: true, count: jobs.length, sample: jobs.slice(0, 3) });
  } catch (error) {
    log.error("debug jobs route failed", error);
    res.status(500).json({ ok: false, error: String(error) });
  }
});

// TODO(pwa): mount real routes here as they're built --
//   - driver auth (magic link / OTP / password -- design TBD)
//   - chat/messages API (once Mongo is wired up)
//   - camera-photo upload endpoint (multipart -> uploadEvidenceImage in google/drive.ts)
//   - WebSocket/SSE layer for live message delivery while the app is open

app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  log.error("unhandled express error", error);
  res.status(500).json({ error: "Internal server error" });
});

async function main(): Promise<void> {
  const server = app.listen(env.port, () => {
    log.info("TMV PWA backend listening", { port: env.port, node_env: env.nodeEnv });
  });

  warmupAuth().catch(error => log.warn("auth warmup failed at startup", { error: String(error) }));

  const shutdown = () => {
    log.info("SIGTERM received; draining");
    server.close(() => process.exit(0));
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch(error => {
  log.error("fatal startup error", error);
  process.exit(1);
});
