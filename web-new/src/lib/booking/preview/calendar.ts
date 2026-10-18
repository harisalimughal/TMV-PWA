/**
 * Preview stand-in for the Google Calendar integration. The connection is SIMULATED: no Google account is
 * contacted and no real calendar is written. It runs the real sync engine against an in-memory fake calendar, so the
 * Settings screen and the booking flow show genuine engine behaviour (idempotency, retries, status) with fictional
 * data. A real backend replaces this with Google OAuth, encrypted token storage and a durable queue.
 */
import { DateTime } from "luxon";
import type { Booking } from "../types";
import { DEFAULT_CALENDAR_CONFIG, FakeCalendar, KeyedMutex, MemoryMappings, reconcile, syncBooking, type CalendarConfig, type EngineDeps, type EventMapping, type ReconcileFinding } from "../calendar";

export type ConnectionState = "disconnected" | "connected" | "needs_reconnect";
export interface IntegrationStatus {
  simulated: true;
  connection: { state: ConnectionState; account: string | null; connectedAt: string | null };
  calendars: Array<{ id: string; name: string }>;
  config: CalendarConfig;
  health: { synced: number; pending: number; failed: number; blocked: number; lastSyncAt: string | null; lastError: string | null; nextRetryAt: string | null };
}
export interface OperationRow { bookingId: string; reference: string; status: EventMapping["status"]; attempts: number; message: string | null; nextAttemptAt: string | null; at: string | null }

const CALENDARS = [{ id: "sample-ops", name: "TMV Operations (sample)" }, { id: "sample-test", name: "TMV Test calendar (sample)" }];
const FIELDS: Array<keyof CalendarConfig> = ["enabled", "calendarId", "syncUnconfirmed", "cancellation", "format", "include"];

export class ConfigError extends Error { constructor(message: string, public fields: Record<string, string>) { super(message); } }

export function createPreviewCalendar(env: { bookings: () => Booking[]; now: () => Date }) {
  const fake = new FakeCalendar();
  const mappings = new MemoryMappings();
  const lock = new KeyedMutex();
  let config: CalendarConfig = { ...DEFAULT_CALENDAR_CONFIG, appBaseUrl: "https://dashboard.example.test", include: { ...DEFAULT_CALENDAR_CONFIG.include } };
  let connection: IntegrationStatus["connection"] = { state: "disconnected", account: null, connectedAt: null };
  const queued = new Set<string>();
  let running: Promise<void> | null = null;
  let lastSyncAt: string | null = null;
  /** Bookings being processed right now. Counted as waiting, so the screen keeps polling until they finish. */
  const inFlight = new Set<string>();

  const deps = (): EngineDeps => ({
    getBooking: async id => { const b = env.bookings().find(x => x.id === id); return b ? structuredClone(b) : null; },
    mappings, client: fake, config: () => config, now: env.now, lock,
    onAuthFailure: () => { connection = { ...connection, state: "needs_reconnect" }; }
  });

  async function drain() {
    while (queued.size) {
      const ids = [...queued]; queued.clear();
      ids.forEach(id => inFlight.add(id));
      for (const id of ids) {
        try {
          if (connection.state !== "connected" || !config.enabled || !config.calendarId) continue;
          const result = await syncBooking(id, deps());
          if (["created", "updated", "cancelled", "deleted"].includes(result.outcome)) lastSyncAt = env.now().toISOString();
        } finally { inFlight.delete(id); }
      }
    }
  }
  const flush = (): Promise<void> => (running ??= drain().finally(() => { running = null; }));

  const queue = (bookingId: string) => { if (connection.state === "connected" && config.enabled && config.calendarId) { queued.add(bookingId); void flush(); } };
  const queueAll = () => { for (const b of env.bookings()) queued.add(b.id); void flush(); };

  const rows = (): OperationRow[] => {
    const byId = new Map(env.bookings().map(b => [b.id, b]));
    return [...mappings.data.values()].map(m => ({ bookingId: m.bookingId, reference: byId.get(m.bookingId)?.reference ?? m.bookingId, status: m.status, attempts: m.attempts, message: m.lastError?.message ?? null, nextAttemptAt: m.nextAttemptAt, at: m.lastError?.at ?? m.lastSyncedAt }));
  };

  return {
    fake, flush, queue, mappings,
    status(): IntegrationStatus {
      const all = [...mappings.data.values()];
      const count = (s: EventMapping["status"]) => all.filter(m => m.status === s).length;
      const errored = all.filter(m => m.lastError).sort((a, b) => (b.lastError!.at).localeCompare(a.lastError!.at))[0];
      const retry = all.map(m => m.nextAttemptAt).filter((x): x is string => !!x).sort()[0] ?? null;
      return { simulated: true, connection: { ...connection }, calendars: connection.state === "disconnected" ? [] : CALENDARS, config: structuredClone(config), health: { synced: count("synced"), pending: new Set([...all.filter(m => m.status === "pending").map(m => m.bookingId), ...queued, ...inFlight]).size, failed: count("failed"), blocked: count("blocked"), lastSyncAt, lastError: errored?.lastError?.message ?? null, nextRetryAt: retry } };
    },
    connect() { connection = { state: "connected", account: "ops@example.test (simulated)", connectedAt: env.now().toISOString() }; if (config.enabled && config.calendarId) queueAll(); },
    disconnect() { connection = { state: "disconnected", account: null, connectedAt: null }; config = { ...config, enabled: false, calendarId: null }; },
    updateConfig(patch: Partial<CalendarConfig>) {
      const next: CalendarConfig = { ...config };
      for (const key of Object.keys(patch) as Array<keyof CalendarConfig>) if (FIELDS.includes(key)) (next as unknown as Record<string, unknown>)[key] = key === "include" ? { ...next.include, ...(patch.include ?? {}) } : patch[key];
      const errors: Record<string, string> = {};
      if (connection.state !== "connected" && (next.enabled || next.calendarId)) errors.enabled = "Connect a Google account first.";
      if (next.calendarId && !CALENDARS.some(c => c.id === next.calendarId)) errors.calendarId = "That calendar is not available to the connected account.";
      if (next.enabled && !next.calendarId) errors.enabled = "Choose a calendar before turning synchronisation on.";
      if (!["private", "compatible"].includes(next.format)) errors.format = "Unknown event format.";
      if (!["mark_cancelled", "delete"].includes(next.cancellation)) errors.cancellation = "Unknown cancellation option.";
      if (Object.keys(errors).length) throw new ConfigError("Those settings cannot be saved.", errors);
      const turnedOn = (!config.enabled && next.enabled) || (next.enabled && config.calendarId !== next.calendarId);
      config = next;
      if (turnedOn) queueAll();
    },
    operations(status?: string) { return rows().filter(r => (status ? r.status === status : r.status !== "synced" && r.status !== "skipped")); },
    async retry(bookingId: string) { inFlight.add(bookingId); try { await syncBooking(bookingId, deps(), { force: true }); } finally { inFlight.delete(bookingId); } },
    reconcileNow(): ReconcileFinding[] {
      if (!config.calendarId) return [];
      const from = DateTime.fromJSDate(env.now()).minus({ days: 30 }).toUTC().toISO()!, to = DateTime.fromJSDate(env.now()).plus({ days: 365 }).toUTC().toISO()!;
      const events = fake.snapshot(config.calendarId, from, to);
      return reconcile({ bookings: env.bookings(), mappings: [...mappings.data.values()], events, config });
    },
    /** Test and demo hook: makes Google reject the saved sign-in on the next call. */
    expireSignIn() { connection = { ...connection, state: "needs_reconnect" }; }
  };
}
export type PreviewCalendar = ReturnType<typeof createPreviewCalendar>;
