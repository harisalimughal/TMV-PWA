/**
 * Adapted from TMV-Chat-bot's dashboard/web/src/api/client.ts -- same functions, same
 * shapes, paths repointed from /admin/api/... to /api/admin/... (tmv-pwa's existing
 * prefix, shared with the Drivers/Settings tab built earlier). saveDriver and
 * fetchSettings/saveSetting point at tmv-pwa's own already-working endpoints
 * (auth/admin.routes.ts, db/settings.repo.ts) instead of the source's Sheets-backed
 * ones -- those were rebuilt this migration, not ported, so the payload shapes differ
 * slightly (password not pwaPassword; settings carry `type` not `description`).
 */
import {
  DriverSummaryItem, ExceptionItem, FinanceSummaryResponse, NormalizedJob, ScenarioItem, SummaryResponse, VanMileageItem
} from "./types";
import { SERVER_ERROR_MESSAGE } from "../../../lib/apiErrors";

/**
 * Every admin fetch goes through this instead of a bare `fetch()`. A 5xx, or the
 * request never reaching the server at all (offline, DNS, a dead upstream -- these
 * throw before a Response even exists), means our own infrastructure is the problem,
 * not anything the admin did. Surfacing "Internal Server Error" or a raw
 * "TypeError: Failed to fetch" isn't useful to anyone, so both collapse to the same
 * calm, honest message (see the Sept 2026 MongoDB Atlas connectivity incident this
 * was written after -- every page just looked quiet with no indication of an outage).
 * A 4xx keeps whatever specific reason the backend gave, via apiError() below, since
 * that IS something the admin can act on.
 */
async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(path, { credentials: "same-origin", ...init });
  } catch {
    throw new Error(SERVER_ERROR_MESSAGE);
  }
  if (res.status >= 500) throw new Error(SERVER_ERROR_MESSAGE);
  return res;
}

/** Builds the Error for a non-ok apiFetch response -- always a 4xx by the time this
 *  is called, so the backend's own message is worth showing. */
async function apiError(res: Response, fallback: string): Promise<Error> {
  const data = await res.json().catch(() => ({}));
  return new Error(data?.error?.message || fallback);
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
}

export interface JobsResponse {
  items: NormalizedJob[];
  pagination: PaginationMeta;
  meta: { fetchedAt: string; durationMs: number };
}

export async function fetchSummary(from?: string, to?: string): Promise<SummaryResponse> {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const res = await apiFetch(`/api/admin/summary?${params.toString()}`);
  if (!res.ok) throw await apiError(res, "Failed to load summary");
  return res.json();
}

export async function fetchJobs(query: Record<string, any> = {}): Promise<JobsResponse> {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== "") params.set(k, String(v));
  }
  const res = await apiFetch(`/api/admin/jobs?${params.toString()}`);
  if (!res.ok) throw await apiError(res, "Failed to load jobs");
  return res.json();
}

export async function fetchJobDetail(jobId: string): Promise<NormalizedJob> {
  const res = await apiFetch(`/api/admin/jobs/${encodeURIComponent(jobId)}`);
  if (!res.ok) throw await apiError(res, `Failed to load job ${jobId}`);
  const data = await res.json();
  return data.job;
}

export async function reassignJob(jobId: string, driverInitials: string): Promise<{ ok: true; driverInitials: string; driverName: string }> {
  const res = await apiFetch(`/api/admin/jobs/${encodeURIComponent(jobId)}/reassign`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ driverInitials })
  });
  if (!res.ok) throw await apiError(res, "Failed to reassign driver");
  return res.json();
}

export async function saveJobReview(
  jobId: string,
  payload: { status: "Pending" | "Approved" | "Flagged"; note: string }
): Promise<{ job?: NormalizedJob; review: { status: "Pending" | "Approved" | "Flagged"; note: string; reviewedAt: string } }> {
  const res = await apiFetch(`/api/admin/jobs/${encodeURIComponent(jobId)}/review`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw await apiError(res, "Failed to save manager review");
  return res.json();
}

export async function fetchDrivers(from?: string, to?: string): Promise<{ drivers: DriverSummaryItem[] }> {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const res = await apiFetch(`/api/admin/drivers/summary?${params.toString()}`);
  if (!res.ok) throw await apiError(res, "Failed to load drivers summary");
  return res.json();
}

export async function fetchFinance(from?: string, to?: string, groupBy = "day"): Promise<FinanceSummaryResponse> {
  const params = new URLSearchParams({ groupBy });
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const res = await apiFetch(`/api/admin/finance/summary?${params.toString()}`);
  if (!res.ok) throw await apiError(res, "Failed to load finance summary");
  return res.json();
}

export async function fetchExceptions(type?: string, from?: string, to?: string, badge?: boolean): Promise<{
  total: number; unfilteredTotal: number; activeBadgeCount?: number;
  items: ExceptionItem[]; types: Array<{ type: string; count: number }>;
}> {
  const params = new URLSearchParams();
  if (type) params.set("type", type);
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (badge) params.set("badge", "true");
  const res = await apiFetch(`/api/admin/exceptions?${params.toString()}`);
  if (!res.ok) throw await apiError(res, "Failed to load exceptions");
  return res.json();
}

export async function fetchScenarios(kind: string, page = 1): Promise<{ kind: string; items: ScenarioItem[]; pagination: PaginationMeta }> {
  const res = await apiFetch(`/api/admin/scenarios/${encodeURIComponent(kind)}?page=${page}`);
  if (!res.ok) throw await apiError(res, `Failed to load scenario ${kind}`);
  return res.json();
}

export async function fetchVanMileage(query: Record<string, any> = {}): Promise<{ items: VanMileageItem[]; pagination: PaginationMeta }> {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== "") params.set(k, String(v));
  }
  const res = await apiFetch(`/api/admin/van/mileage?${params.toString()}`);
  if (!res.ok) throw await apiError(res, "Failed to load van mileage records");
  return res.json();
}

export async function fetchActivity(page = 1, from?: string, to?: string): Promise<{
  items: Array<{
    id: string; timestamp: string; jobId: string; driver: string; action: string;
    fromState?: string; toState?: string; detail?: string;
  }>;
  pagination: PaginationMeta;
}> {
  const params = new URLSearchParams({ page: String(page) });
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const res = await apiFetch(`/api/admin/activity?${params.toString()}`);
  if (!res.ok) throw await apiError(res, "Failed to load activity logs");
  return res.json();
}

export async function triggerDatasetRefresh(): Promise<void> {
  // No dedicated /refresh endpoint here (Mongo reads have no cache to invalidate,
  // unlike the source's Sheets-backed sheetCache) -- kept as a no-op resolve so the
  // Layout.tsx refresh button doesn't need special-casing.
  return Promise.resolve();
}

async function postJson(path: string, body: unknown): Promise<void> {
  const res = await apiFetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw await apiError(res, "Request failed");
}

export interface AddJobPayload {
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  pickup: string;
  dropoff: string;
  crewSize: number;
  price: number;
  paidOnline?: boolean;
  driverInitials?: string;
  start: string;
  finish: string;
}

/** Creates a real Calendar event (see backend/src/admin/dashboard/jobs.routes.ts) --
 * not a local write, tmv-pwa's own sync path picks this up. */
export async function addJob(payload: AddJobPayload): Promise<void> {
  return postJson("/api/admin/jobs", payload);
}

export interface SaveDriverPayload {
  initials: string;
  fullName: string;
  email: string;
  role?: string;
  active?: boolean;
  phone?: string;
  vanRegistration?: string;
  /** Sets/resets the driver's app login. Leave blank on an edit to keep whatever
   * password is already set. */
  password?: string;
}

/** Upserts a driver_accounts doc, keyed on email -- add and edit both go through this.
 * This is tmv-pwa's own working endpoint (auth/admin.routes.ts), not a port of the
 * source's Sheets-backed drivers.route.ts. */
export async function saveDriver(payload: SaveDriverPayload): Promise<{ warning?: string }> {
  const res = await apiFetch("/api/admin/drivers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, role: payload.role || "Driver" })
  });
  if (!res.ok) throw await apiError(res, "Request failed");
  const data = await res.json().catch(() => ({}));
  return { warning: data?.warning };
}

/** Permanently removes a driver from the roster. Unlike saveDriver with active:false
 * (which only blocks their login), this deletes the driver_accounts doc outright. */
export async function deleteDriver(email: string): Promise<{ ok: true }> {
  const res = await apiFetch(`/api/admin/drivers/${encodeURIComponent(email)}`, { method: "DELETE" });
  if (!res.ok) throw await apiError(res, "Failed to delete driver");
  return res.json();
}

export interface EditableSetting {
  key: string;
  label: string;
  type: "text" | "textarea" | "number";
  fallback: string;
  hint?: string;
  value: string;
}

/** tmv-pwa's own working settings endpoint (db/settings.repo.ts), not a port of the
 * source's Sheets-backed settings.route.ts. */
export async function fetchSettings(): Promise<{ settings: EditableSetting[] }> {
  const res = await apiFetch("/api/admin/settings");
  if (!res.ok) throw await apiError(res, "Failed to load settings");
  return res.json();
}

export async function saveSetting(key: string, value: string): Promise<void> {
  return postJson("/api/admin/settings", { key, value });
}

export interface NotificationRow {
  jobId: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  driverInitials: string;
  actualStart: string;
  email: { state: "sent" | "failed" | "pending" | "skipped" | "disabled"; detail: string; at: string };
  sms: { state: "sent" | "failed" | "pending" | "skipped" | "disabled"; detail: string; at: string };
}

export async function fetchNotifications(): Promise<{ rows: NotificationRow[] }> {
  const res = await apiFetch("/api/admin/notifications");
  if (!res.ok) throw await apiError(res, "Failed to load notifications");
  return res.json();
}

export interface LiveFleetVehicle {
  imei: string;
  name: string;
  plateNumber: string;
  lat: number;
  lng: number;
  speedMph: number;
  lastUpdate: string;
  driverInitials: string | null;
  driverName: string | null;
  odometerMiles: number | null;
  ignitionOn: boolean | null;
  batteryVoltage: number | null;
  gpsSignalLevel: number | null;
  gsmSignalLevel: number | null;
  jammingDetected: boolean;
  ecoDrivingEvent: string | null;
  ecoDrivingScore: number | null;
}

export async function fetchLiveFleet(): Promise<{ vehicles: LiveFleetVehicle[]; fetchedAt: string }> {
  const res = await apiFetch("/api/admin/fleet/live");
  if (!res.ok) throw await apiError(res, "Failed to load live fleet positions");
  return res.json();
}
