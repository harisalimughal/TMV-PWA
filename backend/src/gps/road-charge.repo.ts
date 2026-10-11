import { getDb } from "../db/mongo";
import { gpsId } from "./gps.parse";
import type { RoadObligation, RoadFlag } from "./road-charge.rules";

interface AllocationLedger {
  _id: string;
  revision: number;
  rows: RoadObligation[];
  updatedAt: string;
}
const ledger = async () => (await getDb()).collection<AllocationLedger>("road_charge_allocations");
const scopeId = (row: RoadObligation) => row.type === "congestion" ? gpsId(["customer-congestion", row.jobId]) : gpsId(["customer-crossings", row.imei, row.scheme, row.londonDate]);

export async function ensureRoadChargeIndexes(): Promise<void> {
  const col = await ledger();
  await col.createIndex({ "rows.jobId": 1 });
  await col.createIndex({ "rows.imei": 1, "rows.londonDate": 1 });
}

export function mergeRoadAllocation(rows: RoadObligation[], incoming: RoadObligation): { rows: RoadObligation[]; conflict: RoadFlag | null } {
  const existing = rows.find(row => row.id === incoming.id || (row.type === "congestion" && incoming.type === "congestion" && row.jobId === incoming.jobId) || (row.type === "tunnel" && row.imei === incoming.imei && row.scheme === incoming.scheme &&
    Date.parse(row.proofFrom) < Date.parse(incoming.proofTo) && Date.parse(row.proofTo) > Date.parse(incoming.proofFrom)));
  if (!existing) return { rows: [...rows, incoming], conflict: null };
  if (existing.jobId !== incoming.jobId) return { rows, conflict: { code: "Duplicate allocation", type: incoming.type, source: "allocation",
    reason: `Physical activity is already owned by job ${existing.jobId}; no second customer allocation was created.`, evidenceIds: incoming.visitIds } };
  if (existing.expectedPence !== incoming.expectedPence) return { rows, conflict: { code: "Needs verification", type: incoming.type, source: "allocation",
    reason: "Saved allocation amount is immutable and differs from the current calculation; no historical repricing was performed.", evidenceIds: incoming.visitIds } };
  return { rows: rows.map(row => row === existing ? { ...row, visitIds: [...new Set([...row.visitIds, ...incoming.visitIds])] } : row), conflict: null };
}

/** Optimistic CAS on one vehicle/scheme/date document serializes overlapping proof
 * allocation across processes without requiring MongoDB replica-set transactions. */
export async function reserveRoadObligation(incoming: RoadObligation): Promise<RoadFlag | null> {
  const col = await ledger();
  const id = scopeId(incoming);
  for (let attempt = 0; attempt < 12; attempt++) {
    const previous = await col.findOne({ _id: id });
    const merged = mergeRoadAllocation(previous?.rows ?? [], incoming);
    if (merged.conflict) return merged.conflict;
    if (merged.rows.length > 2000) throw new RangeError("Road allocation ledger capacity reached; administrative verification is required.");
    const next = { _id: id, revision: (previous?.revision ?? 0) + 1, rows: merged.rows, updatedAt: new Date().toISOString() };
    try {
      const result = await col.replaceOne(previous ? { _id: id, revision: previous.revision } : { _id: id, revision: { $exists: false } }, next, { upsert: !previous });
      if (result.modifiedCount || result.upsertedCount) return null;
    } catch (error) { if ((error as { code?: number }).code !== 11000) throw error; }
  }
  throw new Error("Concurrent road allocation could not be resolved; retry without counting new charges.");
}

export async function roadAllocationConflict(row: RoadObligation): Promise<RoadFlag | null> {
  return mergeRoadAllocation((await (await ledger()).findOne({ _id: scopeId(row) }))?.rows ?? [], row).conflict;
}

export async function readRoadAllocations(jobId: string): Promise<RoadObligation[]> {
  return (await (await ledger()).find({ "rows.jobId": jobId }).toArray()).flatMap(doc => doc.rows.filter(row => row.jobId === jobId));
}

export async function saveAuthorityReferences(rows: RoadObligation[]): Promise<void> {
  if (!rows.length) return;
  const col = (await getDb()).collection<{ _id: string; jobIds: string[]; expectedPence: null }>("road_authority_obligations");
  for (const row of rows) {
    const canonical = row.type === "tunnel" ? (await (await ledger()).findOne({ _id: scopeId(row) }))?.rows.find(saved => saved.jobId === row.jobId &&
      (saved.id === row.id || (Date.parse(saved.proofFrom) < Date.parse(row.proofTo) && Date.parse(saved.proofTo) > Date.parse(row.proofFrom)))) : null;
    await col.updateOne({ _id: canonical?.authorityKey ?? row.authorityKey }, { $setOnInsert: {
    imei: row.imei, scheme: row.scheme, londonDate: row.londonDate, expectedPence: null, issue: row.authorityIssue
  }, $addToSet: { jobIds: row.jobId } }, { upsert: true });
  }
}
