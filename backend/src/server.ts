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
import { requireAdminAuth } from "./auth/require-admin-auth";
import { jobsRoutes } from "./jobs/jobs.routes";
import { storageRoutes } from "./jobs/storage.routes";
import { pushRoutes } from "./push/push.routes";
import { syncTodayBookings } from "./jobs/booking.service";
import { dashboardActivityRoutes } from "./admin/dashboard/activity.routes";
import { dashboardDriversSummaryRoutes } from "./admin/dashboard/drivers-summary.routes";
import { dashboardExceptionsRoutes } from "./admin/dashboard/exceptions.routes";
import { dashboardFinanceRoutes } from "./admin/dashboard/finance.routes";
import { dashboardFleetRoutes } from "./admin/dashboard/fleet.routes";
import { dashboardJobsRoutes } from "./admin/dashboard/jobs.routes";
import { dashboardNotificationsRoutes } from "./admin/dashboard/notifications.routes";
import { dashboardScenariosRoutes } from "./admin/dashboard/scenarios.routes";
import { dashboardSummaryRoutes } from "./admin/dashboard/summary.routes";

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());

app.get("/healthz", (_req, res) => res.status(200).json({ ok: true }));

app.use("/api/auth", authRoutes());
app.use("/api/admin", adminRoutes());
app.use("/api/jobs", jobsRoutes());
app.use("/api/storage", storageRoutes());
app.use("/api/push", pushRoutes());

// The ported admin dashboard (Overview/Jobs/Live Fleet/Exceptions/Reports/Activity/
// Messaging/Scenarios/Finance/driver performance stats) -- same requireAdminAuth
// session as adminRoutes() above, just a different set of (mostly read-only) endpoints.
// See admin/dashboard/*.
app.use("/api/admin/jobs", requireAdminAuth, dashboardJobsRoutes());
app.use("/api/admin/drivers", requireAdminAuth, dashboardDriversSummaryRoutes());
app.use("/api/admin/summary", requireAdminAuth, dashboardSummaryRoutes());
app.use("/api/admin/finance", requireAdminAuth, dashboardFinanceRoutes());
app.use("/api/admin/exceptions", requireAdminAuth, dashboardExceptionsRoutes());
app.use("/api/admin/fleet", requireAdminAuth, dashboardFleetRoutes());
app.use("/api/admin/scenarios", requireAdminAuth, dashboardScenariosRoutes());
app.use("/api/admin/activity", requireAdminAuth, dashboardActivityRoutes());
app.use("/api/admin/notifications", requireAdminAuth, dashboardNotificationsRoutes());

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
  // Static assets with smart caching:
  // - Hashed assets (/assets/*): 1 year immutable
  // - HTML shell & Service Worker (index.html, sw.js, manifest): no-cache so updates apply immediately
  app.use(express.static(finalDistPath, {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith("index.html") || filePath.endsWith("sw.js") || filePath.endsWith("manifest.webmanifest")) {
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      } else if (filePath.includes(`${path.sep}assets${path.sep}`) || filePath.includes("/assets/")) {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      }
    }
  }));

  // Missing static assets should NEVER fall back to index.html (which causes MIME type errors when importing JS chunks)
  app.get(/^\/assets\/.*/, (_req, res) => {
    res.status(404).type("text/plain").send("Asset not found");
  });

  // A RegExp, not the string "*" -- Express 4.21+ bundles a path-to-regexp version that
  // deprecated the bare "*" wildcard (it silently fails to match anything, including
  // "/", rather than erroring at registration time). /.*/ isn't affected by that syntax
  // change either way.
  app.get(/.*/, (_req, res) => {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
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
