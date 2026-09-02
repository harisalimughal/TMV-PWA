/**
 * Dev mock API router. Maps `/api/...` requests to responses backed by an in-memory
 * store, including the job workflow state machine (workflow.ts).
 *
 * DEV ONLY (see fixtures.ts). `handle()` returns null for any path it doesn't own, so
 * the caller falls through to the real network.
 */
import type { ActivityEntry, EvidenceSummary, Job } from "../api/jobs";
import { DEFAULT_CONFIRMATION_TEXT, seedStore, type MockStore } from "./fixtures";
import { applyTrigger, type WorkflowTrigger } from "./workflow";

let store: MockStore = seedStore();

/** Exposed for the HMR hook in install.ts. */
export function resetStore(): void {
  store = seedStore();
}

export interface MockResponse {
  status: number;
  body: unknown;
}

const ok = (body: unknown): MockResponse => ({ status: 200, body });
const err = (status: number, code: string, message: string): MockResponse => ({
  status,
  body: { error: { code, message } }
});

const HAPPY_ORDER = [
  "READY",
  "WAITING_ARRIVAL_PHOTO",
  "WAITING_ARRIVAL_ISSUES_CHECK",
  "WAITING_LOADED_PHOTO",
  "IN_PROGRESS",
  "WAITING_EMPTY_VAN_ISSUES_CHECK",
  "WAITING_EXTRA_CHARGES",
  "WAITING_OVERTIME",
  "WAITING_TOTAL_CHARGES",
  "WAITING_PAYMENT",
  "WAITING_EMPTY_VAN_PHOTO",
  "WAITING_CLIENT_CONFIRMATION",
  "WAITING_REVIEW_CHECK",
  "COMPLETED"
];

function reached(job: Job, state: string): boolean {
  const at = HAPPY_ORDER.indexOf(job.currentState);
  const target = HAPPY_ORDER.indexOf(state);
  return at >= 0 && target >= 0 && at > target;
}

function evidenceFor(job: Job): EvidenceSummary {
  const completed: Record<string, number> = {};
  if (reached(job, "WAITING_ARRIVAL_PHOTO")) completed.Arrival = 1;
  if (reached(job, "WAITING_LOADED_PHOTO")) completed.VanLoaded = 1;
  if (reached(job, "WAITING_EMPTY_VAN_PHOTO")) completed.EmptyVan = 1;
  return { completed, pending: {}, failed: {}, hasSignature: Boolean(job.signatureUrl) };
}

function suggestedTotal(job: Job): number {
  if (job.totalCharges) return job.totalCharges;
  let extras = 0;
  if (job.extraCharges?.includes("London Congestion charge")) extras += 18;
  if (job.extraCharges?.includes("Tunnel Charges")) extras += 13;
  return job.basePrice + extras + (job.overtimeCharge ?? 0);
}

function logActivity(job: Job, action: string, fromState: string): void {
  const entry: ActivityEntry = {
    jobId: job.jobId,
    driver: store.driver.initials,
    action,
    fromState,
    toState: job.currentState,
    timestamp: new Date().toISOString()
  };
  (store.activity[job.jobId] ??= []).unshift(entry);
}

function bucketJobs(ids: string[]): Job[] {
  return ids.map(id => store.jobs[id]).filter(Boolean);
}

function transition(jobId: string, trigger: WorkflowTrigger, input?: Record<string, string[]>): MockResponse {
  const job = store.jobs[jobId];
  if (!job) return err(404, "JOB_NOT_FOUND", "That job no longer exists.");
  const fromState = job.currentState;
  const updated = applyTrigger(job, trigger, input ?? {});
  store.jobs[jobId] = updated;
  if (updated.currentState !== fromState) logActivity(updated, trigger, fromState);
  return ok({ job: updated, suggestedTotal: suggestedTotal(updated) });
}

function parse(bodyText?: string): any {
  if (!bodyText) return {};
  try {
    return JSON.parse(bodyText);
  } catch {
    return {};
  }
}

/**
 * @param method  upper-case HTTP method
 * @param path    pathname only, e.g. "/api/jobs/10231" (no origin, no query)
 * @param bodyText JSON request body as a string, when present
 */
export function handle(method: string, path: string, bodyText?: string): MockResponse | null {
  if (!path.startsWith("/api/")) return null;

  // ---- auth --------------------------------------------------------------------
  if (path === "/api/auth/me" && method === "GET") {
    return store.loggedOut
      ? err(401, "UNAUTHENTICATED", "No active session.")
      : ok({ driver: store.driver });
  }
  if (path === "/api/auth/login" && method === "POST") {
    store.loggedOut = false;
    return ok({ driver: store.driver });
  }
  if (path === "/api/auth/logout" && method === "POST") {
    store.loggedOut = true;
    return ok({ ok: true });
  }
  if (path === "/api/auth/forgot-password" && method === "POST") {
    return ok({ message: "If that email is registered, a reset link is on its way." });
  }
  if (path === "/api/auth/reset-password" && method === "POST") {
    store.loggedOut = false;
    return ok({ driver: store.driver });
  }

  // ---- admin (minimal — enough to mount the dashboard shell for visual QA) ----
  if (path === "/api/admin/me" && method === "GET") {
    return store.loggedOut ? err(401, "UNAUTHENTICATED", "No admin session.") : ok({ ok: true });
  }
  if (path === "/api/admin/login" && method === "POST") {
    store.loggedOut = false;
    return ok({ ok: true });
  }
  if (path === "/api/admin/logout" && method === "POST") {
    store.loggedOut = true;
    return ok({ ok: true });
  }

  // ---- jobs ------------------------------------------------------------------
  if (path === "/api/jobs/list" && method === "GET") {
    return ok({
      driver: { fullName: store.driver.fullName, initials: store.driver.initials },
      today: bucketJobs(store.buckets.today),
      past: bucketJobs(store.buckets.past),
      next: bucketJobs(store.buckets.next)
    });
  }

  const jobMatch = path.match(/^\/api\/jobs\/([^/]+)(\/[^?]*)?$/);
  if (jobMatch) {
    const jobId = decodeURIComponent(jobMatch[1]);
    const sub = jobMatch[2] ?? "";
    const job = store.jobs[jobId];

    if (sub === "" && method === "GET") {
      if (!job) return err(404, "JOB_NOT_FOUND", "That job no longer exists.");
      return ok({
        job,
        activity: store.activity[jobId] ?? [],
        evidence: evidenceFor(job),
        suggestedTotal: suggestedTotal(job),
        confirmationText: DEFAULT_CONFIRMATION_TEXT
      });
    }
    if (sub === "/start" && method === "POST") return transition(jobId, "start");
    if (sub === "/evidence" && method === "POST") return transition(jobId, "evidence");
    if (sub === "/signature" && method === "POST") return transition(jobId, "signature");
    if (sub === "/actions" && method === "POST") {
      const { action, input } = parse(bodyText);
      if (!action) return err(400, "BAD_REQUEST", "Missing action.");
      return transition(jobId, action as WorkflowTrigger, input);
    }
    if (sub.startsWith("/scenarios/") && method === "POST") {
      if (job && job.currentState.endsWith("ISSUES_CHOICE")) transition(jobId, "scenario");
      return ok({ ok: true });
    }
  }

  // ---- standalone storage scenarios ---------------------------------------
  if (/^\/api\/storage\/[^/]+$/.test(path) && method === "POST") {
    return ok({ ok: true });
  }

  return err(404, "NOT_FOUND", `No mock handler for ${method} ${path}`);
}
