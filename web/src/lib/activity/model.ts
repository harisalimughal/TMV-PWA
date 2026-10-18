/**
 * Pure helpers for showing a job's activity stream. No network, no React.
 *
 * Ordering rule (deterministic, and the only one the screens use):
 *   1. occurredAt   when it really happened, so a late-arriving event lands where it belongs
 *   2. recordedAt   when the server stored it, to separate events with the same occurrence time
 *   3. id           an opaque but stable tie-break, so two screens never disagree
 * The server's cursor (`after`, `before`) follows insertion order instead; that is how a client
 * recovers anything it missed. The two orders are independent on purpose. Gaps are never filled
 * with invented entries.
 */
import { DateTime } from "luxon";
import type { ActivityMessage, ActivityConversation } from "./contract";
import { LEGACY_EVENT_TYPE } from "./events";

export const LONDON = "Europe/London";

export function compareActivity(a: ActivityMessage, b: ActivityMessage): number {
  return Date.parse(a.occurredAt) - Date.parse(b.occurredAt) || Date.parse(a.recordedAt) - Date.parse(b.recordedAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/** Adds `incoming` to `existing`. A repeated id replaces the earlier copy (so a read or delivery update lands) and is never shown twice. */
export function mergeActivity(existing: readonly ActivityMessage[], incoming: readonly ActivityMessage[]): ActivityMessage[] {
  const byId = new Map<string, ActivityMessage>();
  for (const entry of existing) byId.set(entry.id, entry);
  for (const entry of incoming) byId.set(entry.id, entry);
  return [...byId.values()].sort(compareActivity);
}

/** The id to ask the server for newer entries after: the greatest id seen, by server order. */
export function newestCursor(entries: readonly ActivityMessage[], fallback?: string): string | undefined {
  let best = fallback;
  for (const entry of entries) if (!best || entry.id > best) best = entry.id;
  return best;
}

/* ----------------------------------------------------------------------- time --- */

export const clock = (iso: string): string => DateTime.fromISO(iso, { zone: "utc" }).setZone(LONDON).toFormat("HH:mm");
export const dayKey = (iso: string): string => DateTime.fromISO(iso, { zone: "utc" }).setZone(LONDON).toFormat("yyyy-LL-dd");

export function dayLabel(key: string, now: DateTime = DateTime.now()): string {
  const day = DateTime.fromISO(key, { zone: LONDON });
  const today = now.setZone(LONDON).startOf("day");
  if (day.hasSame(today, "day")) return "Today";
  if (day.hasSame(today.minus({ days: 1 }), "day")) return "Yesterday";
  return day.toFormat(day.year === today.year ? "ccc d LLL" : "ccc d LLL yyyy");
}

export interface DayGroup { key: string; label: string; items: ActivityMessage[] }

/** Splits an already-ordered list into London calendar days. */
export function groupByDay(entries: readonly ActivityMessage[], now: DateTime = DateTime.now()): DayGroup[] {
  const out: DayGroup[] = [];
  for (const entry of entries) {
    const key = dayKey(entry.occurredAt);
    const last = out[out.length - 1];
    if (last?.key === key) last.items.push(entry);
    else out.push({ key, label: dayLabel(key, now), items: [entry] });
  }
  return out;
}

/** True when the server received it noticeably after it happened (a phone that was offline). */
export const LATE_AFTER_MS = 2 * 60_000;
export function arrivedLate(entry: Pick<ActivityMessage, "occurredAt" | "recordedAt">): boolean {
  return Date.parse(entry.recordedAt) - Date.parse(entry.occurredAt) > LATE_AFTER_MS;
}

/* -------------------------------------------------------------------- bubbles --- */

export type Viewer = "admin" | "driver";
export type BubbleKind =
  | "event" // an automatic, confirmed step
  | "warning" // an event that is genuinely a problem
  | "tracker" // a GPS observation, never a confirmed step
  | "legacy" // an entry from the earlier audit trail
  | "outgoing" // a person message sent by the viewer
  | "incoming"; // a person message sent by the other party

const WARNING_TYPES = new Set(["issue.report_submitted", "arrival_proof.overdue", "job.cancelled"]);

export function bubbleKind(entry: ActivityMessage, viewer: Viewer): BubbleKind {
  if (entry.kind === "message") return entry.actor.role === viewer ? "outgoing" : "incoming";
  if (entry.type === LEGACY_EVENT_TYPE) return "legacy";
  if (entry.verification === "tracker_observed") return "tracker";
  if (WARNING_TYPES.has(entry.type)) return "warning";
  return "event";
}

/** One short line for the conversation list. A person message names the sender; an event is its headline. */
export function previewText(last: ActivityConversation["lastMessage"], viewer: Viewer): string {
  if (!last) return "No activity yet";
  if (last.kind === "message") {
    const who = last.actor.role === viewer ? "You" : last.actor.role === "admin" ? "TMV" : last.actor.displayName;
    return `${who}: ${(last.body ?? "").replace(/\s+/g, " ").trim()}`;
  }
  return last.title;
}

export const unreadLabel = (count: number): string => (count > 99 ? "99+" : String(count));

/* -------------------------------------------------------------------- filters --- */

/**
 * The activity-type filter the screens offer. Each group lists only event types that really
 * exist in the catalogue, so a filter can never promise something the application does not record.
 * There is no separate "loading started" or "unloading started" step in the driver app; "Loading"
 * is the van-loaded photo and "Unloading" is the driver's Finish Move and the empty-van photo.
 */
export interface FilterGroup { id: string; label: string; types: string[]; hint?: string }

export const ACTIVITY_FILTER_GROUPS: readonly FilterGroup[] = [
  { id: "arrivals", label: "Arrivals", types: ["arrival.photo_submitted", "tracker.pickup_arrival_detected", "tracker.dropoff_arrival_detected", "arrival_proof.overdue"], hint: "Arrival photos and tracker detections" },
  { id: "loading", label: "Loading", types: ["load.photo_submitted"], hint: "The van loaded photo" },
  { id: "unloading", label: "Unloading", types: ["move.finished", "emptyvan.photo_submitted"], hint: "Finish Move and the empty van photo" },
  { id: "departures", label: "Departures", types: ["tracker.dropoff_departure_detected"], hint: "Tracker detected the van leaving the drop-off" },
  { id: "completion", label: "Job completion", types: ["job.completed", "job.finished_manually", "job.cancelled"] },
  { id: "issues", label: "Issues", types: ["issue.report_submitted", "issue.none_reported_pickup", "issue.none_reported_dropoff", "issue.resumed"] },
  { id: "charges", label: "Charges & payment", types: ["charges.extra_submitted", "charges.overtime_submitted", "charges.total_submitted", "payment.recorded", "charges.manual_details_submitted"] },
  { id: "messages", label: "Messages", types: ["message.admin_to_driver", "message.driver_to_admin"], hint: "Direct messages between the office and the driver" }
];

export const filterGroupById = (id: string): FilterGroup | undefined => ACTIVITY_FILTER_GROUPS.find(group => group.id === id);

/** Does this entry match a group? Used to keep client-side views consistent with the server's `types` filter. */
export const matchesGroup = (entry: Pick<ActivityMessage, "type">, group: FilterGroup): boolean => group.types.includes(entry.type);

/** Short status words for a job. The workflow step wins when known, else the job status. */
export function statusLabel(status: ActivityConversation["jobStatus"], currentState?: string): string {
  if (status === "COMPLETED") return "Completed";
  if (status === "CANCELLED") return "Cancelled";
  if (status === "READY") return "Scheduled";
  const step = (currentState ?? "").toUpperCase();
  if (step === "IN_PROGRESS") return "Moving";
  return "In progress";
}
