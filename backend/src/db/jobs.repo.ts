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

/**
 * `filter.driverInitials`, when given, is pushed down into the Mongo query itself
 * (using the {driverInitials, status} index from ensureIndexes) instead of pulling
 * every job in the company -- every driver, every status, the collection's entire
 * history -- over the wire just to filter it back down to one driver's own jobs in
 * JS. Every driver-facing screen wants exactly that scoped set; only admin/sync call
 * sites, which genuinely need the whole collection, call this with no filter.
 */
export async function listJobs(filter?: { driverInitials?: string }): Promise<Job[]> {
  const col = await jobsCollection();
  const query = filter?.driverInitials ? { driverInitials: filter.driverInitials } : {};
  const docs = await col.find(query).toArray();
  return docs.map(({ _id, ...job }: any) => job as Job);
}
