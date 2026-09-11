import { request, postJson, isOffline, type ApiError } from "../lib/http";
import { enqueue } from "../lib/outbox";
import type { CapturedLocation, PhotoCaptureMeta } from "../lib/geo";

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
  /** Optional mid-route stop ("stop by" / waypoint) parsed from the Calendar event.
   *  When present it sits between pickup and drop-off on the route and is added as a
   *  waypoint to the Navigate link. NOT YET POPULATED BY THE BACKEND — only the dev
   *  mock sets it today (see src/mocks/fixtures.ts). Safe to read anywhere: absent
   *  or "" means a plain two-stop job. */
  stopBy?: string;
  /** Verbatim Calendar event title this job was synced from, e.g.
   *  "2 Men - £170 - 16:00". Empty on jobs synced before the backend started
   *  storing it, until their next resync. */
  rawTitle?: string;
  /** Verbatim Calendar event description (may contain the rich-text editor's HTML --
   *  see lib/htmlText.ts's htmlToPlainText) this job was synced from. Shown to the
   *  driver as-is alongside the already-parsed fields above, so nothing the office
   *  typed into Calendar is ever hidden just because it doesn't match a known field
   *  label. Empty on jobs synced before the backend started storing it. */
  rawDescription?: string;
  /** Booking-form extras parsed from the Calendar description (see
   *  backend/src/jobs/booking.service.ts). Informational; may be empty on older jobs. */
  floorFrom?: string;
  floorTo?: string;
  vanSize?: string;
  hireDurationText?: string;
  extraRequest?: string;
  inventory?: string;
  extraChargeText?: string;
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
  calculatedTotalCharges?: number;
  totalCharges: number;
  amountCharged?: number;
  totalAdjustmentNote?: string;
  paymentMethod: string;
  paymentStatus: string;
  clientNamePostcode: string;
  clientConfirmedBy: string;
  /** ISO timestamp of when this job's van was first detected inside the London
   *  Congestion Charge zone (GPSLive geofence webhook) -- drives the extra-charges
   *  suggestion banner. Unset if never detected. */
  congestionZoneEnteredAt?: string;
  /** Same as congestionZoneEnteredAt but for a tunnel toll zone (Dartford Crossing /
   *  Tunnels-Black-Silver) -- drives the Extra Charges "Tunnel Charges" suggestion. */
  tunnelZoneEnteredAt?: string;
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

/** One photo already uploaded for a job — shown when the driver steps back to a
 *  photo step, with the option to delete it. */
export interface EvidenceItem {
  evidenceId: string;
  /** "Arrival" | "VanLoaded" | "EmptyVan" | scenario types. */
  evidenceType: string;
  url: string;
  /** Where/when the driver's device recorded this photo being taken — absent for
   *  photos captured before this existed, or where GPS was denied/unavailable. */
  capturedAt?: string;
  location?: CapturedLocation;
  /** A short place name for `location`, reverse-geocoded once server-side at upload
   *  time — absent when there was no location, or the lookup failed/was rate-limited;
   *  show the raw coordinates in that case (see lib/geo.ts's formatLocationLabel). */
  locationName?: string;
}

export interface JobUpdateResult {
  job: Job;
  suggestedTotal?: number;
  /** Present on responses that can change the photo set (evidence upload/delete,
   *  workflow actions incl. GO_BACK). */
  evidenceItems?: EvidenceItem[];
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
  evidenceItems: EvidenceItem[];
  suggestedTotal: number;
  confirmationText: string;
}> {
  return request(`/api/jobs/${encodeURIComponent(jobId)}`);
}

/** Removes one already-uploaded photo. Returns the job's remaining photo set. */
export function deleteEvidence(jobId: string, evidenceId: string): Promise<{ evidenceItems: EvidenceItem[] }> {
  return request(`/api/jobs/${encodeURIComponent(jobId)}/evidence/${encodeURIComponent(evidenceId)}`, {
    method: "DELETE"
  });
}

/**
 * Resolves a place name for a GPS fix, live -- called from PhotoPicker.tsx the moment
 * a photo is captured (or, better, while the camera's still open watching position),
 * so the caption can show a real place instead of raw coordinates without waiting for
 * that photo's own upload to complete. Same server-side lookup the upload path itself
 * would otherwise do -- the resolved name gets sent back as photoMeta[].locationName
 * on the actual upload so it's never looked up twice for the same photo. Best-effort:
 * resolves to null on any failure rather than throwing, so a slow/offline/failed
 * lookup here never blocks or breaks taking or using a photo.
 */
export async function reverseGeocodeLive(lat: number, lng: number): Promise<string | null> {
  try {
    const body = await request<{ locationName: string | null }>(
      `/api/jobs/geocode/reverse?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`,
      { timeoutMs: 8_000 }
    );
    return body.locationName;
  } catch {
    return null;
  }
}

export async function fetchLiabilityDamageCategories(): Promise<string[]> {
  const body = await request<{ categories: string[] }>("/api/jobs/liability-categories");
  return body.categories;
}

export function startJob(jobId: string): Promise<JobUpdateResult> {
  return request(`/api/jobs/${encodeURIComponent(jobId)}/start`, { method: "POST" });
}

export function uploadEvidencePhotos(
  jobId: string,
  files: File[],
  onProgress?: (fraction: number) => void,
  /** Parallel to `files` — where/when each was taken. Sent as one JSON field
   *  alongside the photos so the backend can pair them up by index. */
  metas?: Array<PhotoCaptureMeta | null>
): Promise<JobUpdateResult> {
  const form = new FormData();
  files.forEach(file => form.append("photos", file));
  if (metas && metas.length > 0) form.append("photoMeta", JSON.stringify(metas));
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
  options: { jobId?: string; label: string; onProgress?: (fraction: number) => void } = { label: "Form" },
  /** Parallel to `photos` -- where/when each was taken. Sent as one JSON field
   *  alongside the photos so the backend can pair them up by index. */
  photoMeta?: Array<PhotoCaptureMeta | null>
): Promise<ScenarioSubmitResult> {
  const url = scenarioUrl(scenario, options.jobId);

  if (isOffline()) {
    await enqueue({ url, label: options.label, fields, photos, photoMeta, signature });
    return "queued";
  }

  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  photos.forEach(photo => form.append("photos", photo));
  if (photoMeta && photoMeta.length > 0) form.append("photoMeta", JSON.stringify(photoMeta));
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
      await enqueue({ url, label: options.label, fields, photos, photoMeta, signature });
      return "queued";
    }
    throw error;
  }
}
