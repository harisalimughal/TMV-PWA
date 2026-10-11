import { createRequire } from "node:module";
import { Collection, Db } from "mongodb";
import { DateTime } from "luxon";
import assert from "node:assert/strict";
import http from "node:http";
import https from "node:https";

const require = createRequire(__filename);
const { stagingConfig } = require("./phase9-staging-inventory.cjs");
let stage = "configuration";

async function main() {
  const { config, uri, database } = stagingConfig();
  // Populate only this process before importing application modules; never rewrite .env.
  for (const key of Object.keys(process.env)) if (/GOOGLE_|FIRETEXT|VAPID|CLOUDINARY|TMV_ADMIN|SESSION_SIGNING/.test(key)) delete process.env[key];
  process.env.DOTENV_CONFIG_PATH = "__staging_verifier_no_env_reload__";
  process.env.MONGODB_URI = uri;
  process.env.MONGODB_DB_NAME = database;
  process.env.TMV_TIMEZONE = "Europe/London";
  process.env.GPS_API = config.GPS_API || "";
  process.env.TMV_GPS_HISTORY_SYNC_ENABLED = "false";
  process.env.LOG_LEVEL = "error";

  const denyWrite = () => { throw new Error("Database writes prohibited in staging read verifier."); };
  for (const method of ["insertOne", "insertMany", "updateOne", "updateMany", "replaceOne", "deleteOne", "deleteMany",
    "findOneAndUpdate", "findOneAndReplace", "findOneAndDelete", "bulkWrite", "createIndex", "createIndexes", "dropIndex", "dropIndexes", "drop", "rename"])
    Object.defineProperty(Collection.prototype, method, { value: denyWrite, configurable: true });
  for (const method of ["command", "createCollection", "dropCollection", "dropDatabase", "renameCollection"])
    Object.defineProperty(Db.prototype, method, { value: denyWrite, configurable: true });
  const originalAggregate = Collection.prototype.aggregate;
  Collection.prototype.aggregate = function(pipeline: any[] = [], options?: any): any {
    if (JSON.stringify(pipeline).match(/"\$(out|merge)"\s*:/)) denyWrite();
    return originalAggregate.call(this, pipeline, options);
  };
  for (const transport of [http, https]) for (const method of ["request", "get"] as const)
    Object.defineProperty(transport, method, { value: () => { throw new Error("Outbound integration disabled."); }, configurable: true });
  const originalFetch = globalThis.fetch;
  const allowed = new Map([
    ["/v1/devices/list", "GET"], ["/v1/places/zones", "GET"], ["/v1/alerts/custom", "POST"],
    ["/v1/devices/history", "POST"], ["/v1/trip-history", "POST"]
  ]);
  let requests = 0;
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (url.origin !== "https://api.gpslive.app" || allowed.get(url.pathname) !== (init?.method || "GET") || ++requests > 8)
      throw new Error("Only bounded GPS read endpoints are allowed.");
    return originalFetch(input, { ...init, redirect: "error", signal: AbortSignal.timeout(15000) });
  };
  const { getDb } = await import("../src/db/mongo");
  const db = await getDb();
  stage = "staging-job-read";
  const driver = await db.collection("driver_accounts").findOne({ initials: "MA", email: "hello@themanvan.co.uk" });
  assert.ok(driver?.active);
  const before = await db.collection("jobs").find({ driverInitials: "MA" }).limit(100).toArray();
  assert.ok(before.length);
  const timestamps = before.map(job => DateTime.fromISO(job.actualStart || job.bookedStart).toMillis()).filter(Number.isFinite);
  assert.ok(timestamps.length);
  const range = { from: DateTime.fromMillis(Math.min(...timestamps)).startOf("day").toUTC().toISO()!,
    to: DateTime.fromMillis(Math.max(...timestamps)).plus({ days: 1 }).startOf("day").toUTC().toISO()! };

  stage = "real-mongo-report";
  const { buildDriverReport } = await import("../src/reports/driver-report.service");
  const report = await buildDriverReport("MA", range);
  assert.equal(report.driver.initials, "MA");
  assert.equal(new Set(report.jobs.map(job => job.jobId)).size, report.jobs.length);
  const { generateDriverReportXlsx } = await import("../src/reports/driver-report.xlsx");
  const { generateDriverReportPdf } = await import("../src/reports/driver-report.pdf");
  stage = "report-exports";
  const xlsx = await generateDriverReportXlsx(report);
  const pdf = await generateDriverReportPdf(report);
  assert.equal(Buffer.from(xlsx).subarray(0, 2).toString(), "PK");
  assert.equal(Buffer.from(pdf).subarray(0, 4).toString(), "%PDF");

  stage = "incomplete-job-submission-denial";
  const ready = before.find(job => job.status === "READY");
  if (ready) {
    const { submitDriverJobSummary } = await import("../src/jobs/driver-job-summary.service");
    await assert.rejects(submitDriverJobSummary(ready.jobId, "hello@themanvan.co.uk", {}), /Complete this job/);
  }

  stage = "gps-read-only";
  const gps: Record<string, any> = { requests: 0, providerCompleteness: "unknown", persisted: false };
  const { fetchGpsLiveDevices, fetchGpsLiveZones } = await import("../src/integrations/gpslive");
  const devices = await fetchGpsLiveDevices();
  const selected = devices.find(device => device.imei === driver.imei) || devices.find(device => !!device.dtTracker);
  gps.deviceCount = devices.length;
  gps.selected = selected ? selected.imei === driver.imei ? "MA-assigned-tracker" : "other-tracker" : "none";
  if (selected) {
    const zones = await fetchGpsLiveZones();
    gps.zoneCount = zones.length;
    const { gpsTime, parseGpsEvent, parseGpsPosition, parseGpsDrive } = await import("../src/gps/gps.parse");
    const { fetchGpsHistorySlice } = await import("../src/gps/gps.provider");
    const now = new Date().toISOString();
    const latest = gpsTime(selected.dtTracker, now);
    const endMs = latest.occurredAt && latest.timeSource !== "future" ? Math.min(Date.now(), Date.parse(latest.occurredAt) + 1000) : Date.now();
    const from = new Date(endMs - 3 * 3600000).toISOString(), to = new Date(endMs).toISOString();
    gps.window = { from, to, basis: latest.occurredAt ? "latest-tracker-sample" : "current-time" };
    for (const source of ["alerts", "positions", "trips"] as const) {
      try {
        const body: any = await fetchGpsHistorySlice(source, selected.imei, from, to);
        const rows = source === "trips" ? body?.routes : body;
        const shapeValid = Array.isArray(rows) && (source !== "trips" || Array.isArray(body.drives) && (body.events === undefined || Array.isArray(body.events)));
        const valid = shapeValid ? rows.filter((row: any) => source === "alerts" ? parseGpsEvent(row, "alerts-history", now, selected.imei)?.occurredAt : parseGpsPosition(row, selected.imei, source === "trips" ? "trip-history" : "positions-history", now)).length : 0;
        gps[source] = { shapeValid, rows: Array.isArray(rows) ? rows.length : null, validRows: valid,
          ...(source === "trips" && shapeValid ? { drives: body.drives.length,
            validDrives: body.drives.filter((row: any) => parseGpsDrive(row, selected.imei, now)).length,
            events: body.events?.length || 0 } : {}) };
      } catch (error) { gps[source] = { failed: true, status: (error as any).status || null }; }
    }
  }
  gps.requests = requests;
  stage = "unchanged-database-proof";
  const after = await db.collection("jobs").find({ driverInitials: "MA" }).limit(100).toArray();
  assert.deepEqual(after, before);
  console.log(JSON.stringify({ mode: "staging-read-only", jobsUnchanged: true, writesBlocked: true,
    calendarNotificationsDisabled: true, reportJobs: report.jobs.length, reportGpsCoverage: report.gpsSummary.coverage,
    xlsxBytes: xlsx.length, pdfBytes: pdf.length, incompleteJobSubmissionDenied: !!ready, gps }, null, 2));
}

main().then(() => process.exit(0)).catch(error => {
  console.error(`Staging read check failed at ${stage} (${error.name || "Error"}, code ${error.code ?? "none"}); private details withheld.`);
  process.exit(1);
});
