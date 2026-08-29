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

/** Surfaced on the admin dashboard's Exceptions page (dashboard/server/routes/
 * exceptions.route.ts in TMV-Chat-bot, reading this same collection) -- this used to
 * just be logged (log.error), which meant a started job that vanished from Calendar
 * was invisible to ops until someone happened to grep the container logs. */
export async function recordException(doc: ExceptionDoc): Promise<void> {
  const col = await exceptionsCollection();
  await col.insertOne(doc);
}
