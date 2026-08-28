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

export async function listJobs(): Promise<Job[]> {
  const col = await jobsCollection();
  const docs = await col.find({}).toArray();
  return docs.map(({ _id, ...job }: any) => job as Job);
}
