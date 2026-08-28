import dns from "node:dns";
import express from "express";
import cookieParser from "cookie-parser";
import path from "node:path";
import fs from "node:fs";
import { env, warmupAuth } from "./config/env";

// The VPS this runs on prefers IPv6 for outbound connections. MongoDB Atlas's Network
// Access list only has the IPv4 address allow-listed (0.0.0.0/0), so an IPv6 connection
// gets past plain TCP but is killed by Atlas's TLS-routing proxy with a generic
// "tlsv1 alert internal error" -- indistinguishable from a real TLS bug until you
// notice it's specific to this one host. Forcing IPv4 resolution avoids needing an
// IPv6 entry in Atlas at all.
dns.setDefaultResultOrder("ipv4first");
import { log } from "./utils/logger";
import { readDataset } from "./read/sheet-reader";
import { normalizeDataset } from "./normalize/normalize";
import { ensureIndexes } from "./db/mongo";
import { authRoutes } from "./auth/auth.routes";
import { requireDriverAuth } from "./auth/require-driver-auth";

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());

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

app.use("/api/auth", authRoutes());

// Smoke-test route: proves requireDriverAuth actually works end-to-end (cookie ->
// verified session -> DB revocation check). Remove once real protected routes exist.
app.get("/api/debug/whoami", requireDriverAuth, (req, res) => {
  res.status(200).json({ ok: true, driverEmail: req.driverEmail });
});

// TODO(pwa): mount real routes here as they're built --
//   - the core job-workflow API (next job, start job, evidence upload, finish job --
//     porting workflow.engine.ts's command handling to plain REST, per the "same bot,
//     new UI, no chat protocol" decision)
//   - camera-photo upload endpoint (multipart -> uploadEvidenceImage in google/drive.ts;
//     see the TODO(pwa) note in google/drive.ts about the evidence-pipeline adaptation
//     this needs)

// Serve the built PWA frontend (web/dist), if present. This whole domain IS the app --
// unlike TMV-Chat-bot's /ops, there's no separate public marketing site sharing the
// host, so the SPA shell is served at the root and everything not matched above (i.e.
// not /healthz or /api/*) falls through to index.html for client-side routing.
const distPath = path.resolve(__dirname, "../web/dist");
const fallbackDistPath = path.resolve(process.cwd(), "web/dist");
const finalDistPath = fs.existsSync(distPath) ? distPath : fallbackDistPath;

if (fs.existsSync(finalDistPath)) {
  app.use(express.static(finalDistPath));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(finalDistPath, "index.html"));
  });
} else {
  app.get("*", (_req, res) => {
    res.status(200).send("TMV PWA backend is online. Frontend bundle not built yet.");
  });
}

app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  log.error("unhandled express error", error);
  res.status(500).json({ error: "Internal server error" });
});

async function main(): Promise<void> {
  await ensureIndexes();

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
