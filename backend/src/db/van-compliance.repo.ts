import { vanComplianceCollection } from "./mongo";

export interface VanComplianceDoc {
  _id?: string;
  vanRegistration: string;
  roadTaxRenewalDate?: string;
  motExpiryDate?: string;
  insuranceExpiryDate?: string;
  notes?: string;
  /** Admin-configured distance between services for this van (e.g. 8000). Miles
   *  remaining is computed live from this against the van's logged Service/Mileage/
   *  Fuel records -- see van-mileage.service.ts -- never stored. */
  serviceIntervalMiles?: number | null;
  /** Admin override for the mileage baseline the "miles remaining" gauge counts from,
   *  in place of the driver's most recent Service log -- for correcting a bad log
   *  entry without needing the driver to resubmit one. Unset (null) means "use the
   *  most recent Service log automatically", which is the normal case. */
  lastServiceMileageOverride?: number | null;
  updatedAt: string;
}

function normalizeVan(vanRegistration: string): string {
  return vanRegistration.trim().toUpperCase();
}

export async function listVanCompliance(): Promise<VanComplianceDoc[]> {
  const col = await vanComplianceCollection();
  return col.find({}).toArray();
}

export async function getVanCompliance(vanRegistration: string): Promise<VanComplianceDoc | null> {
  const normalized = normalizeVan(vanRegistration);
  if (!normalized) return null;
  const col = await vanComplianceCollection();
  return col.findOne({ vanRegistration: normalized });
}

export async function saveVanCompliance(
  vanRegistration: string,
  input: Omit<VanComplianceDoc, "_id" | "vanRegistration" | "updatedAt">
): Promise<VanComplianceDoc> {
  const normalized = normalizeVan(vanRegistration);
  const updatedAt = new Date().toISOString();
  const doc: VanComplianceDoc = {
    vanRegistration: normalized,
    roadTaxRenewalDate: input.roadTaxRenewalDate || "",
    motExpiryDate: input.motExpiryDate || "",
    insuranceExpiryDate: input.insuranceExpiryDate || "",
    notes: input.notes || "",
    serviceIntervalMiles: input.serviceIntervalMiles ?? null,
    lastServiceMileageOverride: input.lastServiceMileageOverride ?? null,
    updatedAt
  };
  const col = await vanComplianceCollection();
  await col.updateOne({ vanRegistration: normalized }, { $set: doc }, { upsert: true });
  return (await col.findOne({ vanRegistration: normalized })) ?? doc;
}
