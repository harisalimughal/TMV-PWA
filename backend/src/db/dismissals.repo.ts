import { dismissalsCollection } from "./mongo";

export type DismissalType = "notification" | "alert";

/** Marks rows hidden from the Notifications/Alerts dashboard tabs -- see
 *  DismissalDoc's own comment in db/mongo.ts for why this exists instead of a real
 *  delete. Upsert so re-dismissing an already-dismissed id is a harmless no-op. */
export async function dismiss(type: DismissalType, refIds: string[]): Promise<void> {
  if (refIds.length === 0) return;
  const col = await dismissalsCollection();
  await col.bulkWrite(
    refIds.map(refId => ({
      updateOne: {
        filter: { type, refId },
        update: { $setOnInsert: { type, refId, dismissedAt: new Date() } },
        upsert: true
      }
    }))
  );
}

export async function listDismissedIds(type: DismissalType): Promise<Set<string>> {
  const col = await dismissalsCollection();
  const docs = await col.find({ type }).project<{ refId: string }>({ refId: 1 }).toArray();
  return new Set(docs.map(d => d.refId));
}
