import { vanComplianceCollection } from "./mongo";

export interface VanComplianceDoc {
  _id?: string;
  vanRegistration: string;
  roadTaxRenewalDate?: string;
  motExpiryDate?: string;
  insuranceExpiryDate?: string;
  notes?: string;
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
    updatedAt
  };
  const col = await vanComplianceCollection();
  await col.updateOne({ vanRegistration: normalized }, { $set: doc }, { upsert: true });
  return (await col.findOne({ vanRegistration: normalized })) ?? doc;
}
