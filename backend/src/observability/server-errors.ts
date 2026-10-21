import { randomUUID } from "node:crypto";
import type { ErrorLogEvent } from "../utils/logger";
import { HTTP_METHODS, operationForEndpoint, safeEndpoint, safePage, safeRequestFilters, safeTimings, type RequestTiming } from "./request-diagnostics";

const HELP = "Try the action again. If it keeps failing, share this reference with the developer.";
const AREAS = {
  calendar: { label: "Calendar", title: "A Calendar operation failed", summary: "The server could not complete a Calendar operation.", nextStep: "Check the booking in Calendar before repeating the action. Share the reference if it keeps failing." },
  database: { label: "Data access", title: "Saved information could not be accessed", summary: "The server encountered a problem while accessing stored information.", nextStep: HELP },
  gps: { label: "Vehicle tracking", title: "Tracking information could not be loaded", summary: "A request involving vehicle tracking failed.", nextStep: "Refresh the tracking view. If it keeps failing, share this reference with the developer." },
  uploads: { label: "Photos & documents", title: "A photo or document operation failed", summary: "The server could not complete an operation involving uploaded evidence.", nextStep: "Check whether the file was saved before trying again. Share the reference if it keeps failing." },
  notifications: { label: "Notifications", title: "A notification operation failed", summary: "The server could not complete a notification or delivery operation.", nextStep: "Check delivery status before resending a message. Share the reference if it keeps failing." },
  accounts: { label: "Accounts", title: "An account operation failed", summary: "The server could not complete an account operation.", nextStep: HELP },
  reports: { label: "Reports", title: "A report could not be loaded", summary: "The server could not complete a report request.", nextStep: "Try a shorter date range. If it keeps failing, share this reference with the developer." },
  jobs: { label: "Jobs", title: "A job operation failed", summary: "The server could not complete an operation on a job.", nextStep: "Check the job before repeating any changes. Share the reference if it keeps failing." },
  system: { label: "Application", title: "An application operation failed", summary: "The server encountered an error while completing an operation.", nextStep: HELP }
} as const;
export type ErrorArea = keyof typeof AREAS;
export const LOG_KINDS = ["server_error", "access", "slow_request", "request_issue"] as const;
export type LogKind = typeof LOG_KINDS[number];
const ISSUES = {
  login_failed: { kind: "access", title: "Sign-in details were not accepted", summary: "A sign-in attempt was unsuccessful. The password, account details or account availability may need checking.", nextStep: "Check the sign-in details. Use password recovery or contact the administrator if needed." },
  login_incomplete: { kind: "access", title: "Sign-in details were missing", summary: "A sign-in request did not include all required details.", nextStep: "Enter the required sign-in details and try again." },
  session_invalid: { kind: "access", title: "A sign-in session is no longer valid", summary: "A request used a session that had expired or was no longer accepted. This is an access issue, not proof of a server failure.", nextStep: "Sign in again. If it repeats immediately, share the reference with the developer." },
  sign_in_required: { kind: "access", title: "A request required sign-in", summary: "Someone requested a protected action without an accepted sign-in session.", nextStep: "Sign in before repeating the action." },
  permission_denied: { kind: "access", title: "An action was not permitted", summary: "The server refused an action because access was not permitted.", nextStep: "Check that the correct account is signed in and has permission for the action." },
  invalid_link: { kind: "access", title: "A sign-in setup or reset link was not accepted", summary: "A setup or password-reset link was invalid, expired or already used.", nextStep: "Request a new link. Do not share the old link or password in an error report." },
  rate_limited: { kind: "access", title: "Too many requests or sign-in attempts", summary: "A temporary limit stopped further attempts. This is a protective limit, not proof of a server outage.", nextStep: "Wait before trying again. If legitimate use keeps reaching the limit, share the reference." },
  request_timeout: { kind: "request_issue", title: "A request timed out", summary: "The request did not complete within the allowed time.", nextStep: "Check whether the action was saved before repeating it. If it keeps happening, share the reference." },
  not_found: { kind: "request_issue", title: "A requested item or service route was not found", summary: "A request could not find the item or service route it needed. The link may be outdated or the item may have been removed.", nextStep: "Refresh the page and check the link or item. Share the reference if a normal action keeps failing." },
  conflict: { kind: "request_issue", title: "An action conflicted with the current record", summary: "The request could not be applied to the record in its current state.", nextStep: "Refresh and check the latest record before repeating the action." },
  too_large: { kind: "request_issue", title: "A file or request was too large", summary: "The server could not accept a request because it exceeded the size limit.", nextStep: "Use a smaller file or fewer files, then try again." },
  slow_request: { kind: "slow_request", title: "A request took longer than expected", summary: "The server completed this request, but it exceeded the configured slow-request threshold. This was not a failed request.", nextStep: "If delays repeat, share the reference so the developer can investigate performance." },
  connection_closed: { kind: "request_issue", title: "A connection ended before the response finished", summary: "The browser or connection stopped waiting. Navigation, cancellation, a browser timeout or a connection interruption can cause this; a server failure is not confirmed.", nextStep: "Check whether the action completed before trying again." }
} as const;
export type OperationalIssue = keyof typeof ISSUES;
export function slowRequestThreshold(): number {
  const value = Number(process.env.ADMIN_LOG_SLOW_REQUEST_MS ?? 10000);
  return Number.isFinite(value) && value >= 1000 && value <= 300000 ? Math.round(value) : 10000;
}
export interface ServerErrorRecord {
  _id: string; occurredAt: Date; area: ErrorArea; areaLabel: string;
  title: string; summary: string; nextStep: string; requestId?: string; jobId?: string;
  kind?: LogKind; httpStatus?: number; durationMs?: number; audience?: "Admin" | "Driver";
  method?: string; endpoint?: string; operation?: string; page?: string;
  requestStartedAt?: string; buildId?: string; serverRunId?: string; timings?: RequestTiming[];
  filters?: Record<string, string | number>;
}

export function areaForRequest(path: string): ErrorArea {
  if (/\/driver-reports|\/finance|\/summary|\/drivers\/summary/.test(path)) return "reports";
  if (/\/gps|\/fleet|\/alerts|\/webhooks/.test(path)) return "gps";
  if (/\/notifications|\/messages|\/push/.test(path)) return "notifications";
  if (/\/evidence|\/storage|\/van|\/liabilit|\/scenarios/.test(path)) return "uploads";
  if (/\/auth|\/drivers|\/admin\/(?:login|me)$/.test(path)) return "accounts";
  if (/\/bookings|\/jobs/.test(path)) return "jobs";
  return "system";
}

/** Only fixed, reviewed text is persisted. Raw messages, exceptions, payloads,
 * Raw URLs, passwords, personal details and stacks never enter the admin collection. */
export function presentServerError(event: ErrorLogEvent): ServerErrorRecord {
  const message = event.message.toLowerCase();
  const area: ErrorArea = /mongo|database/.test(message) ? "database"
    : /calendar/.test(message) ? "calendar"
    : /gps|tracker|fleet|zone|congestion/.test(message) ? "gps"
    : /evidence|cloudinary|upload|storage|van route/.test(message) ? "uploads"
    : /push|vapid|notification|message|email|sms/.test(message) ? "notifications"
    : /password|admin driver|account|login/.test(message) ? "accounts"
    : /report/.test(message) ? "reports"
    : /job|reassign|manual finish/.test(message) ? "jobs"
    : typeof event.fields.area === "string" && Object.hasOwn(AREAS, event.fields.area) ? event.fields.area as ErrorArea : "system";
  const issue = typeof event.fields.issueType === "string" && Object.hasOwn(ISSUES, event.fields.issueType) ? ISSUES[event.fields.issueType as OperationalIssue] : undefined;
  const copy = issue ?? AREAS[area];
  const httpStatus = event.fields.httpStatus;
  const durationMs = event.fields.durationMs;
  const audience = event.fields.audience;
  const jobId = event.jobId ?? event.fields.job_id;
  const endpoint = safeEndpoint(event.fields.endpoint);
  const method = typeof event.fields.method === "string" && HTTP_METHODS.includes(event.fields.method as typeof HTTP_METHODS[number]) ? event.fields.method : undefined;
  const page = safePage(event.fields.page);
  const timings = safeTimings(event.fields.timings);
  const filters = safeRequestFilters(event.fields.filters);
  const started = typeof event.fields.requestStartedAt === "string" && /Z$/.test(event.fields.requestStartedAt) ? Date.parse(event.fields.requestStartedAt) : NaN;
  return { _id: randomUUID(), occurredAt: new Date(event.timestamp), area, areaLabel: AREAS[area].label,
    kind: typeof httpStatus === "number" && httpStatus >= 500 ? "server_error" : issue?.kind ?? "server_error",
    title: copy.title, summary: copy.summary, nextStep: copy.nextStep,
    ...(typeof httpStatus === "number" && Number.isInteger(httpStatus) && httpStatus >= 100 && httpStatus <= 599 ? { httpStatus } : {}),
    ...(typeof durationMs === "number" && Number.isFinite(durationMs) && durationMs >= 0 && durationMs <= 604800000 ? { durationMs: Math.round(durationMs) } : {}),
    ...(audience === "Admin" || audience === "Driver" ? { audience } : {}),
    ...(method ? { method } : {}), ...(endpoint ? { endpoint, operation: operationForEndpoint(endpoint, method) } : {}),
    ...(page ? { page } : {}), ...(timings?.length ? { timings } : {}),
    ...(filters ? { filters } : {}),
    ...(Number.isFinite(started) ? { requestStartedAt: new Date(started).toISOString() } : {}),
    ...(typeof event.fields.buildId === "string" && /^(?:local|dev|[0-9a-f]{7,64}|v?\d+\.\d+\.\d+)$/.test(event.fields.buildId) ? { buildId: event.fields.buildId } : {}),
    ...(typeof event.fields.serverRunId === "string" && /^[0-9a-f-]{36}$/i.test(event.fields.serverRunId) ? { serverRunId: event.fields.serverRunId } : {}),
    ...(/^[0-9a-f-]{36}$/i.test(event.requestId ?? "") ? { requestId: event.requestId } : {}),
    ...(typeof jobId === "string" && /^TMV-[A-Z0-9_-]{1,40}$/.test(jobId) ? { jobId } : {}) };
}

/** Bounded asynchronous writer: failures never hold up user requests or log recursively. */
export function createErrorRecorder(write: (records: ServerErrorRecord[]) => Promise<unknown>, capacity = 500) {
  const queue: ServerErrorRecord[] = [];
  let writing = false, timer: ReturnType<typeof setTimeout> | undefined;
  let omitted = 0, failed = 0;
  const schedule = () => {
    if (!timer && !writing && queue.length) { timer = setTimeout(() => { timer = undefined; void flush(); }, 500); timer.unref(); }
  };
  async function flush() {
    if (writing || !queue.length) return;
    writing = true;
    const batch = queue.splice(0, 50);
    try { await write(batch); } catch { failed += batch.length; }
    finally { writing = false; schedule(); }
  }
  return {
    record(event: ErrorLogEvent) { if (queue.length >= capacity) { omitted++; return; } queue.push(presentServerError(event)); schedule(); },
    flush,
    status: () => ({ pending: queue.length + (writing ? 1 : 0), omitted, failed })
  };
}
