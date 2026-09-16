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
async function timedRead<T extends { length: number }>(name: string, fn: () => Promise<T>): Promise<T> {
  const started = Date.now();
  const result = await fn();
  const duration_ms = Date.now() - started;
  if (duration_ms > 500) {
    // doc_count added to test a new theory: two independent readMongoDataset() calls,
    // minutes apart, landed within 10-30ms of each other on every one of the 5
    // collections (e.g. jobs 9412ms then 9421ms, exceptions 9981ms then 10007ms) --
    // reverting sequential-vs-parallel changed nothing about that, which rules out
    // both connection-pool state and cross-collection contention. That level of
    // repeat-precision looks like a fixed payload size hitting a bandwidth cap, not
    // organic query variance -- doc_count here checks whether it's document COUNT
    // (e.g. a stuck writer flooding a collection) rather than per-document size.
    log.warn("dashboard mongo collection read was slow", { collection: name, duration_ms, doc_count: result.length });
  }
  return result;
}

export async function readMongoDataset(): Promise<MongoDataset> {
  const started = Date.now();

  // Promise.all, not sequential -- reverted. Sequential was tried and measured live:
  // one readMongoDataset() call hit 22.8s total, because jobs (9.4s) and exceptions
  // (10s) are slow *independently* of each other, not from contending for a shared
  // resource -- running them one at a time just sums those delays instead of
  // overlapping them. Parallel at least caps the damage near the slowest single read.
  const [jobs, evidence, activity, scenarioSubmissions, exceptions] = await Promise.all([
    timedRead("jobs", listJobs),
    timedRead("evidence", listAllEvidence),
    timedRead("activity", listAllActivity),
    timedRead("scenarioSubmissions", listAllScenarioSubmissions),
    timedRead("exceptions", listExceptions)
  ]);

  const durationMs = Date.now() - started;
  if (durationMs > LATENCY_BUDGET_MS) {
    log.warn("dashboard mongo read exceeded latency budget", { duration_ms: durationMs, budget_ms: LATENCY_BUDGET_MS });
  }

  return { jobs, evidence, activity, scenarioSubmissions, exceptions, fetchedAt: new Date().toISOString(), durationMs };
}
