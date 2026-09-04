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
