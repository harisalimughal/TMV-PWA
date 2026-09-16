/**
 * Every admin dashboard route (jobs, summary, finance, exceptions, drivers-summary)
 * independently called readMongoDataset() + normalizeMongoDataset() on every request --
 * five unfiltered full-collection reads (jobs/evidence/activity/scenarioSubmissions/
 * exceptions) plus a full NormalizedJob rebuild, repeated from scratch every time any
 * tab loaded or refetched. Since every one of those pages also defaults its date range
 * to "all time" (see e.g. OverviewPage's `from`/`to` starting undefined), pushing the
 * filtering down into the Mongo query wouldn't help the common case either -- the
 * read+normalize itself needs to happen at most once per short window, shared across
 * every tab, with each route just filtering the already-built in-memory array.
 *
 * TTL is long enough to absorb a full session of tab-switching on this backend without
 * re-paying the read (see read.ts's own comment: this now runs the 5 reads
 * sequentially, since concurrency -- not any one query -- was what a constrained
 * backend couldn't absorb, which makes a cache MISS relatively more expensive and a
 * cache HIT proportionally more valuable). 45s means a driver's photo upload or status
 * change can take up to that long to show up on the dashboard -- an acceptable
 * trade-off for an ops dashboard, not a live status feed.
 */
import { readMongoDataset, MongoDataset } from "./read";
import { normalizeMongoDataset } from "./normalize";
import { NormalizedJob } from "./types";

export interface DashboardDataset {
  dataset: MongoDataset;
  jobs: NormalizedJob[];
}

const TTL_MS = 45_000;

let cached: { at: number; value: DashboardDataset } | null = null;
// Collapses concurrent cache-miss requests (e.g. several dashboard widgets fetching at
// once on first load) into a single in-flight read instead of each kicking off its own.
let pending: Promise<DashboardDataset> | null = null;

export async function getDashboardDataset(): Promise<DashboardDataset> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.value;
  if (pending) return pending;

  pending = (async () => {
    const dataset = await readMongoDataset();
    const jobs = await normalizeMongoDataset(dataset);
    const value: DashboardDataset = { dataset, jobs };
    cached = { at: Date.now(), value };
    return value;
  })();

  try {
    return await pending;
  } finally {
    pending = null;
  }
}

/** Call after any admin-dashboard write that changes job/evidence/activity data
 *  (reassign, manager review, manual job creation) so the very next dashboard read
 *  reflects it immediately instead of waiting out the TTL. */
export function invalidateDashboardDataset(): void {
  cached = null;
}
