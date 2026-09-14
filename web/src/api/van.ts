import { request } from "../lib/http";

export type VanRecordType = "MILEAGE" | "FUEL" | "SERVICE";

export interface VanRecord {
  _id: string;
  type: VanRecordType;
  driverEmail: string;
  driverName: string;
  driverInitials: string;
  vanRegistration: string;
  mileage?: number;
  odometerReading?: number;
  fuelCost?: number;
  serviceMileage?: number;
  serviceType?: string;
  serviceDate?: string;
  photoUrl: string;
  submittedAt: string;
}

export interface VanCompliance {
  vanRegistration: string;
  roadTaxRenewalDate?: string;
  motExpiryDate?: string;
  insuranceExpiryDate?: string;
  notes?: string;
  updatedAt?: string;
  /** Admin-configured distance between services (e.g. 8000) -- null until an admin
   *  sets one for this van. */
  serviceIntervalMiles?: number | null;
  /** Admin override for the mileage baseline, in place of the driver's most recent
   *  Service log -- almost always null (the normal case is automatic). */
  lastServiceMileageOverride?: number | null;
  /** The mileage baseline the gauge actually counts from -- the override above when
   *  set, otherwise computed server-side from the most recent Service log. */
  lastServiceMileage?: number | null;
  /** Latest known odometer reading for this van, reconciled server-side across
   *  whichever record type -- Mileage, Fuel or Service -- most recently carried one. */
  currentMileage?: number | null;
}

export function fetchVanCompliance(): Promise<VanCompliance | null> {
  return request<{ compliance: VanCompliance | null }>("/api/van/compliance").then(data => data.compliance);
}

export function submitVanMileage(
  mileage: string,
  photo: File,
  onProgress?: (fraction: number) => void
): Promise<VanRecord> {
  const form = new FormData();
  form.append("mileage", mileage.trim());
  form.append("photo", photo);
  return request<{ record: VanRecord }>("/api/van/mileage", {
    method: "POST",
    body: form,
    onUploadProgress: onProgress
  }).then(data => data.record);
}

export function submitVanFuel(
  odometerReading: string,
  fuelCost: string,
  photo: File,
  onProgress?: (fraction: number) => void
): Promise<VanRecord> {
  const form = new FormData();
  form.append("odometerReading", odometerReading.trim());
  form.append("fuelCost", fuelCost.trim());
  form.append("photo", photo);
  return request<{ record: VanRecord }>("/api/van/fuel", {
    method: "POST",
    body: form,
    onUploadProgress: onProgress
  }).then(data => data.record);
}

export function submitVanService(
  serviceMileage: string,
  serviceType: string,
  serviceDate: string,
  photo: File,
  onProgress?: (fraction: number) => void
): Promise<VanRecord> {
  const form = new FormData();
  form.append("serviceMileage", serviceMileage.trim());
  form.append("serviceType", serviceType);
  form.append("serviceDate", serviceDate);
  form.append("photo", photo);
  return request<{ record: VanRecord }>("/api/van/service", {
    method: "POST",
    body: form,
    onUploadProgress: onProgress
  }).then(data => data.record);
}
