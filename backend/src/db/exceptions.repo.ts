import { getDb } from "./mongo";

export interface ExceptionDoc {
  jobId: string;
  type: string;
  detail: string;
  timestamp: string;
}

async function exceptionsCollection() {
  const db = await getDb();
  return db.collection<ExceptionDoc>("exceptions");
}

/** Backs recordException's upsert -- called from server.ts alongside db/mongo.ts's own
 *  ensureIndexes(), kept separate rather than moved there since ExceptionDoc lives in
 *  this module, not mongo.ts. */
export async function ensureExceptionsIndexes(): Promise<void> {
  const col = await exceptionsCollection();
  await col.createIndex({ jobId: 1, type: 1 });
}

/** Surfaced on the admin dashboard's Exceptions page (dashboard/server/routes/
 * exceptions.route.ts in TMV-Chat-bot, reading this same collection) -- this used to
 * just be logged (log.error), which meant a started job that vanished from Calendar
 * was invisible to ops until someone happened to grep the container logs.
 *
 * Upserts on (jobId, type) rather than inserting blindly. The only caller
 * (booking.service.ts's reconcileDisappeared) re-detects the same unresolved problem
 * on every background sync pass -- every ~2 minutes, across an 11-day rolling window --
 * for as long as a job stays started-but-never-completed-or-cancelled. A plain insertOne
 * here wrote a fresh document every single pass: live in production this collection had
 * grown to ~3,900 documents against ~380 jobs total, and was the single biggest
 * contributor to the admin dashboard's read latency (it's fetched in full on every
 * dashboard load). $set (not $setOnInsert) so timestamp/detail reflect the most recent
 * occurrence, which is also more useful -- an ongoing problem surfaces as "still
 * happening as of the latest sync" instead of a stale first-seen timestamp. */
export async function recordException(doc: ExceptionDoc): Promise<void> {
  const col = await exceptionsCollection();
  await col.updateOne({ jobId: doc.jobId, type: doc.type }, { $set: doc }, { upsert: true });
}

/** Read side of the same Exceptions page -- newest first. */
export async function listExceptions(): Promise<ExceptionDoc[]> {
  const col = await exceptionsCollection();
  return col.find({}).sort({ timestamp: -1 }).toArray();
}
