/**
 * Adapted from TMV-Chat-bot's dashboard/server/read/mongo-reader.ts. Unlike the
 * source (which opened its own copies of the Mongo collections directly, since that
 * project's `jobs`/`evidence`/etc. types were standalone duplicates of tmv-pwa's), this
 * reuses tmv-pwa's own repo functions -- there's no "our copy vs their copy" split
 * here, this dashboard IS the app that owns this data.
 */
import { listJobs } from "../../db/jobs.repo";
import { listAllEvidence } from "../../db/evidence.repo";
import { listAllActivity } from "../../db/activity.repo";
import { listAllScenarioSubmissions, ScenarioSubmissionDoc } from "../../db/scenario.repo";
import { listExceptions, ExceptionDoc } from "../../db/exceptions.repo";
import { ActivityDoc } from "../../db/mongo";
import { Job, EvidenceRecord } from "../../jobs/job.types";
import { log } from "../../utils/logger";

export interface MongoDataset {
  jobs: Job[];
  evidence: EvidenceRecord[];
  activity: ActivityDoc[];
  scenarioSubmissions: ScenarioSubmissionDoc[];
  exceptions: ExceptionDoc[];
  fetchedAt: string;
  durationMs: number;
}

const LATENCY_BUDGET_MS = 1000;

export async function readMongoDataset(): Promise<MongoDataset> {
  const started = Date.now();

  const [jobs, evidence, activity, scenarioSubmissions, exceptions] = await Promise.all([
    listJobs(),
    listAllEvidence(),
    listAllActivity(),
    listAllScenarioSubmissions(),
    listExceptions()
  ]);

  const durationMs = Date.now() - started;
  if (durationMs > LATENCY_BUDGET_MS) {
    log.warn("dashboard mongo read exceeded latency budget", { duration_ms: durationMs, budget_ms: LATENCY_BUDGET_MS });
  }

  return { jobs, evidence, activity, scenarioSubmissions, exceptions, fetchedAt: new Date().toISOString(), durationMs };
}
