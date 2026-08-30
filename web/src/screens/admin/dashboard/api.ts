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
  DriverSummaryItem, ExceptionItem, FinanceSummaryResponse, NormalizedJob, ScenarioItem, SummaryResponse
} from "./types";

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
  const res = await fetch(`/api/admin/summary?${params.toString()}`, { credentials: "same-origin" });
  if (!res.ok) throw new Error("Failed to load summary");
  return res.json();
}

export async function fetchJobs(query: Record<string, any> = {}): Promise<JobsResponse> {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== "") params.set(k, String(v));
  }
  const res = await fetch(`/api/admin/jobs?${params.toString()}`, { credentials: "same-origin" });
  if (!res.ok) throw new Error("Failed to load jobs");
  return res.json();
}

export async function fetchJobDetail(jobId: string): Promise<NormalizedJob> {
  const res = await fetch(`/api/admin/jobs/${encodeURIComponent(jobId)}`, { credentials: "same-origin" });
  if (!res.ok) throw new Error(`Failed to load job ${jobId}`);
  const data = await res.json();
  return data.job;
}

export async function reassignJob(jobId: string, driverInitials: string): Promise<{ ok: true; driverInitials: string; driverName: string }> {
  const res = await fetch(`/api/admin/jobs/${encodeURIComponent(jobId)}/reassign`, {
    method: "POST", credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ driverInitials })
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error?.message || "Failed to reassign driver");
  return body;
}

export async function fetchDrivers(from?: string, to?: string): Promise<{ drivers: DriverSummaryItem[] }> {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const res = await fetch(`/api/admin/drivers/summary?${params.toString()}`, { credentials: "same-origin" });
  if (!res.ok) throw new Error("Failed to load drivers summary");
  return res.json();
}

export async function fetchFinance(from?: string, to?: string, groupBy = "day"): Promise<FinanceSummaryResponse> {
  const params = new URLSearchParams({ groupBy });
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const res = await fetch(`/api/admin/finance/summary?${params.toString()}`, { credentials: "same-origin" });
  if (!res.ok) throw new Error("Failed to load finance summary");
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
  const res = await fetch(`/api/admin/exceptions?${params.toString()}`, { credentials: "same-origin" });
  if (!res.ok) throw new Error("Failed to load exceptions");
  return res.json();
}

export async function fetchScenarios(kind: string, page = 1): Promise<{ kind: string; items: ScenarioItem[]; pagination: PaginationMeta }> {
  const res = await fetch(`/api/admin/scenarios/${encodeURIComponent(kind)}?page=${page}`, { credentials: "same-origin" });
  if (!res.ok) throw new Error(`Failed to load scenario ${kind}`);
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
  const res = await fetch(`/api/admin/activity?${params.toString()}`, { credentials: "same-origin" });
  if (!res.ok) throw new Error("Failed to load activity logs");
  return res.json();
}

export async function triggerDatasetRefresh(): Promise<void> {
  // No dedicated /refresh endpoint here (Mongo reads have no cache to invalidate,
  // unlike the source's Sheets-backed sheetCache) -- kept as a no-op resolve so the
  // Layout.tsx refresh button doesn't need special-casing.
  return Promise.resolve();
}

async function postJson(path: string, body: unknown): Promise<void> {
  const res = await fetch(path, {
    method: "POST", credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error?.message || "Request failed");
  }
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
  const res = await fetch("/api/admin/drivers", {
    method: "POST", credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, role: payload.role || "Driver" })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || "Request failed");
  return { warning: data?.warning };
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
  const res = await fetch("/api/admin/settings", { credentials: "same-origin" });
  if (!res.ok) throw new Error("Failed to load settings");
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
  const res = await fetch("/api/admin/notifications", { credentials: "same-origin" });
  if (!res.ok) throw new Error("Failed to load notifications");
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
  const res = await fetch("/api/admin/fleet/live", { credentials: "same-origin" });
  if (!res.ok) throw new Error("Failed to load live fleet positions");
  return res.json();
}
