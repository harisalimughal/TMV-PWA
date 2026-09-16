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

/** TEMPORARY: times each of the 5 parallel reads individually so a slow
 *  readMongoDataset() pass says which collection actually caused it, instead of just
 *  the aggregate duration -- the connection-pool/heartbeat diagnostics in db/mongo.ts
 *  ruled out a dropped/re-established connection as the cause (none fired alongside
 *  three separate live ~10.1-10.4s stalls), so the delay is inside query execution
 *  itself, not connection setup. Remove once root-caused. */
async function timedRead<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const started = Date.now();
  const result = await fn();
  const duration_ms = Date.now() - started;
  if (duration_ms > 500) log.warn("dashboard mongo collection read was slow", { collection: name, duration_ms });
  return result;
}

export async function readMongoDataset(): Promise<MongoDataset> {
  const started = Date.now();

  // Sequential, not Promise.all. Live per-collection timing (see timedRead) showed the
  // same staircase twice: durations climbing the more of these 5 reads were in flight
  // at once, with whichever one landed last taking 10-14s regardless of which
  // collection it was (the smallest collection, exceptions, was consistently the
  // slowest) -- and neither a warmer connection pool (minPoolSize) nor more libuv
  // threads (UV_THREADPOOL_SIZE) changed that at all. That points at the concurrency
  // itself, not any one query, being what this backend can't absorb. Running one at a
  // time trades a small increase in the typical-case total for eliminating the
  // unpredictable double-digit-second spikes.
  const jobs = await timedRead("jobs", listJobs);
  const evidence = await timedRead("evidence", listAllEvidence);
  const activity = await timedRead("activity", listAllActivity);
  const scenarioSubmissions = await timedRead("scenarioSubmissions", listAllScenarioSubmissions);
  const exceptions = await timedRead("exceptions", listExceptions);

  const durationMs = Date.now() - started;
  if (durationMs > LATENCY_BUDGET_MS) {
    log.warn("dashboard mongo read exceeded latency budget", { duration_ms: durationMs, budget_ms: LATENCY_BUDGET_MS });
  }

  return { jobs, evidence, activity, scenarioSubmissions, exceptions, fetchedAt: new Date().toISOString(), durationMs };
}
