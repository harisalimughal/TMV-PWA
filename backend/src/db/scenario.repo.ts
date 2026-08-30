import { getDb } from "./mongo";
import { ScenarioKey } from "../workflow/scenario.spec";

export interface ScenarioSubmissionDoc {
  jobId: string;
  scenario: ScenarioKey;
  driver: string;
  fields: Record<string, string>;
  photoUrls: string[];
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

/** Every scenario submission across every job -- backs the admin dashboard's
 * Check In/Check Out/Parking Liability/Liability Report pages and the cross-job join
 * in the normalize layer. */
export async function listAllScenarioSubmissions(): Promise<ScenarioSubmissionDoc[]> {
  const col = await scenarioSubmissions();
  return col.find({}).sort({ submittedAt: -1 }).toArray();
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
