/**
 * Dev and demo only: fictional job activity so the Activity screens can be previewed (see install.ts).
 * Production builds never include this file (main.tsx guards the mock with import.meta.env.DEV, and the
 * demo build sets VITE_DEMO_MOCK). A real server answers these same endpoints from stored events; this
 * module only exists because that backend is not part of this repository.
 *
 * Operational entries are derived from each demo job's own status and times, using the shared catalogue,
 * so the preview cannot show an event type the real apps do not have. Nothing is sent anywhere: a message
 * posted here stays in memory and is marked "recorded", never "notified".
 */
import { DateTime } from "luxon";
import type { MockResponse } from "./handlers";
/** The few job fields the demo activity needs; both the admin and the driver mock jobs have them. */
export interface DemoJob { jobId: string; driverInitials: string; driverName?: string; status: string; currentState?: string; customerName?: string; bookedStart: string; actualStart?: string }
type NormalizedJob = DemoJob;
import {
  ACTIVITY_EVENT_BY_TYPE, messageProblems, requestIdempotencyKey, systemIdempotencyKey,
  type ActivityConversation, type ActivityMessage, type PostDirectMessage
} from "../lib/activity";

const ok = (body: unknown): MockResponse => ({ status: 200, body });
const problem = (status: number, code: string, message: string): MockResponse => ({ status, body: { error: { code, message } } });

const HISTORY_DAYS = 10;
/** [event type, minutes from the job's start] */
const FLOW: Array<[string, number]> = [
  ["job.created_from_calendar", -2880], ["job.viewed", -60], ["driver.on_my_way", -25], ["job.started", 0], ["arrival.photo_submitted", 5],
  ["load.photo_submitted", 25], ["move.finished", 70], ["emptyvan.photo_submitted", 85], ["customer.signature_captured", 90],
  ["charges.total_submitted", 95], ["job.completed", 96]
];
const ARRIVED_AT = 5; // an in-progress job has run up to the arrival photo

interface Store { entries: ActivityMessage[]; read: Map<string, string>; seq: number; built: boolean }
const newStore = (): Store => ({ entries: [], read: new Map(), seq: 0, built: false });
const adminStore = newStore();
const driverStore = newStore();
/** The store a function works on; set per request so the helpers below stay short. */
let store: Store = adminStore;
let viewer: "admin" | "driver" = "admin";

const nextId = () => `act_${String(++store.seq).padStart(6, "0")}`;
const iso = (dt: DateTime) => dt.toUTC().toISO()!;

function operational(job: NormalizedJob, type: string, occurred: DateTime, lateBySeconds = 4): ActivityMessage {
  const def = ACTIVITY_EVENT_BY_TYPE.get(type)!;
  const driver = job.driverInitials ? { role: "driver" as const, driverInitials: job.driverInitials, displayName: job.driverName || job.driverInitials } : undefined;
  const actor = def.actorRole === "driver" && driver ? driver : def.actorRole === "admin" ? { role: "admin" as const, displayName: "Office" } : { role: "system" as const, displayName: "TMV system" };
  return {
    id: nextId(), jobId: job.jobId, kind: "operational", type, category: def.category, actor, title: def.title,
    occurredAt: iso(occurred), recordedAt: iso(occurred.plus({ seconds: lateBySeconds })), source: def.source, verification: def.verification,
    ...(def.stop ? { stop: def.stop } : {}), idempotencyKey: systemIdempotencyKey(job.jobId, type, `${job.jobId}:${type}`)
  };
}

function build(jobs: readonly NormalizedJob[]): void {
  const since = DateTime.now().minus({ days: HISTORY_DAYS });
  const drafts: Array<{ at: number; make: () => ActivityMessage; job: NormalizedJob }> = [];
  for (const job of jobs) {
    if (!job.driverInitials || job.status === "CANCELLED") continue;
    const start = DateTime.fromISO(job.actualStart || job.bookedStart);
    if (!start.isValid || start < since || start > DateTime.now().plus({ hours: 36 })) continue;
    const upTo = job.status === "COMPLETED" ? FLOW.length : job.status === "IN_PROGRESS" ? FLOW.findIndex(([, m]) => m === ARRIVED_AT) + 1 : 3;
    FLOW.slice(0, upTo).forEach(([type, minutes], index) => {
      const occurred = start.plus({ minutes });
      if (occurred > DateTime.now()) return;
      // One entry reaches the server late, as a phone coming back online would; the screens show it as received later.
      const late = job.jobId.endsWith("1004") && type === "arrival.photo_submitted" ? 11 * 60 : 4;
      drafts.push({ at: occurred.toMillis(), job, make: () => operational(job, type, occurred, late) });
      void index;
    });
  }
  drafts.sort((a, b) => a.at - b.at);
  store.entries = drafts.map(draft => draft.make());
  store.read.clear();
  // Entries from the last 24 hours are unread, older ones read. Relative to now (not to the London
  // calendar day), so the preview shows unread items at any hour, including just after midnight.
  const unreadFrom = DateTime.now().minus({ hours: 24 }).toUTC().toISO()!;
  for (const job of jobs) {
    const mine = store.entries.filter(entry => entry.jobId === job.jobId);
    const lastOld = [...mine].reverse().find(entry => entry.recordedAt < unreadFrom);
    if (lastOld) store.read.set(job.jobId, lastOld.id);
  }
  store.built = true;
}

const forJob = (jobId: string) => store.entries.filter(entry => entry.jobId === jobId);

function unreadFor(jobId: string): number {
  const marker = store.read.get(jobId) ?? "";
  // The admin is told about driver and system entries; the driver about messages the office wrote to them.
  return forJob(jobId).filter(entry => entry.id > marker && (viewer === "admin" ? entry.actor.role !== "admin" : entry.kind === "message" && entry.actor.role === "admin")).length;
}

function conversationOf(job: NormalizedJob): ActivityConversation | null {
  const mine = forJob(job.jobId);
  const last = mine[mine.length - 1];
  if (!last || !job.driverInitials) return null;
  const { id, type, kind, category, title, body, occurredAt, recordedAt, actor, verification } = last;
  return {
    jobId: job.jobId, customerName: job.customerName, driver: { initials: job.driverInitials, name: job.driverName || job.driverInitials },
    jobStatus: job.status as ActivityConversation["jobStatus"], currentState: job.currentState, bookedStart: job.bookedStart,
    lastMessage: { id, type, kind, category, title, body, occurredAt, recordedAt, actor, verification }, lastActivityAt: recordedAt, unreadCount: unreadFor(job.jobId),
    capabilities: capabilitiesFor(job)
  };
}

/** The admin may message the assigned driver. The driver reply path is not offered by this demo server. */
function capabilitiesFor(job: NormalizedJob) {
  if (viewer === "driver") return { canMessage: false, reason: "Replies are not available yet." };
  return job.status === "CANCELLED" ? { canMessage: false, reason: "This job was cancelled." } : { canMessage: true };
}

function listConversations(jobs: readonly NormalizedJob[], params: URLSearchParams): MockResponse {
  const q = (params.get("q") || "").toLowerCase(), driver = params.get("driver"), category = params.get("category");
  const types = (params.get("types") || "").split(",").filter(Boolean), from = params.get("from"), to = params.get("to"), unreadOnly = params.get("unreadOnly") === "true";
  let rows = jobs.map(conversationOf).filter((row): row is ActivityConversation => row !== null);
  if (q) rows = rows.filter(row => [row.jobId, row.customerName ?? "", row.driver.name, row.driver.initials].some(value => value.toLowerCase().includes(q)));
  if (driver) rows = rows.filter(row => row.driver.initials === driver);
  if (category) rows = rows.filter(row => forJob(row.jobId).some(entry => entry.category === category));
  if (types.length) rows = rows.filter(row => forJob(row.jobId).some(entry => types.includes(entry.type)));
  if (from) rows = rows.filter(row => row.lastActivityAt >= from);
  if (to) rows = rows.filter(row => row.lastActivityAt <= to);
  if (unreadOnly) rows = rows.filter(row => row.unreadCount > 0);
  rows.sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt));
  const limit = Math.min(Number(params.get("limit")) || 100, 200);
  return ok({ items: rows.slice(0, limit), serverTime: new Date().toISOString() });
}

function jobActivity(job: NormalizedJob, params: URLSearchParams): MockResponse {
  const all = forJob(job.jobId), limit = Math.min(Number(params.get("limit")) || 50, 100);
  const after = params.get("after"), before = params.get("before");
  let items: ActivityMessage[];
  if (after) items = all.filter(entry => entry.id > after).slice(0, limit);
  else if (before) items = all.filter(entry => entry.id < before).slice(-limit);
  else items = all.slice(-limit);
  const oldest = items[0], newest = items[items.length - 1];
  const older = oldest ? all.some(entry => entry.id < oldest.id) : false;
  return ok({
    items, nextCursor: newest?.id ?? after ?? undefined, olderCursor: older ? oldest.id : undefined, serverTime: new Date().toISOString(),
    capabilities: capabilitiesFor(job)
  });
}

function postMessage(job: NormalizedJob, bodyText?: string): MockResponse {
  let input: PostDirectMessage;
  try { input = JSON.parse(bodyText || "{}") as PostDirectMessage; } catch { return problem(400, "INVALID_MESSAGE", "The message was not understood."); }
  const problems = messageProblems(input);
  if (problems.length) return problem(400, "INVALID_MESSAGE", problems[0].problem);
  if (!job.driverInitials) return problem(409, "NO_ASSIGNED_DRIVER", "This job has no assigned driver to message.");
  if (job.status === "CANCELLED") return problem(409, "FORBIDDEN", "This job was cancelled.");
  if (input.expectedDriver && input.expectedDriver !== job.driverInitials) return problem(409, "DRIVER_CHANGED", "This job has been reassigned. Reopen it to message the current driver.");
  const key = requestIdempotencyKey(job.jobId, "message.admin_to_driver", input.clientMessageId);
  const existing = store.entries.find(entry => entry.idempotencyKey === key);
  if (existing) return ok(existing);
  const now = DateTime.utc();
  const entry: ActivityMessage = {
    id: nextId(), jobId: job.jobId, kind: "message", type: "message.admin_to_driver", category: "message",
    actor: { role: "admin", adminId: "demo-admin", displayName: "Office" }, title: input.title?.trim() || "Message from the office", body: input.body.trim(),
    occurredAt: iso(now), recordedAt: iso(now), source: "admin_dashboard", verification: "not_applicable", idempotencyKey: key,
    // The preview never contacts a device, so it never claims a notification was sent.
    delivery: "recorded"
  };
  store.entries.push(entry);
  return ok(entry);
}

/** Answers activity endpoints; null means "not an activity endpoint". `jobs` is the demo job list. */
export function handleActivity(method: string, path: string, search: string, bodyText: string | undefined, jobs: readonly NormalizedJob[]): MockResponse | null {
  store = adminStore; viewer = "admin";
  if (!path.startsWith("/api/admin/activity") && !/^\/api\/admin\/jobs\/[^/]+\/activity/.test(path)) return null;
  if (!store.built) build(jobs);
  const params = new URLSearchParams(search);
  if (path === "/api/admin/activity/conversations" && method === "GET") return listConversations(jobs, params);
  if (path === "/api/admin/activity/unread" && method === "GET") {
    return ok({ total: jobs.reduce((sum, job) => sum + (job.driverInitials ? unreadFor(job.jobId) : 0), 0), serverTime: new Date().toISOString() });
  }
  const match = path.match(/^\/api\/admin\/jobs\/([^/]+)\/activity(\/read|\/messages)?$/);
  if (!match) return null;
  const job = jobs.find(item => item.jobId === decodeURIComponent(match[1]));
  if (!job) return problem(404, "JOB_NOT_FOUND", "That job was not found.");
  if (!match[2] && method === "GET") return jobActivity(job, params);
  if (match[2] === "/messages" && method === "POST") return postMessage(job, bodyText);
  if (match[2] === "/read" && method === "POST") {
    let upToId = "";
    try { upToId = String((JSON.parse(bodyText || "{}") as { upToId?: unknown }).upToId ?? ""); } catch { /* handled below */ }
    if (!forJob(job.jobId).some(entry => entry.id === upToId)) return problem(400, "INVALID_MESSAGE", "Unknown entry.");
    if ((store.read.get(job.jobId) ?? "") < upToId) store.read.set(job.jobId, upToId);
    return ok({ ok: true });
  }
  return null;
}

/** Fictional office messages for the driver preview, so the unread and message styles can be seen. */
const DEMO_OFFICE_MESSAGES = ["Please send a photo of the parking situation when you arrive.", "The customer asked for a call 10 minutes before you reach them."];

/**
 * Driver-side endpoints for the driver app's job activity and messages: only the driver's own jobs,
 * and only what the office wrote to them plus their own recorded steps. Replies are not offered.
 */
export function handleDriverActivity(method: string, path: string, search: string, bodyText: string | undefined, jobs: readonly NormalizedJob[], driver: { initials: string; fullName: string }): MockResponse | null {
  const inbox = path === "/api/activity/inbox";
  const match = path.match(/^\/api\/jobs\/([^/]+)\/activity(\/read)?$/);
  if (!inbox && !match) return null;
  store = driverStore; viewer = "driver";
  const mine = jobs.filter(job => job.driverInitials === driver.initials).map(job => ({ ...job, driverName: driver.fullName }));
  if (!store.built) {
    build(mine);
    const open = mine.filter(job => job.status !== "COMPLETED" && job.status !== "CANCELLED").slice(0, DEMO_OFFICE_MESSAGES.length);
    open.forEach((job, index) => {
      const now = DateTime.now().minus({ minutes: 20 + index * 15 });
      store.entries.push({
        id: nextId(), jobId: job.jobId, kind: "message", type: "message.admin_to_driver", category: "message", actor: { role: "admin", adminId: "demo-admin", displayName: "Office" },
        title: "Message from the office", body: DEMO_OFFICE_MESSAGES[index], occurredAt: iso(now), recordedAt: iso(now), source: "admin_dashboard", verification: "not_applicable",
        idempotencyKey: requestIdempotencyKey(job.jobId, "message.admin_to_driver", `demo-${index}`), delivery: "notified"
      });
    });
  }
  if (inbox && method === "GET") {
    const items = mine.map(conversationOf).filter((row): row is ActivityConversation => row !== null).sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt));
    return ok({ items, serverTime: new Date().toISOString() });
  }
  if (!match) return null;
  const job = mine.find(item => item.jobId === decodeURIComponent(match[1]));
  if (!job) return problem(404, "JOB_NOT_FOUND", "That job was not found.");
  if (!match[2] && method === "GET") return jobActivity(job, new URLSearchParams(search));
  if (match[2] && method === "POST") {
    let upToId = "";
    try { upToId = String((JSON.parse(bodyText || "{}") as { upToId?: unknown }).upToId ?? ""); } catch { /* handled below */ }
    if (!forJob(job.jobId).some(entry => entry.id === upToId)) return problem(400, "INVALID_MESSAGE", "Unknown entry.");
    if ((store.read.get(job.jobId) ?? "") < upToId) store.read.set(job.jobId, upToId);
    return ok({ ok: true });
  }
  return null;
}

/** Test and reset hook. */
export function resetActivity(): void {
  for (const target of [adminStore, driverStore]) { target.entries = []; target.read.clear(); target.seq = 0; target.built = false; }
}
