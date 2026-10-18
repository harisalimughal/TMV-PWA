/**
 * Wire contract for the job activity stream (PROPOSED: no backend implements it yet).
 *
 * The backend lives in another repository, so these are the shapes the frontend needs it
 * to serve. Nothing here is a live endpoint until that repository adds them; see
 * docs/ACTIVITY_CHAT_PHASE1.md. Times are ISO-8601 UTC strings; screens render them in
 * Europe/London.
 */
import {
  ACTIVITY_EVENT_BY_TYPE, LEGACY_EVENT_TYPE, isMessageType, type ActivityCategory, type ActivityKind, type ActivitySource, type ActorRole, type Stop, type Verification
} from "./events";

export interface ActivityActor {
  role: ActorRole;
  /** Driver code (the application's stable driver key), for role "driver". Never a display name. */
  driverInitials?: string;
  /** Admin account identifier, for role "admin". */
  adminId?: string;
  /** Name to show. Resolved by the server so a rename never rewrites history's meaning. */
  displayName: string;
}

/** One entry in a job's single conversation. Append-only: corrections are new entries. */
export interface ActivityMessage {
  /** Server-assigned, globally unique, sortable by creation. The cursor uses it. */
  id: string;
  jobId: string;
  kind: ActivityKind;
  /** An ACTIVITY_EVENTS type, or a MESSAGE_TYPES type. */
  type: string;
  category: ActivityCategory;
  actor: ActivityActor;
  title: string;
  /** Plain text. For direct messages, what the person typed. For events, optional detail. */
  body?: string;
  /** When it happened (device or source clock, never later than recordedAt by design). */
  occurredAt: string;
  /** When the server stored it. Authoritative for ordering. */
  recordedAt: string;
  source: ActivitySource;
  verification: Verification;
  stop?: Stop;
  /** Small, typed, non-sensitive facts (photo count, report type, amounts in pence). Never booking text. */
  metadata?: Record<string, string | number | boolean | null>;
  /** Unique per job. Replaying the same request returns the original entry. */
  idempotencyKey: string;
  /** Link to the push notification this entry produced, if any. */
  notificationRef?: { kind: string; id: string };
  /** Set when this entry corrects an earlier one. The earlier entry is never altered. */
  supersedes?: string;
  /** Workflow states around the event, when the existing audit trail has them. */
  fromState?: string;
  toState?: string;
  /**
   * For a direct message only, and only what the server actually knows:
   *   recorded     stored, no notification attempted yet
   *   notified     a push was dispatched to the recipient's registered devices
   *   notify_failed the push could not be dispatched (the message itself is stored)
   * Absent means the server does not track it. Never inferred by a screen.
   */
  delivery?: "recorded" | "notified" | "notify_failed";
  /** When the recipient opened the conversation past this message, if the server records it. */
  readAt?: string;
}

export interface ActivityPage {
  /** Oldest first within a conversation; newest first in the global feed. */
  items: ActivityMessage[];
  /** Pass back as `after` to fetch strictly newer entries (the id of the newest entry served). */
  nextCursor?: string;
  /** Pass back as `before` to load the page of older history. Absent when nothing older exists. */
  olderCursor?: string;
  /** Server clock, so polling does not depend on the device clock. */
  serverTime: string;
  /** What the caller may do in this conversation, decided by the server. */
  capabilities?: ConversationCapabilities;
}

export interface ConversationCapabilities {
  /** The caller may send a direct message here. */
  canMessage: boolean;
  /** Why not, in plain words, when canMessage is false (for example "No driver is assigned"). */
  reason?: string;
}

export type ConversationJobStatus = "READY" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";

/** One row of the conversation list: a job and the latest thing that happened in it. */
export interface ActivityConversation {
  jobId: string;
  customerName?: string;
  driver: { initials: string; name: string };
  jobStatus: ConversationJobStatus;
  /** The workflow step, when known (for a precise status label). */
  currentState?: string;
  bookedStart?: string;
  lastMessage?: Pick<ActivityMessage, "id" | "type" | "kind" | "category" | "title" | "body" | "occurredAt" | "recordedAt" | "actor" | "verification">;
  /** Time of the newest entry, for ordering the list. */
  lastActivityAt: string;
  /** Entries newer than the caller's read marker. Real count; never a guess. */
  unreadCount: number;
  capabilities: ConversationCapabilities;
}

export interface ConversationPage {
  items: ActivityConversation[];
  nextCursor?: string;
  serverTime: string;
}

export interface ConversationQuery {
  q?: string;
  driver?: string;
  category?: ActivityCategory;
  types?: string[];
  from?: string;
  to?: string;
  unreadOnly?: boolean;
  after?: string;
  limit?: number;
}

export interface UnreadSummary { total: number; serverTime: string }

/** Marks everything in a conversation up to and including `upToId` as read by the caller. */
export interface MarkReadRequest { upToId: string }

export interface ActivityQuery {
  /** Return entries strictly after this cursor (the previous page's nextCursor). */
  after?: string;
  /** Return the page of history strictly before this cursor (a previous olderCursor). */
  before?: string;
  limit?: number;
  /** Admin global feed only. */
  jobId?: string;
  driver?: string;
  category?: ActivityCategory;
  /** Event types to include (sent as a comma-separated list). */
  types?: string[];
  kind?: ActivityKind;
  from?: string;
  to?: string;
}

/** The only thing a client may create. Operational events are written by the server. */
export interface PostDirectMessage {
  /** Generated once per send and reused on retry; becomes the idempotency key. */
  clientMessageId: string;
  body: string;
  /** Short headline for the notification. Optional; the server supplies a default. */
  title?: string;
  /**
   * Admin only. The driver the sender believes is assigned. The server compares it with the job's
   * current assignment and refuses with DRIVER_CHANGED when they differ, so a message is never
   * delivered to someone who has since been replaced.
   */
  expectedDriver?: string;
}

export const MAX_MESSAGE_LENGTH = 1000;

export type ActivityErrorCode =
  | "UNAUTHORIZED" // no valid session
  | "FORBIDDEN" // not in the caller's scope (not their job, not the assigned driver)
  | "JOB_NOT_FOUND"
  | "NO_ASSIGNED_DRIVER" // an admin message needs a recipient
  | "DRIVER_CHANGED" // the job was reassigned after the composer opened
  | "INVALID_MESSAGE"
  | "RATE_LIMITED";

/* ------------------------------------------------------------------ idempotency --- */

/** A new id for one user-initiated action. Reuse the same value when retrying that action. */
export function newClientRequestId(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  // Fallback for very old WebViews: still unique enough for a per-job unique index.
  return `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * Key for events the server derives itself (state transitions, tracker fields, calendar sync).
 * The same source record always yields the same key, so a worker retry cannot double-post.
 *   sourceRef: the stable thing it came from, e.g. the ISO value of Job.trackerArrivalAt.
 */
export function systemIdempotencyKey(jobId: string, type: string, sourceRef: string): string {
  return `sys:${jobId}:${type}:${sourceRef}`;
}

/** Key for an event caused by one client request (an action, an upload, a signature). */
export function requestIdempotencyKey(jobId: string, type: string, clientRequestId: string): string {
  return `req:${jobId}:${type}:${clientRequestId}`;
}

/* ------------------------------------------------------------------- invariants --- */

export interface InvariantProblem { field: string; problem: string }

/**
 * The rules every stored or received entry must satisfy. Used by the backend as its write
 * guard and by the frontend to refuse malformed payloads. The key ones:
 *   - a direct message is kind "message", verification "not_applicable", and its sender is a
 *     person (admin or driver), never the system; it can never carry an event type;
 *   - an operational entry must match the catalogue exactly (role, source, verification,
 *     category), so nothing can pose as a driver-confirmed step it is not;
 *   - tracker observations are always system actors with verification "tracker_observed".
 */
export function activityProblems(entry: ActivityMessage): InvariantProblem[] {
  const out: InvariantProblem[] = [];
  const bad = (field: string, problem: string) => out.push({ field, problem });
  if (!entry.id) bad("id", "missing");
  if (!entry.jobId) bad("jobId", "missing");
  if (!entry.idempotencyKey) bad("idempotencyKey", "missing");
  if (!Number.isFinite(Date.parse(entry.occurredAt))) bad("occurredAt", "not a date");
  if (!Number.isFinite(Date.parse(entry.recordedAt))) bad("recordedAt", "not a date");
  if (entry.actor.role === "driver" && !entry.actor.driverInitials) bad("actor.driverInitials", "a driver actor needs the driver code");
  if (entry.actor.role === "admin" && !entry.actor.adminId) bad("actor.adminId", "an admin actor needs the admin id");

  if (entry.kind === "message") {
    if (!isMessageType(entry.type)) bad("type", "a message must use a message type");
    if (entry.actor.role === "system") bad("actor.role", "a message is sent by a person, not the system");
    if (entry.verification !== "not_applicable") bad("verification", "a message confirms nothing about the job");
    if (entry.category !== "message") bad("category", "a message uses the message category");
    if (entry.source !== "driver_app" && entry.source !== "admin_dashboard") bad("source", "a message comes from the driver app or the dashboard");
    if ((entry.type === "message.admin_to_driver") !== (entry.actor.role === "admin")) bad("type", "message direction must match the sender");
    if (!entry.body?.trim()) bad("body", "a message needs text");
    if ((entry.body?.length ?? 0) > MAX_MESSAGE_LENGTH) bad("body", `longer than ${MAX_MESSAGE_LENGTH} characters`);
  } else if (entry.type === LEGACY_EVENT_TYPE) {
    // A pre-existing audit-trail entry: recorded by the server, never a confirmed driver step.
    if (entry.verification !== "system_recorded") bad("verification", "a legacy entry is only 'recorded by the system'");
    if (entry.source !== "system") bad("source", "a legacy entry has source system");
  } else {
    const def = ACTIVITY_EVENT_BY_TYPE.get(entry.type);
    if (!def) { bad("type", "unknown event type"); return out; }
    if (entry.actor.role !== def.actorRole) bad("actor.role", `${entry.type} is recorded by ${def.actorRole}`);
    if (entry.source !== def.source) bad("source", `${entry.type} comes from ${def.source}`);
    if (entry.verification !== def.verification) bad("verification", `${entry.type} is ${def.verification}`);
    if (entry.category !== def.category) bad("category", `${entry.type} belongs to ${def.category}`);
  }
  return out;
}

export const isValidActivity = (entry: ActivityMessage): boolean => activityProblems(entry).length === 0;

/** Validate what a client is allowed to send: only a direct message. */
export function messageProblems(input: PostDirectMessage): InvariantProblem[] {
  const out: InvariantProblem[] = [];
  if (!input.clientMessageId?.trim()) out.push({ field: "clientMessageId", problem: "missing" });
  const text = input.body?.trim() ?? "";
  if (!text) out.push({ field: "body", problem: "a message needs text" });
  if (input.body && input.body.length > MAX_MESSAGE_LENGTH) out.push({ field: "body", problem: `longer than ${MAX_MESSAGE_LENGTH} characters` });
  return out;
}

/* ----------------------------------------------------------------- authorisation --- */

export interface ConversationViewer {
  role: "admin" | "driver";
  /** Driver code for role "driver". */
  driverInitials?: string;
}
export interface ConversationJob {
  jobId: string;
  /** The job's current assigned driver code, or "" when unassigned. */
  driverInitials: string;
}

/**
 * Who may READ a job's conversation. The server enforces this; the same pure rule is here
 * so screens can hide controls consistently and tests can pin the behaviour.
 *   admin   any job, once the backend adds scope rules (the dashboard has a single admin
 *           role today, so there is nothing narrower to enforce yet)
 *   driver  only a job currently assigned to them
 * After a reassignment the previous driver loses access; the history stays intact for
 * admins and for the new driver.
 */
export function canViewConversation(viewer: ConversationViewer, job: ConversationJob): boolean {
  if (viewer.role === "admin") return true;
  return !!viewer.driverInitials && viewer.driverInitials === job.driverInitials;
}

/** Who may SEND a direct message: an admin (needs a recipient) or the currently assigned driver. */
export function canSendMessage(viewer: ConversationViewer, job: ConversationJob): boolean {
  if (viewer.role === "admin") return !!job.driverInitials;
  return canViewConversation(viewer, job);
}
