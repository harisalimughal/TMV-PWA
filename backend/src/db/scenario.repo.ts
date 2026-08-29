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
