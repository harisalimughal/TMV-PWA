import { request } from "../lib/http";

export interface VanMileageRecord {
  _id: string;
  driverEmail: string;
  driverName: string;
  driverInitials: string;
  vanRegistration: string;
  mileage?: number;
  photoUrl: string;
  submittedAt: string;
}

export async function submitVanMileage(
  mileage: string,
  photo: File,
  onProgress?: (fraction: number) => void
): Promise<VanMileageRecord> {
  const form = new FormData();
  if (mileage.trim()) form.append("mileage", mileage.trim());
  form.append("photo", photo);
  const data = await request<{ record: VanMileageRecord }>("/api/van/mileage", {
    method: "POST",
    body: form,
    onUploadProgress: onProgress
  });
  return data.record;
}
