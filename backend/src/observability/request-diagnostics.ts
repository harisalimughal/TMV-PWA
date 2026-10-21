import type { Request } from "express";

// Unknown path segments may contain an email, reset token or address. Persist only
// known API words and route placeholders, never a raw URL or query string.
const PATH_WORDS = new Set(("api admin auth jobs list tomorrow pending-submissions geocode reverse liability-categories " +
  "login logout me drivers settings profile password setup complete-setup forgot-password reset-password " +
  "gps fleet live positions events sync charges reconcile summary finance notifications dismiss messages broadcast " +
  "activity unread conversations read bookings calendar connection pricing dispatch enquiries confirm " +
  "driver-reports export export.pdf export.xlsx export.csv report.pdf review reassign finish-manually " +
  "evidence signature actions scenarios checkin checkout parking liability liabilities categories records " +
  "van mileage fuel service compliance maintenance reset push subscribe unsubscribe vapid-public-key " +
  "storage uploads webhooks gpslive on-my-way start viewed driver-summary customer-signature " +
  "live congestion-zones congestion test toggle factory-reset logs").split(" "));
export const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;
export const PAGE_LABELS: Record<string, string> = {
  overview: "Overview", jobs: "Jobs", finished: "Finished jobs", livefleet: "Live fleet",
  drivers: "Drivers", driverreport: "Driver report", notifications: "Notifications & Alerts",
  alerts: "Notifications & Alerts", liabilities: "Liability", checkin: "Liability / Check In",
  checkout: "Liability / Check Out", parking: "Liability / Parking", liability: "Liability / Reports",
  van: "Van", configurations: "Configurations", pricing: "Configurations / Pricing",
  messaging: "Configurations / Messaging", settings: "Configurations / Settings", maintenance: "Data maintenance", logs: "Logs"
};
const REPORT_PAGES: Record<string, string> = {
  jobs: "Driver report / Jobs", performance: "Driver report / Performance & Timings", payments: "Driver report / Payments",
  comparison: "Driver report / Comparison", tunnels: "Driver report / Tunnel Charges", congestion: "Driver report / Congestion Charges"
};
export function safePage(value: unknown): string | undefined {
  return typeof value === "string" && [...Object.values(PAGE_LABELS), ...Object.values(REPORT_PAGES), "Driver app"].includes(value) ? value : undefined;
}
export function pageFromReferer(value: unknown, driverRequest: boolean): string | undefined {
  if (typeof value !== "string" || value.length > 8192) return;
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol)) return;
    const section = url.searchParams.get("section") ?? "";
    if (section === "driverreport") return REPORT_PAGES[url.searchParams.get("reportTab") ?? ""] ?? PAGE_LABELS.driverreport;
    return PAGE_LABELS[section] ?? (driverRequest && !url.pathname.startsWith("/admin") ? "Driver app" : undefined);
  } catch { return; }
}
export function safeEndpoint(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.startsWith("/api/") || value.length > 2048) return;
  return value.split(/[?#]/, 1)[0].split("/").map(segment => {
    if (!segment || PATH_WORDS.has(segment)) return segment;
    if (/^:[A-Za-z][A-Za-z0-9_]{0,30}(?:\.(?:pdf|xlsx|csv))?$/.test(segment)) return segment;
    const parameterSuffix = /^([a-z-]+)\.:([A-Za-z][A-Za-z0-9_]{0,30})$/.exec(segment);
    if (parameterSuffix && PATH_WORDS.has(parameterSuffix[1])) return segment;
    return /^TMV-[A-Z0-9_-]{1,40}$/.test(segment) ? ":jobId" : ":value";
  }).join("/").replace(/\/+$/, "").slice(0, 240);
}
export function requestEndpoint(originalPath: string, req: Request): string | undefined {
  // Inside a route this uses Express's registered parameter names, not their values.
  const route = typeof req.route?.path === "string" && req.baseUrl ? req.baseUrl + req.route.path : originalPath;
  return safeEndpoint(route);
}
export function safeRequestFilters(value: unknown): Record<string, string | number> | undefined {
  if (!value || typeof value !== "object") return;
  const source = value as Record<string, unknown>, filters: Record<string, string | number> = {};
  for (const key of ["from", "to"]) {
    const date = source[key];
    if (typeof date === "string" && /^\d{4}-\d{2}-\d{2}(?:T[\d:.]+(?:Z|[+-]\d{2}:\d{2}))?$/.test(date) && Number.isFinite(Date.parse(date))) filters[key] = date;
  }
  for (const key of ["page", "pageSize", "limit"]) {
    if (typeof source[key] !== "string" && typeof source[key] !== "number") continue;
    const n = Number(source[key]);
    if (Number.isSafeInteger(n) && n > 0 && n <= 10000) filters[key] = n;
  }
  if (["core", "display", "full"].includes(String(source.detail))) filters.detail = String(source.detail);
  if (["day", "week", "month"].includes(String(source.groupBy))) filters.groupBy = String(source.groupBy);
  return Object.keys(filters).length ? filters : undefined;
}
export function operationForEndpoint(endpoint: string, method?: string): string {
  const exact: Record<string, string> = {
    "/api/admin/activity/unread": "Unread activity count (background)",
    "/api/admin/notifications": "Notification delivery status",
    "/api/admin/summary": "Overview totals", "/api/admin/drivers/summary": "Driver performance summary",
    "/api/admin/jobs": "Admin job list", "/api/jobs/list": "Driver job list",
    "/api/jobs/tomorrow": "Driver tomorrow jobs", "/api/jobs/pending-submissions": "Driver pending submissions",
    "/api/admin/me": "Admin session check", "/api/auth/me": "Driver session check"
  };
  return exact[endpoint] ?? `${method ?? "API"} ${endpoint}`;
}

export const DB_COLLECTIONS = new Set(["jobs", "activity", "evidence", "driver_accounts", "settings", "push_subscriptions",
  "dashboard_dismissals", "driver_job_summaries", "van_mileage_records", "van_compliance", "gps_events", "gps_positions",
  "gps_drives", "gps_sync_runs", "scenario_submissions", "job_liabilities", "exceptions", "admin_activity_reads", "admin_server_errors",
  "road_authority_obligations", "road_charge_allocations", "other"]);
export const DB_COMMANDS = new Set(["find", "aggregate", "getMore", "count", "distinct", "insert", "update", "delete", "findAndModify"]);
export interface RequestTiming { name: string; durationMs: number; maxMs: number; calls: number; failed: number; pending: number }
export function safeTimingName(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const [prefix, collection, command, extra] = value.split(".");
  return prefix === "db" && DB_COLLECTIONS.has(collection) && DB_COMMANDS.has(command) && extra === undefined;
}
export function safeTimings(value: unknown): RequestTiming[] | undefined {
  if (!Array.isArray(value)) return;
  const validNumber = (n: unknown) => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 604800000;
  return value.filter(row => row && safeTimingName(row.name) && [row.durationMs, row.maxMs, row.calls, row.failed, row.pending].every(validNumber))
    .slice(0, 12).map(row => ({ name: row.name, durationMs: Math.round(row.durationMs), maxMs: Math.round(row.maxMs),
      calls: Math.round(row.calls), failed: Math.round(row.failed), pending: Math.round(row.pending) }));
}
