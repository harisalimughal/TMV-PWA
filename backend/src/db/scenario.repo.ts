import { getDb } from "./mongo";
import { ScenarioKey } from "../workflow/scenario.spec";

export interface ScenarioSubmissionDoc {
  jobId: string;
  scenario: ScenarioKey;
  driver: string;
  fields: Record<string, string>;
  photoUrls: string[];
  /** Parallel to photoUrls, same index — where/when each photo was taken, plus a
   *  reverse-geocoded place name for its location (see integrations/geocode.ts).
   *  Optional: absent on submissions made before this existed; locationName absent
   *  when there was no location, or the lookup failed. */
  photoMeta?: Array<{
    capturedAt?: string;
    location?: { lat: number; lng: number; accuracy: number };
    locationName?: string;
  }>;
  signatureUrl: string;
  submittedAt: string;
}

async function scenarioSubmissions() {
  const db = await getDb();
  return db.collection<ScenarioSubmissionDoc>("scenario_submissions");
}

export async function insertScenarioSubmission(doc: ScenarioSubmissionDoc): Promise<void> {
  const col = await scenarioSubmissions();
  await col.insertOne(doc);
}

export async function listScenarioSubmissionsForJob(jobId: string): Promise<ScenarioSubmissionDoc[]> {
  const col = await scenarioSubmissions();
  return col.find({ jobId }).sort({ submittedAt: 1 }).toArray();
}

/** Used when a job is deleted -- see jobs.routes.ts's DELETE /:jobId, which deletes
 *  each submission's Cloudinary photos/signature first (deleteJobArtifacts) and calls
 *  this after. */
export async function deleteScenarioSubmissionsForJob(jobId: string): Promise<void> {
  const col = await scenarioSubmissions();
  await col.deleteMany({ jobId });
}

/** Every scenario submission across every job -- backs the admin dashboard's
 * Check In/Check Out/Parking Liability/Liability Report pages and the cross-job join
 * in the normalize layer. */
export async function listAllScenarioSubmissions(): Promise<ScenarioSubmissionDoc[]> {
  const col = await scenarioSubmissions();
  return col.find({}).sort({ submittedAt: -1 }).toArray();
}

/** Used by the admin Factory Reset action (maintenance.routes.ts) -- deletes every
 *  submission. Cloudinary photos/signature must be destroyed by the caller first (via
 *  listAllScenarioSubmissions's photoUrls/signatureUrl), same order deleteJobArtifacts
 *  uses for a single job. */
export async function deleteAllScenarioSubmissions(): Promise<number> {
  const col = await scenarioSubmissions();
  const result = await col.deleteMany({});
  return result.deletedCount ?? 0;
}

/** Scoped version of listAllScenarioSubmissions -- backs jobs.routes.ts's paginated
 *  Jobs Archive (listJobsPage), which only needs submissions for the one page of jobs
 *  it's returning. No index on jobId alone yet (the collection has none, and this
 *  scoped query is new), but scenario submission volume is small enough (dozens, not
 *  thousands -- see the doc_count diagnostics from this session) that a scan is cheap. */
export async function listScenarioSubmissionsForJobs(jobIds: string[]): Promise<ScenarioSubmissionDoc[]> {
  if (jobIds.length === 0) return [];
  const col = await scenarioSubmissions();
  return col.find({ jobId: { $in: jobIds } }).toArray();
}

/** One scenario kind's submissions across every job, paginated -- backs
 * scenarios.route.ts's GET /:kind list endpoint. */
export async function listScenarioSubmissionsByKind(
  kind: ScenarioKey, page: number, pageSize: number
): Promise<{ items: ScenarioSubmissionDoc[]; total: number }> {
  const col = await scenarioSubmissions();
  const filter = { scenario: kind };
  const [items, total] = await Promise.all([
    col.find(filter).sort({ submittedAt: -1 }).skip((page - 1) * pageSize).limit(pageSize).toArray(),
    col.countDocuments(filter)
  ]);
  return { items, total };
}
