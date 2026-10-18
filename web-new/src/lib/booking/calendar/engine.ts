/**
 * Synchronisation engine: decides what a booking needs on the calendar and applies it safely. Everything outside
 * (the booking store, the mapping store, the Google client, the clock, the audit log) is injected, so the same
 * logic runs against the preview, a test double, or a real backend that supplies a Google client.
 *
 * Guarantees, each covered by tests:
 *  - One event per booking: the event id is derived from the booking id, a 409 on create is treated as "already
 *    there" and becomes an update, so a crash between "Google created it" and "we saved the id" cannot duplicate.
 *  - A calendar failure never touches the booking: the engine only writes mappings, never bookings.
 *  - Runs for one booking are serialised, and a run never overwrites a newer synced version.
 *  - Auth failures pause (they are not retried against a dead token); transient and rate-limit errors back off.
 */
import type { Booking } from "../types";
import { buildCalendarEvent, fingerprint } from "./event";
import type { CalendarConfig, CalendarEventPayload, CalendarEventSummary, ErrorKind, EventMapping, SyncDecision } from "./types";

export class CalendarApiError extends Error {
  constructor(public status: number, public reason: string = "", message?: string) { super(message ?? `Google Calendar API error ${status}${reason ? ` (${reason})` : ""}`); this.name = "CalendarApiError"; }
}

export interface CalendarClient {
  insert(calendarId: string, event: CalendarEventPayload): Promise<{ id: string }>;
  patch(calendarId: string, eventId: string, event: Partial<CalendarEventPayload>): Promise<void>;
  remove(calendarId: string, eventId: string): Promise<void>;
  /** Events in a window, for reconciliation. */
  list(calendarId: string, from: string, to: string): Promise<CalendarEventSummary[]>;
}

export interface MappingStore { get(bookingId: string): Promise<EventMapping | null>; save(mapping: EventMapping): Promise<void> }

export interface EngineDeps {
  getBooking(id: string): Promise<Booking | null>;
  mappings: MappingStore;
  client: CalendarClient;
  config(): CalendarConfig;
  now(): Date;
  lock: KeyedMutex;
  /** Called when Google rejects the credentials; the owner marks the connection as needing reconnection. */
  onAuthFailure?(message: string): void;
  audit?(entry: { bookingId: string; at: string; outcome: string; detail?: string }): void;
}

export const MAX_ATTEMPTS = 8;
export const backoffMs = (attempt: number) => Math.min(60 * 60_000, 60_000 * 2 ** Math.max(0, attempt - 1));

export function classifyError(error: unknown): { kind: ErrorKind; message: string } {
  if (error instanceof CalendarApiError) {
    if (error.status === 401 || error.reason === "invalid_grant" || error.reason === "authError") return { kind: "auth", message: "Google rejected the saved sign-in. Reconnect the Google account." };
    if (error.status === 429 || (error.status === 403 && /rateLimit|quotaExceeded/i.test(error.reason))) return { kind: "rate_limited", message: "Google asked us to slow down. Will retry." };
    if (error.status >= 500 || error.status === 408) return { kind: "transient", message: "Google Calendar had a temporary problem. Will retry." };
    return { kind: "permanent", message: `Google refused the change (${error.status}${error.reason ? `, ${error.reason}` : ""}).` };
  }
  return { kind: "transient", message: "Could not reach Google Calendar. Will retry." };
}

/** Serialises async work per key (per booking). */
export class KeyedMutex {
  private tails = new Map<string, Promise<unknown>>();
  run<T>(key: string, work: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key) ?? Promise.resolve();
    const next = previous.then(work, work);
    this.tails.set(key, next.catch(() => undefined));
    return next;
  }
}

export const newMapping = (bookingId: string): EventMapping => ({ bookingId, calendarId: null, eventId: null, fingerprint: null, syncedVersion: 0, status: "pending", attempts: 0, nextAttemptAt: null, lastError: null, lastSyncedAt: null, cancelledApplied: false });

/** Is this booking one we mirror? Confirmed (and completed) bookings always; enquiries-in-waiting only if configured. */
export function eligibility(booking: Booking, config: CalendarConfig): "mirror" | "tentative" | "cancelled" | "not_eligible" {
  if (booking.status === "cancelled") return "cancelled";
  if (booking.status === "confirmed" || booking.status === "completed") return "mirror";
  return config.syncUnconfirmed ? "tentative" : "not_eligible";
}

export interface Plan { decision: SyncDecision; event?: CalendarEventPayload; blockedReason?: string }

/** What should happen for this booking, given the current mapping. Pure. */
export function planSync(booking: Booking | null, mapping: EventMapping, config: CalendarConfig): Plan {
  if (!config.enabled) return { decision: { action: "skip", reason: "Automatic synchronisation is off." } };
  if (!config.calendarId) return { decision: { action: "skip", reason: "No calendar is selected." } };
  if (!booking) return mapping.eventId && !mapping.cancelledApplied ? { decision: { action: "delete" } } : { decision: { action: "noop", reason: "The booking no longer exists and has no event." } };
  const eligible = eligibility(booking, config);
  if (eligible === "cancelled") {
    if (!mapping.eventId) return { decision: { action: "skip", reason: "A cancelled booking that was never mirrored needs no event." } };
    if (mapping.cancelledApplied) return { decision: { action: "noop", reason: "The cancellation is already applied." } };
    if (config.cancellation === "delete") return { decision: { action: "delete" } };
    const built = buildCalendarEvent(booking, config, { cancelled: true });
    return built.blocked ? { decision: { action: "skip", reason: built.reason }, blockedReason: built.reason } : { decision: { action: "cancel" }, event: built.event };
  }
  if (eligible === "not_eligible") {
    return mapping.eventId && !mapping.cancelledApplied ? { decision: { action: "delete" } } : { decision: { action: "skip", reason: "Unconfirmed bookings are not mirrored." } };
  }
  const built = buildCalendarEvent(booking, config, { tentative: eligible === "tentative" });
  if (built.blocked) return { decision: { action: "skip", reason: built.reason }, blockedReason: built.reason };
  if (!mapping.eventId || mapping.cancelledApplied) return { decision: { action: "create" }, event: built.event };
  if (mapping.status === "synced" && mapping.fingerprint === built.event.extendedProperties.private.tmvFingerprint && mapping.calendarId === config.calendarId) return { decision: { action: "noop", reason: "The event is already up to date." }, event: built.event };
  return { decision: { action: "update" }, event: built.event };
}

export type SyncOutcome = "created" | "updated" | "cancelled" | "deleted" | "noop" | "skipped" | "blocked" | "retry_scheduled" | "failed" | "paused_auth" | "deferred";
export interface SyncResult { bookingId: string; outcome: SyncOutcome; detail?: string; mapping: EventMapping }

export async function syncBooking(bookingId: string, deps: EngineDeps, options: { force?: boolean } = {}): Promise<SyncResult> {
  return deps.lock.run(bookingId, async () => {
    const now = deps.now(), at = now.toISOString(), config = deps.config();
    const booking = await deps.getBooking(bookingId);
    const stored = (await deps.mappings.get(bookingId)) ?? newMapping(bookingId);
    let mapping: EventMapping = { ...stored };
    const done = async (outcome: SyncOutcome, patch: Partial<EventMapping> = {}, detail?: string): Promise<SyncResult> => {
      mapping = { ...mapping, ...patch };
      await deps.mappings.save(mapping);
      deps.audit?.({ bookingId, at, outcome, detail });
      return { bookingId, outcome, detail, mapping };
    };

    if (!options.force && mapping.nextAttemptAt && Date.parse(mapping.nextAttemptAt) > now.getTime() && mapping.status === "pending") return { bookingId, outcome: "deferred", detail: "A retry is scheduled.", mapping };
    if (booking && mapping.syncedVersion > booking.version) return { bookingId, outcome: "noop", detail: "A newer version was already synchronised.", mapping };

    const plan = planSync(booking, mapping, config);
    const d = plan.decision;
    if (d.action === "noop") return done("noop", { status: mapping.status === "pending" ? "synced" : mapping.status }, d.reason);
    if (d.action === "skip") {
      if (plan.blockedReason) return done("blocked", { status: "blocked", lastError: { kind: "blocked", message: plan.blockedReason, at } }, plan.blockedReason);
      const waiting = !config.enabled || !config.calendarId;
      return done("skipped", { status: waiting ? "pending" : "skipped" }, d.reason);
    }

    const calendarId = config.calendarId!;
    const eventId = mapping.eventId ?? plan.event?.id ?? "";
    try {
      if (d.action === "create") {
        try { await deps.client.insert(calendarId, plan.event!); }
        catch (error) {
          // The deterministic id already exists (an earlier attempt succeeded, or the event was deleted and is being
          // revived): adopt it and bring it up to date instead of creating a second one.
          if (error instanceof CalendarApiError && error.status === 409) await deps.client.patch(calendarId, plan.event!.id, plan.event!);
          else throw error;
        }
        return done("created", okPatch(plan.event!, booking!, calendarId, at, false));
      }
      if (d.action === "update" || d.action === "cancel") {
        try { await deps.client.patch(calendarId, eventId, plan.event!); }
        catch (error) {
          if (error instanceof CalendarApiError && error.status === 404) { await deps.client.insert(calendarId, plan.event!); } // removed outside TMV: recreate
          else throw error;
        }
        return done(d.action === "cancel" ? "cancelled" : "updated", okPatch(plan.event!, booking!, calendarId, at, d.action === "cancel"));
      }
      // delete
      try { await deps.client.remove(calendarId, eventId); }
      catch (error) { if (!(error instanceof CalendarApiError && (error.status === 404 || error.status === 410))) throw error; }
      return done("deleted", { eventId: mapping.eventId, status: "synced", attempts: 0, nextAttemptAt: null, lastError: null, lastSyncedAt: at, cancelledApplied: true, fingerprint: null, syncedVersion: booking?.version ?? mapping.syncedVersion });
    } catch (error) {
      const { kind, message } = classifyError(error);
      const lastError = { kind, message, at };
      if (kind === "auth") { deps.onAuthFailure?.(message); return done("paused_auth", { status: "pending", lastError, nextAttemptAt: null }, message); }
      const attempts = mapping.attempts + 1;
      if (kind === "permanent" || attempts >= MAX_ATTEMPTS) return done("failed", { status: "failed", attempts, lastError, nextAttemptAt: null }, message);
      return done("retry_scheduled", { status: "pending", attempts, lastError, nextAttemptAt: new Date(now.getTime() + backoffMs(attempts)).toISOString() }, message);
    }
  });
}

const okPatch = (event: CalendarEventPayload, booking: Booking, calendarId: string, at: string, cancelledApplied: boolean): Partial<EventMapping> => ({
  calendarId, eventId: event.id, fingerprint: event.extendedProperties.private.tmvFingerprint, syncedVersion: booking.version, status: "synced", attempts: 0, nextAttemptAt: null, lastError: null, lastSyncedAt: at, cancelledApplied
});

/* ------------------------------------------------------------------ reconciliation --- */

export type ReconcileKind = "missing_event" | "orphan_event" | "duplicate_events" | "drifted" | "possible_legacy_event";
export interface ReconcileFinding { kind: ReconcileKind; bookingId: string | null; eventIds: string[]; detail: string }

/**
 * Compares bookings, mappings and the events actually on the calendar. Read-only: it reports and proposes, and
 * never deletes or edits anything. "possible_legacy_event" flags an unmarked event that overlaps a booking and
 * mentions its reference or postcode (an event from the existing Make.com or extension flow), for a person to decide.
 */
export function reconcile(input: { bookings: Booking[]; mappings: EventMapping[]; events: CalendarEventSummary[]; config: CalendarConfig }): ReconcileFinding[] {
  const { bookings, mappings, events, config } = input;
  const findings: ReconcileFinding[] = [];
  const byId = new Map(bookings.map(b => [b.id, b]));
  const mapOf = new Map(mappings.map(m => [m.bookingId, m]));
  const marked = new Map<string, CalendarEventSummary[]>();
  const unmarked: CalendarEventSummary[] = [];
  for (const e of events) { const id = e.private.tmvBookingId; if (id) marked.set(id, [...(marked.get(id) ?? []), e]); else unmarked.push(e); }

  for (const [bookingId, list] of marked) {
    if (list.length > 1) findings.push({ kind: "duplicate_events", bookingId, eventIds: list.map(e => e.id), detail: `${list.length} events carry this booking's marker. Keep one and remove the others by hand.` });
    const booking = byId.get(bookingId);
    const eligible = booking ? eligibility(booking, config) : "not_eligible";
    if (!booking || eligible === "not_eligible" || (eligible === "cancelled" && config.cancellation === "delete" && !list[0].summary.startsWith("CANCELLED"))) {
      findings.push({ kind: "orphan_event", bookingId, eventIds: list.map(e => e.id), detail: booking ? "The booking is not eligible for the calendar but an event exists." : "The booking no longer exists but an event does." });
    } else if (list.length === 1) {
      const built = eligible === "cancelled" && config.cancellation === "delete" ? null : buildCalendarEvent(booking, config, { cancelled: eligible === "cancelled", tentative: eligible === "tentative" });
      if (built && !built.blocked && list[0].private.tmvFingerprint !== built.event.extendedProperties.private.tmvFingerprint) findings.push({ kind: "drifted", bookingId, eventIds: [list[0].id], detail: "The event differs from what TMV would write now. Run a sync to correct it." });
    }
  }
  for (const booking of bookings) {
    if (eligibility(booking, config) !== "mirror" && eligibility(booking, config) !== "tentative") continue;
    if (!marked.has(booking.id)) findings.push({ kind: "missing_event", bookingId: booking.id, eventIds: [], detail: mapOf.get(booking.id)?.eventId ? "The mapped event is not on the calendar." : "No event exists for this booking yet." });
  }
  for (const e of unmarked) {
    const hit = bookings.find(b => Date.parse(e.start) < Date.parse(b.end) && Date.parse(b.start) < Date.parse(e.end) && (new RegExp(b.reference, "i").test(`${e.summary} ${e.description}`) || (b.pickup.postcode && `${e.summary} ${e.description} ${e.location}`.toUpperCase().replace(/\s/g, "").includes(b.pickup.postcode.toUpperCase().replace(/\s/g, "")))));
    if (hit) findings.push({ kind: "possible_legacy_event", bookingId: hit.id, eventIds: [e.id], detail: `An event without a TMV marker overlaps ${hit.reference} and matches its reference or postcode. It may come from the existing flow. Not touched.` });
  }
  return findings;
}

export { fingerprint };
