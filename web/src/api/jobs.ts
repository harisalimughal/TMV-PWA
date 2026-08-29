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

export interface ApiError {
  code: string;
  message: string;
  pending?: string[];
  failedTypes?: string[];
}

async function parseJson(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

async function throwIfError(res: Response, body: any): Promise<void> {
  if (!res.ok) {
    const error: ApiError = body?.error ?? { code: "UNKNOWN", message: "Something went wrong. Try again." };
    throw error;
  }
}

export async function fetchNextJob(): Promise<{ job: Job | null; driver: { fullName: string; initials: string } }> {
  const res = await fetch("/api/jobs", { credentials: "same-origin" });
  const body = await parseJson(res);
  await throwIfError(res, body);
  return body;
}

export async function fetchTomorrowJobs(): Promise<{ jobs: Job[]; unassignedCount: number }> {
  const res = await fetch("/api/jobs/tomorrow", { credentials: "same-origin" });
  const body = await parseJson(res);
  await throwIfError(res, body);
  return body;
}

export async function fetchJobDetail(
  jobId: string
): Promise<{
  job: Job; activity: ActivityEntry[]; evidence: EvidenceSummary; suggestedTotal: number; confirmationText: string
}> {
  const res = await fetch(`/api/jobs/${encodeURIComponent(jobId)}`, { credentials: "same-origin" });
  const body = await parseJson(res);
  await throwIfError(res, body);
  return body;
}

export async function startJob(jobId: string): Promise<{ job: Job }> {
  const res = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/start`, {
    method: "POST",
    credentials: "same-origin"
  });
  const body = await parseJson(res);
  await throwIfError(res, body);
  return body;
}

export async function uploadEvidencePhotos(jobId: string, files: File[]): Promise<{ job: Job }> {
  const form = new FormData();
  files.forEach(file => form.append("photos", file));
  const res = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/evidence`, {
    method: "POST",
    credentials: "same-origin",
    body: form
  });
  const body = await parseJson(res);
  await throwIfError(res, body);
  return body;
}

export async function uploadSignature(jobId: string, customerName: string, blob: Blob): Promise<{ job: Job }> {
  const form = new FormData();
  form.append("customerName", customerName);
  form.append("signature", blob, "signature.png");
  const res = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/signature`, {
    method: "POST",
    credentials: "same-origin",
    body: form
  });
  const body = await parseJson(res);
  await throwIfError(res, body);
  return body;
}

export async function submitScenario(
  jobId: string,
  scenario: string,
  fields: Record<string, string>,
  photos: File[],
  signature: Blob
): Promise<{ job: Job }> {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  photos.forEach(file => form.append("photos", file));
  form.append("signature", signature, "signature.png");
  const res = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/scenarios/${encodeURIComponent(scenario)}`, {
    method: "POST",
    credentials: "same-origin",
    body: form
  });
  const body = await parseJson(res);
  await throwIfError(res, body);
  return body;
}

export async function sendAction(
  jobId: string,
  action: string,
  input: Record<string, string[]> = {}
): Promise<{ job: Job }> {
  const res = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/actions`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, input })
  });
  const body = await parseJson(res);
  await throwIfError(res, body);
  return body;
}
