import { getDb } from "../db/mongo";
import type { Job } from "../jobs/job.types";
import type { DriverJobSummaryDoc } from "../db/driver-job-summary.repo";
import type { ScenarioSubmissionDoc } from "../db/scenario.repo";
import type { LiabilityRecord } from "../liabilities/liability.model";
import { ObjectId } from "mongodb";

export class ReportCapacityError extends Error {}
const CAP = 5000;
export async function ensureDriverReportIndexes() {
  const db = await getDb();
  await db.collection("jobs").createIndex({ "reportIdentity.initials": 1, actualStart: 1 });
  await db.collection("jobs").createIndex({ "timeBilling.driverInitials": 1, bookedStart: 1 });
  await db.collection("jobs").createIndex({ "confirmedPrepayments.reference": 1 });
  await db.collection("driver_job_summaries").createIndex({ driverInitials: 1, jobId: 1 });
}
const date = (field: string) => ({ $cond: [{ $regexMatch: { input: { $ifNull: [field, ""] }, regex: "(Z|[+-][0-9]{2}:[0-9]{2})$", options: "i" } },
  { $convert: { input: field, to: "date", onError: null, onNull: null } }, null] });
export async function reportPrepaymentConflicts(jobs: Job[]): Promise<string[]> {
  const refs = [...new Set(jobs.flatMap(job => (job.confirmedPrepayments ?? []).map(payment => payment.reference)).filter(reference => typeof reference === "string" && !!reference))];
  if (!refs.length) return [];
  const records = await (await getDb()).collection<Job>("jobs").find({ "confirmedPrepayments.reference": { $in: refs } })
    .project<Job>({ jobId: 1, confirmedPrepayments: 1 }).limit(CAP + 1).toArray();
  if (records.length > CAP) throw new ReportCapacityError("Too many shared prepayment references; verify allocations or narrow the range.");
  const owners = new Map<string, Set<string>>();
  for (const job of records) for (const payment of job.confirmedPrepayments ?? []) {
    const set = owners.get(payment.reference) ?? new Set<string>(); set.add(job.jobId); owners.set(payment.reference, set);
  }
  return jobs.filter(job => job.confirmedPrepayments?.some(payment => (owners.get(payment.reference)?.size ?? 0) > 1)).map(job => job.jobId);
}
export async function loadDriverReportJobs(initials: string, from: string, to: string) {
  const db = await getDb();
  const manualOwned = await db.collection("driver_job_summaries").aggregate<{ jobId: string }>([
    { $match: { driverInitials: initials } }, { $lookup: { from: "jobs", localField: "jobId", foreignField: "jobId", as: "__job" } },
    { $unwind: "$__job" }, { $set: { __date: { $ifNull: [{ $cond: [{ $eq: ["$__job.actualStartSource", "completion-fallback"] }, null, date("$__job.actualStart")] }, date("$__job.bookedStart")] } } },
    { $match: { "__job.status": "COMPLETED", __date: { $gte: new Date(from), $lt: new Date(to) } } }, { $limit: CAP + 1 }, { $project: { jobId: 1 } }
  ]).toArray();
  if (manualOwned.length > CAP) throw new ReportCapacityError("Too many manual-owned report jobs; narrow the range.");
  const rows = await db.collection("jobs").aggregate<Job & { __manual: DriverJobSummaryDoc[] }>([
    { $match: { status: "COMPLETED", $or: [{ "reportIdentity.initials": initials }, { "timeBilling.driverInitials": initials }, { driverInitials: initials }, { jobId: { $in: manualOwned.map(row => row.jobId) } }] } },
    { $set: { __date: { $ifNull: [{ $cond: [{ $eq: ["$actualStartSource", "completion-fallback"] }, null, date("$actualStart")] }, date("$bookedStart")] } } },
    { $match: { __date: { $gte: new Date(from), $lt: new Date(to) } } },
    { $lookup: { from: "driver_job_summaries", localField: "jobId", foreignField: "jobId", as: "__manual" } },
    { $set: { __driver: { $ifNull: ["$reportIdentity.initials", { $ifNull: ["$timeBilling.driverInitials", { $ifNull: [{ $arrayElemAt: ["$__manual.driverInitials", 0] }, "$driverInitials"] }] }] } } },
    { $match: { __driver: initials } }, { $sort: { __date: 1, jobId: 1 } }, { $limit: CAP + 1 }, { $unset: ["_id", "__date", "__driver"] }
  ]).toArray();
  if (rows.length > CAP) throw new ReportCapacityError("More than 5,000 report jobs; narrow the selected range.");
  return rows.map(({ __manual, ...job }) => ({ job: job as Job, manual: __manual[0] ?? null }));
}
export async function loadReportContextJobs(initials: string, from: string, to: string, imeis: string[] = []): Promise<Job[]> {
  const db = await getDb();
  const rows = await db.collection("jobs").aggregate<Job>([
    { $match: { $or: imeis.length ? [{ gpsliveImei: { $in: imeis } }, { "gpsDeviceHistory.imei": { $in: imeis } }] :
      [{ driverInitials: initials }, { "reportIdentity.initials": initials }, { "timeBilling.driverInitials": initials }, { "gpsDeviceHistory.driverInitials": initials }] } },
    { $set: { __start: { $ifNull: [date("$onMyWayAt"), date("$actualStart")] }, __end: { $ifNull: [date("$actualFinish"), new Date(to)] } } },
    { $match: { __start: { $lt: new Date(to) }, __end: { $gte: new Date(from) } } }, { $limit: CAP + 1 }, { $unset: ["_id", "__start", "__end"] }
  ]).toArray();
  if (rows.length > CAP) throw new ReportCapacityError("Too many contextual jobs; narrow the report range.");
  return rows;
}
export async function loadReportLiabilitySources(jobIds: string[], initials: string, actor: string | null, from: string, to: string) {
  const db = await getDb();
  const own = [{ "driverSnapshot.initials": initials }, ...(actor ? [{ driver: actor }] : [])];
  const rows = await db.collection<ScenarioSubmissionDoc>("scenario_submissions").aggregate<ScenarioSubmissionDoc>([
    { $match: { scenario: { $in: ["parking", "liability"] }, $or: [{ jobId: { $in: jobIds } }, ...own] } },
    { $set: { __date: { $ifNull: [date("$liabilityFinancial.incidentAt"), date("$submittedAt")] } } },
    { $match: { __date: { $gte: new Date(from), $lt: new Date(to) } } }, { $sort: { __date: 1, _id: 1 } }, { $limit: CAP + 1 }, { $unset: "__date" }
  ]).toArray();
  if (rows.length > CAP) throw new ReportCapacityError("Too many liability sources; narrow the report range.");
  const audits = await db.collection<{ record: LiabilityRecord }>("job_liabilities").find({ $and: [
    { $or: [{ "record.jobId": { $in: jobIds } }, { "record.driver.initials": initials }, ...(actor ? [{ "record.driver.actor": actor }] : [])] },
    { "record.date": { $gte: from, $lt: to } }
  ] }).limit(CAP + 1).toArray();
  if (audits.length > CAP) throw new ReportCapacityError("Too many liability audit rows; narrow the report range.");
  const sourceIds = audits.flatMap(({ record }) => record.sourceRef.startsWith("scenario:") ? [record.sourceRef.slice(9)] : []);
  const extraSources = sourceIds.length ? await db.collection<ScenarioSubmissionDoc>("scenario_submissions").find({ _id: { $in: sourceIds.flatMap(id => ObjectId.isValid(id) ? [new ObjectId(id), id] : [id]) } }).limit(CAP + 1).toArray() : [];
  const combined = [...new Map([...rows, ...extraSources].map(row => [String(row._id || JSON.stringify([row.jobId, row.submittedAt, row.driver])), row])).values()];
  if (combined.length > CAP) throw new ReportCapacityError("Too many liability source/context rows; narrow the report range.");
  const ids = [...new Set([...combined.map(row => row.jobId), ...audits.map(row => row.record.jobId)])];
  const jobs = await db.collection("jobs").find({ jobId: { $in: ids } }).limit(CAP + 1).toArray();
  return { sources: combined, jobs: jobs as unknown as Job[], audits: audits.map(row => row.record) };
}
