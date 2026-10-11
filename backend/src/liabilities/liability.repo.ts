import { getDb } from "../db/mongo";
import { approvedStatusExtension, type LiabilityRecord } from "./liability.model";
interface LiabilityDocument { _id: string; record: LiabilityRecord; createdAt: string }
const collection = async () => (await getDb()).collection<LiabilityDocument>("job_liabilities");

export async function ensureLiabilityIndexes(): Promise<void> {
  const col = await collection();
  await col.createIndex({ "record.sourceRef": 1 }, { unique: true });
  await col.createIndex({ "record.financialSource.reference": 1 }, { unique: true, partialFilterExpression: { "record.financialSource.reference": { $type: "string" } } });
  await col.createIndex({ "record.jobId": 1, "record.date": 1 });
  await col.createIndex({ "record.driver.initials": 1, "record.date": 1 });
  await col.createIndex({ "record.driver.actor": 1, "record.date": 1 });
  await (await getDb()).collection("scenario_submissions").createIndex({ jobId: 1, scenario: 1, submittedAt: 1 });
}

/** Import-only audit snapshot: changes never overwrite an accepted source silently. */
export async function persistLiability(record: LiabilityRecord): Promise<"inserted-or-identical" | "updated-approved-status" | "source-conflict"> {
  const col = await collection();
  try {
    await col.updateOne({ _id: record.id }, { $setOnInsert: { record, createdAt: new Date().toISOString() } }, { upsert: true });
  } catch (error) { if ((error as { code?: number }).code !== 11000) throw error; }
  for (let attempt = 0; attempt < 8; attempt++) {
    const saved = await col.findOne({ _id: record.id });
    if (!saved) throw new Error("Liability persistence could not be confirmed; source/financial identity may already be allocated elsewhere.");
    if (saved.record.sourceHash === record.sourceHash) return "inserted-or-identical";
    if (!approvedStatusExtension(saved.record, record)) return "source-conflict";
    const updated = await col.updateOne({ _id: record.id, "record.sourceHash": saved.record.sourceHash }, { $set: { record } });
    if (updated.modifiedCount) return "updated-approved-status";
  }
  throw new Error("Liability status reconciliation remained concurrent; retry without counting another liability.");
}

export async function readJobLiabilities(jobId: string) {
  const rows = await (await collection()).find({ "record.jobId": jobId }).sort({ "record.date": 1, _id: 1 }).limit(2001).toArray();
  return { items: rows.slice(0, 2000).map(row => row.record), truncated: rows.length > 2000 };
}
