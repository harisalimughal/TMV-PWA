import { activityCollection } from "./mongo";
import { ActivityDoc } from "./mongo";

export interface ActivityInput {
  jobId: string;
  driver: string;
  action: string;
  fromState?: string;
  toState?: string;
  detail?: string;
}

export async function appendActivity(data: ActivityInput): Promise<void> {
  const col = await activityCollection();
  await col.insertOne({ ...data, timestamp: new Date().toISOString() } as ActivityDoc);
}

export async function listActivityForJob(jobId: string): Promise<ActivityDoc[]> {
  const col = await activityCollection();
  return col.find({ jobId }).sort({ timestamp: 1 }).toArray();
}

/** Every activity row across every job -- backs the admin dashboard's Activity Log
 * page and the cross-job joins in the normalize layer (jobs/finance/exceptions/summary). */
export async function listAllActivity(): Promise<ActivityDoc[]> {
  const col = await activityCollection();
  return col.find({}).sort({ timestamp: -1 }).toArray();
}

/** Scoped version of listAllActivity -- backs jobs.routes.ts's paginated Jobs Archive
 *  (listJobsPage), which only needs activity for the one page of jobs it's returning.
 *  Uses the existing {jobId, timestamp} index. */
export async function listActivityForJobs(jobIds: string[]): Promise<ActivityDoc[]> {
  if (jobIds.length === 0) return [];
  const col = await activityCollection();
  return col.find({ jobId: { $in: jobIds } }).toArray();
}
