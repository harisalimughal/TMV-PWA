import { vanMileageCollection } from "./mongo";

export interface VanMileageRecordDoc {
  _id?: string;
  driverEmail: string;
  driverName: string;
  driverInitials: string;
  vanRegistration: string;
  mileage?: number | null;
  photoUrl: string;
  submittedAt: string;
}

export async function insertVanMileageRecord(doc: VanMileageRecordDoc): Promise<VanMileageRecordDoc> {
  const col = await vanMileageCollection();
  const result = await col.insertOne({ ...doc, _id: doc._id ?? `VAN-${Date.now().toString(36).toUpperCase()}` });
  return { ...doc, _id: String(result.insertedId) };
}

export async function listVanMileageRecords(): Promise<VanMileageRecordDoc[]> {
  const col = await vanMileageCollection();
  return col.find({}).sort({ submittedAt: -1 }).toArray();
}
