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
import { ensureIndexes } from "./db/mongo";
import { authRoutes } from "./auth/auth.routes";
import { adminRoutes } from "./auth/admin.routes";
import { jobsRoutes } from "./jobs/jobs.routes";
import { syncTodayBookings } from "./jobs/booking.service";

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());

app.get("/healthz", (_req, res) => res.status(200).json({ ok: true }));

app.use("/api/auth", authRoutes());
app.use("/api/admin", adminRoutes());
app.use("/api/jobs", jobsRoutes());

// Serve the built PWA frontend (web/dist), if present. This whole domain IS the app --
// unlike TMV-Chat-bot's /ops, there's no separate public marketing site sharing the
// host, so the SPA shell is served at the root and everything not matched above (i.e.
// not /healthz or /api/*) falls through to index.html for client-side routing.
// Candidates cover both layouts this ever actually runs under:
//   - production (Docker): compiled server.js lands at /app/dist/server.js, and
//     web/dist is copied to /app/web/dist -- one level up from __dirname.
//   - local dev (`tsx src/server.ts`, run from backend/): __dirname is
//     backend/src, two levels up from web/dist, which is a sibling of backend/.
const distCandidates = [
  path.resolve(__dirname, "../web/dist"),
  path.resolve(__dirname, "../../web/dist"),
  path.resolve(process.cwd(), "web/dist"),
  path.resolve(process.cwd(), "../web/dist")
];
const finalDistPath = distCandidates.find(candidate => fs.existsSync(candidate)) ?? distCandidates[0];

if (fs.existsSync(finalDistPath)) {
  app.use(express.static(finalDistPath));
  // A RegExp, not the string "*" -- Express 4.21+ bundles a path-to-regexp version that
  // deprecated the bare "*" wildcard (it silently fails to match anything, including
  // "/", rather than erroring at registration time). /.*/ isn't affected by that syntax
  // change either way.
  app.get(/.*/, (_req, res) => {
    res.sendFile(path.join(finalDistPath, "index.html"));
  });
} else {
  app.get(/.*/, (_req, res) => {
    res.status(200).send("TMV PWA backend is online. Frontend bundle not built yet.");
  });
}

app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  log.error("unhandled express error", error);
  res.status(500).json({ error: "Internal server error" });
});

/**
 * Keeps Mongo's job data fresh from Calendar without needing an external scheduler.
 * TMV-Chat-bot's equivalent relies on Cloud Scheduler hitting /internal/sync; this app
 * has no such infra configured yet, so it just syncs itself on the same interval
 * jobs.service.ts's own throttle uses. A driver requesting their job list also
 * triggers a throttled sync (see getNextJobForDriver's `sync: true`), so this interval
 * mainly matters for picking up new/changed bookings when nobody has the app open.
 */
function startBackgroundSync(): void {
  const run = () => {
    syncTodayBookings()
      .then(jobs => log.debug("background calendar sync completed", { synced: jobs.length }))
      .catch(error => log.warn("background calendar sync failed", { error: String(error) }));
  };
  run();
  setInterval(run, env.calendarSyncTtlMs);
}

async function main(): Promise<void> {
  await ensureIndexes();

  const server = app.listen(env.port, () => {
    log.info("TMV PWA backend listening", { port: env.port, node_env: env.nodeEnv });
  });

  warmupAuth().catch(error => log.warn("auth warmup failed at startup", { error: String(error) }));
  startBackgroundSync();

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
