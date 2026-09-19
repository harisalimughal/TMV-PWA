import { jobsCollection } from "./mongo";
import { Job } from "../jobs/job.types";

/** Replaces google/sheets.ts's upsertJob/getJob/listJobs. Same signatures deliberately,
 * so jobs.service.ts/booking.service.ts/workflow.engine.ts port by swapping the import
 * source, not by rewriting call sites. No read cache/TTL here (unlike the Sheets
 * version) -- Mongo reads are already fast and consistent, the TTL machinery existed
 * specifically to work around Sheets' API cost/latency, which doesn't apply here. */

export async function upsertJob(job: Job): Promise<void> {
  const col = await jobsCollection();
  await col.replaceOne({ _id: job.jobId } as any, { _id: job.jobId, ...job } as any, { upsert: true });
}

export async function getJob(jobId: string): Promise<Job | null> {
  const col = await jobsCollection();
  const doc = await col.findOne({ _id: jobId } as any);
  if (!doc) return null;
  const { _id, ...job } = doc as any;
  return job as Job;
}

/** Only safe to call after the linked Calendar event is already gone (see
 *  admin/dashboard/jobs.routes.ts's DELETE /:jobId) -- deleting the Mongo doc alone
 *  would just have the next background sync recreate it from the still-live Calendar
 *  event, the same resurrection bug Reassign had before it was fixed to write back to
 *  Calendar first. Evidence/activity/exceptions rows for this jobId are left in place
 *  (same conservative-deletion approach as deleting a driver: history isn't orphaned
 *  or corrupted, just no longer reachable through a job that no longer exists). */
export async function deleteJob(jobId: string): Promise<boolean> {
  const col = await jobsCollection();
  const result = await col.deleteOne({ _id: jobId } as any);
  return result.deletedCount > 0;
}

/**
 * `filter.driverInitials`, when given, is pushed down into the Mongo query itself
 * (using the {driverInitials, status} index from ensureIndexes) instead of pulling
 * every job in the company -- every driver, every status, the collection's entire
 * history -- over the wire just to filter it back down to one driver's own jobs in
 * JS. Every driver-facing screen wants exactly that scoped set; only admin/sync call
 * sites, which genuinely need the whole collection, call this with no filter.
 */
export async function listJobs(filter?: { driverInitials?: string; gpsliveImei?: string }): Promise<Job[]> {
  const col = await jobsCollection();
  const query: Record<string, string> = {};
  if (filter?.driverInitials) query.driverInitials = filter.driverInitials;
  if (filter?.gpsliveImei) query.gpsliveImei = filter.gpsliveImei;
  const docs = await col.find(query).toArray();
  return docs.map(({ _id, ...job }: any) => job as Job);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Shared by listJobsPage and listJobsInRange: a job matches `from`/`to` by
 *  actualStart when it's genuinely started, falling back to bookedStart otherwise --
 *  the same semantics the old in-memory `(j.actualStart || j.bookedStart)` filter used
 *  on summary/finance/drivers-summary, kept identical so scoping the query doesn't
 *  change any of their numbers. */
function effectiveStartStage(): Record<string, any> {
  return {
    $addFields: {
      __effectiveStart: {
        $cond: [{ $and: [{ $ne: ["$actualStart", ""] }, { $ne: ["$actualStart", null] }] }, "$actualStart", "$bookedStart"]
      }
    }
  };
}

/** Raw Job fields safe to sort on directly at the Mongo level -- anything else (e.g.
 *  delayMinutes, which only exists after normalize.ts computes it from bookedStart vs
 *  actualStart) falls back to bookedStart. */
const SORTABLE_FIELDS = new Set(["bookedStart", "status", "customerName", "driverInitials", "amountCharged", "createdAt", "updatedAt"]);

export interface JobsPageFilter {
  from?: string;
  to?: string;
  status?: string;
  driverInitials?: string;
  /** Free-text search across the usual job fields, already escaped for regex use by
   *  the caller isn't required -- this function escapes it. */
  q?: string;
  /** Driver initials whose full name matched `q` -- resolved by the caller (jobs.routes.ts
   *  has the driver roster already) since this repo function has no reason to know
   *  about driver_accounts. Folded into the same $or as the rest of the text search. */
  qMatchedInitials?: string[];
  sort?: string;
  dir?: "asc" | "desc";
  page: number;
  pageSize: number;
}

/**
 * Server-side filtered, sorted, paginated job list -- the fast path for the admin
 * Jobs Archive. Existed only as an in-memory full-collection fetch before (jobs.routes.ts
 * pulled the whole company's job history through the shared dashboard dataset cache on
 * every request, evidence/activity/etc included, just to slice out one page of 25-500
 * rows). Measured live against production: fetching all ~380 jobs took ~9.3s; a plain
 * find().limit(25) on the same connection took under 1s -- the cost is proportional to
 * how many documents actually come back, not a fixed per-query tax, so limiting the
 * query itself (not just the response) is what actually fixes it.
 */
export async function listJobsPage(filter: JobsPageFilter): Promise<{ items: Job[]; total: number }> {
  const col = await jobsCollection();

  const match: Record<string, any> = {};
  if (filter.status) match.status = filter.status;
  if (filter.driverInitials) match.driverInitials = filter.driverInitials;

  const pipeline: any[] = [];
  if (filter.from || filter.to) {
    // Mirrors the old in-memory filter's semantics: prefer actualStart (when the job
    // has genuinely started) over bookedStart, so a job that ran late/early is filtered
    // by when it actually happened, not just when it was booked.
    pipeline.push(effectiveStartStage());
    const range: Record<string, string> = {};
    if (filter.from) range.$gte = filter.from;
    if (filter.to) range.$lte = filter.to;
    match.__effectiveStart = range;
  }

  if (filter.q?.trim()) {
    const regex = { $regex: escapeRegex(filter.q.trim()), $options: "i" };
    const orClauses: Record<string, any>[] = [
      { jobId: regex }, { customerName: regex }, { customerPhone: regex },
      { customerEmail: regex }, { pickup: regex }, { dropoff: regex }, { driverInitials: regex }
    ];
    if (filter.qMatchedInitials?.length) orClauses.push({ driverInitials: { $in: filter.qMatchedInitials } });
    match.$or = orClauses;
  }

  pipeline.push({ $match: match });

  const sortField = filter.sort && SORTABLE_FIELDS.has(filter.sort) ? filter.sort : "bookedStart";
  const sortDir = filter.dir === "asc" ? 1 : -1;
  pipeline.push({ $sort: { [sortField]: sortDir } });

  const countPipeline = [...pipeline, { $count: "total" }];
  pipeline.push({ $skip: (filter.page - 1) * filter.pageSize }, { $limit: filter.pageSize }, { $project: { _id: 0 } });

  const [items, countResult] = await Promise.all([
    col.aggregate<Job>(pipeline).toArray(),
    col.aggregate<{ total: number }>(countPipeline).toArray()
  ]);

  return { items, total: countResult[0]?.total ?? 0 };
}

/**
 * Every job whose effective start falls in [from, to] -- no pagination, since the
 * dashboard's aggregate report pages (summary/finance/drivers-summary) need to roll up
 * every matching job, not one page of them. Exists so those pages can scope their read
 * to the selected date range instead of pulling the whole company's job history through
 * getDashboardDataset() just to filter it back down in JS -- the same fix listJobsPage
 * already proved out for the Jobs Archive (measured live: cost is proportional to how
 * many documents actually come back over the wire, not a fixed per-query tax). Returns
 * every job when both are omitted, same as plain listJobs().
 */
export async function listJobsInRange(from?: string, to?: string): Promise<Job[]> {
  if (!from && !to) return listJobs();
  const col = await jobsCollection();
  const range: Record<string, string> = {};
  if (from) range.$gte = from;
  if (to) range.$lte = to;
  const pipeline = [effectiveStartStage(), { $match: { __effectiveStart: range } }, { $project: { _id: 0 } }];
  return col.aggregate<Job>(pipeline).toArray();
}
