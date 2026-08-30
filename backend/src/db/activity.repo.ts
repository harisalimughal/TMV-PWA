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
