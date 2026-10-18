/**
 * Adapter: a job's existing audit trail -> activity entries.
 *
 * Every job already carries `activity: ActivityEntry[]` (see the admin types). It is the
 * source of truth the new stream must be written together with, not a rival to it, and it
 * is available today. This adapter lets the first version of the chat read it unchanged.
 *
 * What it will NOT do: guess. The backend's own `action` strings are not documented in this
 * repository (the dev mock uses invented ones), so an entry becomes a catalogue event only
 * through an explicit `actionMap` the caller supplies after verifying real values against
 * the backend. Everything else stays a "legacy.entry": shown as recorded by the system,
 * with its original action text, never labelled as a confirmed driver step.
 */
import { LEGACY_EVENT_TYPE, ACTIVITY_EVENT_BY_TYPE, type ActivityCategory } from "./events";
import type { ActivityMessage } from "./contract";

/** Structurally the same as ActivityEntry in the admin types (kept separate so the driver
 *  bundle never imports from the admin tree). */
export interface LegacyActivityEntry {
  timestamp: string;
  driver: string;
  action: string;
  fromState?: string;
  toState?: string;
  detail?: string;
}

const humanise = (action: string) => action.replace(/_/g, " ").toLowerCase().replace(/^\w/, c => c.toUpperCase());
const isDriverCode = (value: string) => /^[A-Z0-9]{2}$/.test(value.trim());

export interface LegacyOptions {
  /** Verified backend action text -> catalogue event type. Empty until verified. */
  actionMap?: Record<string, string>;
  /** Display name for a driver code, e.g. from the roster. */
  driverName?: (initials: string) => string;
}

export function fromLegacyActivity(jobId: string, entries: readonly LegacyActivityEntry[] | undefined, options: LegacyOptions = {}): ActivityMessage[] {
  return (entries ?? [])
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => Number.isFinite(Date.parse(entry.timestamp)))
    .sort((a, b) => Date.parse(a.entry.timestamp) - Date.parse(b.entry.timestamp) || a.index - b.index)
    .map(({ entry, index }) => {
      const mappedType = options.actionMap?.[entry.action];
      const def = mappedType ? ACTIVITY_EVENT_BY_TYPE.get(mappedType) : undefined;
      const code = entry.driver?.trim() ?? "";
      const byDriver = isDriverCode(code);
      const category: ActivityCategory = def?.category ?? "lifecycle";
      return {
        id: `legacy:${jobId}:${index}:${Date.parse(entry.timestamp)}`,
        jobId,
        kind: "operational",
        type: def ? def.type : LEGACY_EVENT_TYPE,
        category,
        // A mapped event keeps its catalogue identity; an unmapped one is only "what the log says".
        actor: def
          ? { role: def.actorRole, ...(def.actorRole === "driver" && byDriver ? { driverInitials: code } : {}), ...(def.actorRole === "admin" ? { adminId: code || "admin" } : {}), displayName: byDriver ? options.driverName?.(code) ?? code : code || "System" }
          : { role: byDriver ? "driver" : "system", ...(byDriver ? { driverInitials: code } : {}), displayName: byDriver ? options.driverName?.(code) ?? code : code || "System" },
        title: def ? def.title : humanise(entry.action),
        ...(entry.detail ? { body: entry.detail } : {}),
        // The audit trail has one time. It is the server's recording time; the occurrence time is not separately known.
        occurredAt: entry.timestamp,
        recordedAt: entry.timestamp,
        source: def ? def.source : "system",
        verification: def ? def.verification : "system_recorded",
        ...(def?.stop ? { stop: def.stop } : {}),
        metadata: { legacy: !def, originalAction: entry.action },
        idempotencyKey: `legacy:${jobId}:${index}:${entry.action}:${entry.timestamp}`,
        ...(entry.fromState ? { fromState: entry.fromState } : {}),
        ...(entry.toState ? { toState: entry.toState } : {})
      } satisfies ActivityMessage;
    });
}
