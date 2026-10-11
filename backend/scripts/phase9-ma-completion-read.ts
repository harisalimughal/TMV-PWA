import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { Collection, Db } from "mongodb";
import { DateTime } from "luxon";
import assert from "node:assert/strict";
import http from "node:http";
import https from "node:https";

let stage = "configuration";
async function main() {
  assert.deepEqual(process.argv.slice(2), ["--production-ma-read-only"], "Explicit production read-only flag required.");
  const config = dotenv.parse(fs.readFileSync(path.join(__dirname, "../.env")));
  assert.ok(config.MONGODB_URI, "Active URI missing; no fallback allowed.");
  for (const key of Object.keys(process.env)) if (/GOOGLE_|FIRETEXT|VAPID|CLOUDINARY|GPS_API|TMV_ADMIN|SESSION_SIGNING/.test(key)) delete process.env[key];
  process.env.DOTENV_CONFIG_PATH = "__ma_read_verifier_no_env_reload__";
  process.env.MONGODB_URI = config.MONGODB_URI;
  process.env.MONGODB_DB_NAME = config.MONGODB_DB_NAME?.trim() || "tmv_pwa";
  process.env.LOG_LEVEL = "error";
  process.env.TMV_GPS_HISTORY_SYNC_ENABLED = "false";

  const deny = () => { throw new Error("Writes and outbound integrations prohibited by MA verifier."); };
  for (const method of ["insertOne", "insertMany", "updateOne", "updateMany", "replaceOne", "deleteOne", "deleteMany", "bulkWrite",
    "findOneAndUpdate", "findOneAndReplace", "findOneAndDelete", "createIndex", "createIndexes", "dropIndex", "dropIndexes", "drop", "rename"])
    Object.defineProperty(Collection.prototype, method, { value: deny, configurable: true });
  for (const method of ["command", "createCollection", "dropCollection", "dropDatabase", "renameCollection"])
    Object.defineProperty(Db.prototype, method, { value: deny, configurable: true });
  const aggregate = Collection.prototype.aggregate;
  Collection.prototype.aggregate = function(pipeline: any[] = [], options?: any): any {
    if (/"\$(out|merge)"\s*:/.test(JSON.stringify(pipeline))) deny();
    return aggregate.call(this, pipeline, options);
  };
  globalThis.fetch = async () => deny();
  for (const transport of [http, https]) for (const method of ["request", "get"] as const)
    Object.defineProperty(transport, method, { value: deny, configurable: true });

  const { getDb } = await import("../src/db/mongo");
  const db = await getDb();
  stage = "MA-job-read";
  const jobId = "TMV-8B626F68AE";
  const driver = await db.collection("driver_accounts").findOne({ initials: "MA", email: "hello@themanvan.co.uk" });
  assert.ok(driver?.active);
  const job = await db.collection("jobs").findOne({ jobId, driverInitials: "MA" });
  assert.ok(job, "Expected MA job missing.");
  const manual = await db.collection("driver_job_summaries").findOne({ jobId });
  const manualCount = await db.collection("driver_job_summaries").countDocuments({ jobId });
  assert.ok(manualCount <= 1, "Duplicate manual submission found.");
  if (manual) { assert.equal(manual.driverInitials, "MA"); assert.equal(manual.driverEmail, "hello@themanvan.co.uk"); }
  const required = !!job.manualDetailsRequiredAt;
  const instant = job.actualStartSource === "completion-fallback" ? job.bookedStart : job.actualStart || job.bookedStart;
  const day = DateTime.fromISO(instant).setZone("Europe/London");
  assert.ok(day.isValid);
  const range = { from: day.startOf("day").toUTC().toISO()!, to: day.startOf("day").plus({ days: 1 }).toUTC().toISO()! };
  stage = "MA-day-report";
  const { buildDriverReport } = await import("../src/reports/driver-report.service");
  const report = await buildDriverReport("MA", range);
  const row = report.jobs.find(row => row.jobId === jobId);
  assert.ok(row, "Completed job missing from MA report.");
  assert.equal(row.status, job.status);
  assert.equal(row.manualStatus, manual ? "submitted-locked" : job.status === "COMPLETED" ? "pending-submission" : "not-completed");
  const billing = job.timeBilling;
  let allocationVerified = false, overtimeVerified = false;
  if (billing) {
    assert.equal(billing.allocatedMinutes, Math.ceil(billing.scheduledMinutes / 60) * 60);
    allocationVerified = true;
    assert.equal(billing.extraMinutes, Math.max(0, billing.actualMinutes - billing.allocatedMinutes));
    const rate = billing.ratePer30Pence;
    if (typeof rate === "number" && billing.extraChargePence !== null) {
      assert.equal(billing.extraChargePence, Math.ceil(billing.extraMinutes / 30) * rate);
      overtimeVerified = true;
    }
  }
  if (manual) {
    const collected = manual.paymentBreakdown.filter((payment: any) => payment.method !== "Invoice")
      .reduce((sum: number, payment: any) => sum + payment.amountPence, 0);
    assert.equal(collected, manual.amountCollectedPence);
    assert.equal(row.finance.manualPayments?.knownCollectedPence, collected);
  }
  const { generateDriverReportXlsx } = await import("../src/reports/driver-report.xlsx");
  const { generateDriverReportPdf } = await import("../src/reports/driver-report.pdf");
  stage = "MA-report-exports";
  const workbook = await generateDriverReportXlsx(report);
  const pdf = await generateDriverReportPdf(report);
  assert.equal(pdf.subarray(0, 4).toString(), "%PDF");
  const ExcelJS = (await import("exceljs")).default;
  const reopened = new ExcelJS.Workbook();
  await reopened.xlsx.load(workbook as any);
  assert.equal(reopened.worksheets.length, 8);
  assert.ok(reopened.worksheets.some(sheet => JSON.stringify(sheet.getSheetValues()).includes(jobId)));
  stage = "MA-queue-read";
  const { listJobs } = await import("../src/db/jobs.repo");
  const { pendingManualDetails } = await import("../src/jobs/manual-details-gate");
  const jobs = await listJobs({ driverInitials: "MA" });
  const pending = await pendingManualDetails(jobs);
  const active = jobs.filter(job => job.status === "IN_PROGRESS");
  const indices = manual ? await db.collection("driver_job_summaries").listIndexes().toArray() : [];
  stage = "unchanged-job-and-manual-proof";
  assert.deepEqual(await db.collection("jobs").findOne({ jobId, driverInitials: "MA" }), job);
  assert.deepEqual(await db.collection("driver_job_summaries").findOne({ jobId }), manual);
  console.log(JSON.stringify({ mode: "MA-production-read-only", jobId, status: job.status,
    currentState: job.currentState, manualRequired: required, manualCount,
    manualStatus: row.manualStatus, manualSubmittedAt: manual?.submittedAt || null,
    uniqueManualJobIndex: indices.some(index => index.unique && index.key.jobId === 1 && Object.keys(index.key).length === 1),
    duration: row.duration, finance: { expectedPence: row.finance.expectedPence,
      systemCollectedPence: row.finance.systemPayments.collectedPence,
      manualCollectedPence: row.finance.manualPayments?.collectedPence ?? null,
      outstandingPence: row.finance.outstandingPence, excessCollectionPence: row.finance.excessCollectionPence,
      methodDifferences: row.finance.paymentMethodDifferences, overtimePence: row.finance.overtimePence },
    allocationVerified, overtimeVerified, liveMutationRetriesTested: false,
    prepayments: { paidOnlineFlag: job.paidOnline, confirmedRecords: job.confirmedPrepayments?.length || 0,
      verified: row.finance.prepaymentsVerified }, issues: row.issues,
    gpsCoverage: report.gpsSummary.coverage, confirmedTunnelCrossings: report.gpsSummary.confirmedTunnelCrossings,
    pendingManualJob: pending?.jobId || null, activeJobs: active.map(job => ({ jobId: job.jobId, bookedStart: job.bookedStart })),
    exports: { xlsxBytes: workbook.length, reopenedSheets: reopened.worksheets.length, jobReferenceVerified: true, pdfBytes: pdf.length },
    recordsUnchanged: true, noWritesOrOutboundIntegrations: true }, null, 2));
}
const timeout = setTimeout(() => { console.error("MA verifier timed out; private details withheld."); process.exit(1); }, 120000);
main().then(() => { clearTimeout(timeout); process.exit(0); }).catch(error => {
  console.error(`MA read verification failed at ${stage} (${error.name || "Error"}, code ${error.code ?? "none"}); private details withheld.`);
  process.exit(1);
});
