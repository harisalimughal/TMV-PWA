import { request, postJson, isOffline, type ApiError } from "../lib/http";
import { enqueue } from "../lib/outbox";

export type { ApiError };

export interface Job {
  jobId: string;
  calendarEventId: string;
  driverInitials: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  pickup: string;
  dropoff: string;
  crewSize: number;
  basePrice: number;
  paidOnline: boolean;
  bookedStart: string;
  bookedFinish: string;
  actualStart: string;
  actualFinish: string;
  bookedMinutes: number;
  actualMinutes: number;
  differenceMinutes: number;
  delayStatus: string;
  extraCharges: string[];
  overtimeMinutes: number;
  overtimeCharge: number;
  totalCharges: number;
  paymentMethod: string;
  paymentStatus: string;
  clientNamePostcode: string;
  clientConfirmedBy: string;
  signatureUrl: string;
  status: "READY" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  currentState: string;
  createdAt: string;
  updatedAt: string;
}

export interface ActivityEntry {
  jobId: string;
  driver: string;
  action: string;
  fromState?: string;
  toState?: string;
  detail?: string;
  timestamp: string;
}

export interface EvidenceSummary {
  completed: Record<string, number>;
  pending: Record<string, number>;
  failed: Record<string, number>;
  hasSignature: boolean;
}

export interface JobUpdateResult {
  job: Job;
  suggestedTotal?: number;
}

/** The "Your jobs" listing -- every one of the driver's jobs, bucketed into
 *  Today / Past / Next by calendar day in Europe/London. */
export function fetchJobsList(): Promise<{
  driver: { fullName: string; initials: string };
  today: Job[];
  past: Job[];
  next: Job[];
}> {
  return request("/api/jobs/list");
}

export function fetchJobDetail(jobId: string): Promise<{
  job: Job;
  activity: ActivityEntry[];
  evidence: EvidenceSummary;
  suggestedTotal: number;
  confirmationText: string;
}> {
  return request(`/api/jobs/${encodeURIComponent(jobId)}`);
}

export function startJob(jobId: string): Promise<JobUpdateResult> {
  return request(`/api/jobs/${encodeURIComponent(jobId)}/start`, { method: "POST" });
}

export function uploadEvidencePhotos(
  jobId: string,
  files: File[],
  onProgress?: (fraction: number) => void
): Promise<JobUpdateResult> {
  const form = new FormData();
  files.forEach(file => form.append("photos", file));
  return request(`/api/jobs/${encodeURIComponent(jobId)}/evidence`, {
    method: "POST",
    body: form,
    onUploadProgress: onProgress
  });
}

export function uploadSignature(
  jobId: string,
  customerName: string,
  blob: Blob,
  onProgress?: (fraction: number) => void
): Promise<JobUpdateResult> {
  const form = new FormData();
  form.append("customerName", customerName);
  form.append("signature", blob, "signature.png");
  return request(`/api/jobs/${encodeURIComponent(jobId)}/signature`, {
    method: "POST",
    body: form,
    onUploadProgress: onProgress
  });
}

export function sendAction(
  jobId: string,
  action: string,
  input: Record<string, string[]> = {}
): Promise<JobUpdateResult> {
  return postJson(`/api/jobs/${encodeURIComponent(jobId)}/actions`, { action, input });
}

/* ------------------------------------------------------------ scenario submission -- */

export type ScenarioSubmitResult = "sent" | "queued";

function scenarioUrl(scenario: string, jobId?: string): string {
  // Check In / Check Out are standalone storage-job forms with no jobId to scope
  // under, so they post to /api/storage instead.
  return jobId
    ? `/api/jobs/${encodeURIComponent(jobId)}/scenarios/${encodeURIComponent(scenario)}`
    : `/api/storage/${encodeURIComponent(scenario)}`;
}

/**
 * Submits a scenario form, falling back to the offline outbox.
 *
 * These are the submissions worth queueing: they're terminal (nothing downstream
 * depends on the response) and they're the legal evidence for a damage or parking
 * claim. Losing one because the van was parked in a basement is the single most
 * expensive failure this app can have, and that's exactly what used to happen.
 *
 * Returns "queued" when it went to the outbox so the caller can say so plainly rather
 * than claiming it was sent.
 */
export async function submitScenario(
  scenario: string,
  fields: Record<string, string>,
  photos: File[],
  signature: Blob | null,
  options: { jobId?: string; label: string; onProgress?: (fraction: number) => void } = { label: "Form" }
): Promise<ScenarioSubmitResult> {
  const url = scenarioUrl(scenario, options.jobId);

  if (isOffline()) {
    await enqueue({ url, label: options.label, fields, photos, signature });
    return "queued";
  }

  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  photos.forEach(photo => form.append("photos", photo));
  if (signature) form.append("signature", signature, "signature.png");

  try {
    await request(url, { method: "POST", body: form, onUploadProgress: options.onProgress });
    return "sent";
  } catch (err) {
    const error = err as ApiError;
    // Connection failures get queued and retried. A rejection from the server (a 4xx)
    // does not -- replaying it would fail identically every time, so it surfaces to
    // the driver to fix now, while the customer is still standing there.
    if (error?.offline) {
      await enqueue({ url, label: options.label, fields, photos, signature });
      return "queued";
    }
    throw error;
  }
}
