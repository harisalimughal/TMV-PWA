const fs = require("node:fs");
const path = require("node:path");
const dotenv = require("dotenv");
const { MongoClient } = require("mongodb");
const { DateTime } = require("luxon");
const { reportJobPayments } = require("../src/reports/report-payments.ts");

async function main() {
  const [initials, from, to] = process.argv.slice(2);
  if (!initials || !from || !to) throw new Error("Provide driver initials and inclusive London dates.");
  const start = DateTime.fromISO(from, { zone: "Europe/London" }).startOf("day");
  const finish = DateTime.fromISO(to, { zone: "Europe/London" }).startOf("day").plus({ days: 1 });
  if (!start.isValid || !finish.isValid || finish <= start) throw new Error("Invalid date range.");
  const config = dotenv.parse(fs.readFileSync(path.resolve(__dirname, "../.env")));
  if (!config.MONGODB_URI) throw new Error("Active database configuration is missing.");
  const client = new MongoClient(config.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
  try {
    await client.connect();
    const db = client.db(config.MONGODB_DB_NAME || "tmv_pwa");
    const jobs = await db.collection("jobs").find({ status: "COMPLETED", $or: [{ driverInitials: initials }, { "reportIdentity.initials": initials }, { "timeBilling.driverInitials": initials }] },
      { projection: { _id: 0, jobId: 1, driverInitials: 1, reportIdentity: 1, actualStart: 1, bookedStart: 1, actualStartSource: 1,
        totalCharges: 1, calculatedTotalCharges: 1, amountCharged: 1, totalAdjustmentNote: 1, timeBilling: 1, chargeSnapshot: 1, updatedAt: 1, createdAt: 1, paymentMethod: 1, paymentStatus: 1, paymentBreakdown: 1, actualFinishSource: 1, currentState: 1, paidOnline: 1 } }).toArray();
    const rows = jobs.filter(job => {
      const owner = job.reportIdentity?.initials || job.timeBilling?.driverInitials || job.driverInitials;
      const at = DateTime.fromISO(job.actualStartSource === "completion-fallback" ? job.bookedStart : job.actualStart || job.bookedStart);
      return owner === initials && at.isValid && at >= start && at < finish;
    }).map(job => ({ jobId: job.jobId, at: job.actualStart || job.bookedStart, expected: job.calculatedTotalCharges ?? job.totalCharges,
      charged: job.amountCharged ?? job.totalCharges, reason: job.totalAdjustmentNote || null,
      hasBillingSnapshot: !!job.timeBilling, hasChargeSnapshot: !!job.chargeSnapshot, createdAt: job.createdAt, updatedAt: job.updatedAt,
      paymentMethod: job.paymentMethod, paymentStatus: job.paymentStatus, paymentBreakdown: job.paymentBreakdown, actualFinishSource: job.actualFinishSource, currentState: job.currentState, paidOnline: job.paidOnline }));
    const mismatchIds = rows.filter(row => Math.round(row.expected * 100) !== Math.round(row.charged * 100)).map(row => row.jobId);
    const history = mismatchIds.length ? await db.collection("activity").find({ jobId: { $in: mismatchIds } }, { projection: { _id: 0, jobId: 1, action: 1, timestamp: 1, fromState: 1, toState: 1 } }).sort({ timestamp: 1 }).toArray() : [];
    console.log(JSON.stringify({ mode: "read-only", initials, from, to, jobs: rows.length,
      expected: rows.reduce((sum, row) => sum + Math.round(row.expected * 100), 0) / 100,
      charged: rows.reduce((sum, row) => sum + Math.round(row.charged * 100), 0) / 100,
      mismatches: rows.filter(row => Math.round(row.expected * 100) !== Math.round(row.charged * 100)),
      unverifiedPayments: rows.flatMap(row => {
        const payments = reportJobPayments({ paymentMethod: row.paymentMethod, paymentStatus: row.paymentStatus, paymentBreakdown: row.paymentBreakdown, totalCharges: row.expected, amountCharged: row.charged }).payments;
        return payments.issues.length ? [{ jobId: row.jobId, issues: payments.issues }] : [];
      }), history }, null, 2));
  } finally { await client.close(); }
}
main().catch(() => { console.error("Read-only adjustment audit could not connect or complete; credentials were not logged."); process.exitCode = 1; });
