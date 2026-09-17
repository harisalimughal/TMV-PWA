import { vanRecordsCollection } from "./mongo";

export type VanRecordType = "MILEAGE" | "FUEL" | "SERVICE";

export interface VanRecordDoc {
  _id?: string;
  /** Docs written before this field existed are all mileage submissions -- see
   *  listVanRecords(), which defaults a missing type to "MILEAGE" on read rather than
   *  requiring a migration. */
  type: VanRecordType;
  driverEmail: string;
  driverName: string;
  driverInitials: string;
  vanRegistration: string;
  mileage?: number | null;
  odometerReading?: number | null;
  fuelCost?: number | null;
  serviceMileage?: number | null;
  serviceType?: string;
  serviceDate?: string;
  photoUrl: string;
  submittedAt: string;
}

export async function insertVanRecord(doc: VanRecordDoc): Promise<VanRecordDoc> {
  const col = await vanRecordsCollection();
  const result = await col.insertOne({ ...doc, _id: doc._id ?? `VAN-${Date.now().toString(36).toUpperCase()}` });
  return { ...doc, _id: String(result.insertedId) };
}

export async function listVanRecords(): Promise<VanRecordDoc[]> {
  const col = await vanRecordsCollection();
  const docs = await col.find({}).sort({ submittedAt: 1 }).toArray();
  return docs.map(doc => ({ ...doc, type: doc.type ?? "MILEAGE" }));
}

export async function getVanRecord(id: string): Promise<VanRecordDoc | null> {
  const col = await vanRecordsCollection();
  const doc = await col.findOne({ _id: id } as any);
  return doc ? { ...doc, type: doc.type ?? "MILEAGE" } : null;
}

export async function deleteVanRecord(id: string): Promise<void> {
  const col = await vanRecordsCollection();
  await col.deleteOne({ _id: id } as any);
}

/** Used by the admin Factory Reset action (maintenance.routes.ts) -- deletes every
 *  Mileage/Fuel/Service record. Each record's Cloudinary photo must be destroyed by
 *  the caller first (via listVanRecords's photoUrl), same as the single-record delete
 *  route (van.routes.ts's DELETE /records/:id) already does per-record. */
export async function deleteAllVanRecords(): Promise<number> {
  const col = await vanRecordsCollection();
  const result = await col.deleteMany({});
  return result.deletedCount ?? 0;
}
