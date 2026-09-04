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
  fuelCost?: number | null;
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
  const docs = await col.find({}).sort({ submittedAt: -1 }).toArray();
  return docs.map(doc => ({ ...doc, type: doc.type ?? "MILEAGE" }));
}
