import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSampleStore } from "../preview/sample";
import type { Booking } from "../types";
import { CalendarApiError, KeyedMutex, MAX_ATTEMPTS, backoffMs, classifyError, eventIdFor, planSync, reconcile, syncBooking, newMapping, FakeCalendar, MemoryMappings, DEFAULT_CALENDAR_CONFIG, type CalendarConfig, type EngineDeps } from "./index";

const NOW = new Date("2026-10-17T10:00:00Z");
const CAL = "cal-1";
const config = (patch: Partial<CalendarConfig> = {}): CalendarConfig => ({ ...DEFAULT_CALENDAR_CONFIG, enabled: true, calendarId: CAL, appBaseUrl: "https://dash.example.test", ...patch, include: { ...DEFAULT_CALENDAR_CONFIG.include, ...(patch.include ?? {}) } });

let bookings: Map<string, Booking>, fake: FakeCalendar, mappings: MemoryMappings, cfg: CalendarConfig, auth: string[], clock: Date;
const confirmed = () => [...bookings.values()].find(b => b.status === "confirmed" && b.assignment?.status === "confirmed")!;
const deps = (extra: Partial<EngineDeps> = {}): EngineDeps => ({ getBooking: async id => (bookings.has(id) ? structuredClone(bookings.get(id)!) : null), mappings, client: fake, config: () => cfg, now: () => clock, lock: new KeyedMutex(), onAuthFailure: m => auth.push(m), ...extra });
const change = (id: string, patch: Partial<Booking>) => { const b = bookings.get(id)!; Object.assign(b, patch, { version: b.version + 1 }); };

beforeEach(() => {
  const store = createSampleStore(NOW);
  bookings = new Map(structuredClone(store.bookings).map(b => [b.id, b]));
  fake = new FakeCalendar(); mappings = new MemoryMappings(); cfg = config(); auth = []; clock = new Date(NOW);
});

describe("event ids and formatting helpers", () => {
  it("makes valid, stable, distinct Google event ids", () => {
    const a = eventIdFor("bk-1"), b = eventIdFor("bk-2");
    expect(a).toMatch(/^[0-9a-v]{5,1024}$/); expect(a).toBe(eventIdFor("bk-1")); expect(a).not.toBe(b);
  });
});

describe("creation", () => {
  it("creates one event for a confirmed booking, saves the mapping and records the status", async () => {
    const b = confirmed();
    const r = await syncBooking(b.id, deps());
    expect(r.outcome).toBe("created");
    expect(fake.events.size).toBe(1);
    expect(r.mapping).toMatchObject({ status: "synced", eventId: eventIdFor(b.id), calendarId: CAL, syncedVersion: b.version, attempts: 0, lastError: null });
  });

  it("does not mirror unconfirmed bookings unless configured, then marks them tentative", async () => {
    const pending = [...bookings.values()].find(b => b.status === "pending_payment");
    if (!pending) return;
    expect((await syncBooking(pending.id, deps())).outcome).toBe("skipped");
    expect(fake.events.size).toBe(0);
    cfg = config({ syncUnconfirmed: true });
    expect((await syncBooking(pending.id, deps())).outcome).toBe("created");
    const event = [...fake.events.values()][0];
    expect(event.status).toBe("tentative"); expect(event.summary).toMatch(/^TENTATIVE:/);
  });

  it("keeps work pending (not lost, not failed) while sync is off or no calendar is chosen", async () => {
    cfg = config({ enabled: false });
    const r = await syncBooking(confirmed().id, deps());
    expect(r).toMatchObject({ outcome: "skipped", mapping: { status: "pending" } });
    cfg = config({ calendarId: null });
    expect((await syncBooking(confirmed().id, deps())).mapping.status).toBe("pending");
    expect(fake.events.size).toBe(0);
    cfg = config();
    expect((await syncBooking(confirmed().id, deps())).outcome).toBe("created");
  });
});

describe("no duplicates", () => {
  it("makes one event from many simultaneous requests", async () => {
    const d = deps();
    const id = confirmed().id;
    const results = await Promise.all(Array.from({ length: 6 }, () => syncBooking(id, d)));
    expect(fake.events.size).toBe(1);
    expect(fake.calls.insert).toBe(1);
    expect(results.filter(r => r.outcome === "created")).toHaveLength(1);
  });

  it("adopts the existing event when the id was lost after Google created it", async () => {
    const id = confirmed().id;
    await syncBooking(id, deps());
    mappings.data.delete(id); // crash before the id was saved
    const r = await syncBooking(id, deps());
    expect(fake.events.size).toBe(1);
    expect(r.outcome).toBe("created");
    expect(r.mapping.eventId).toBe(eventIdFor(id));
  });

  it("does nothing when nothing changed", async () => {
    const id = confirmed().id;
    await syncBooking(id, deps());
    const patches = fake.calls.patch, inserts = fake.calls.insert;
    expect((await syncBooking(id, deps())).outcome).toBe("noop");
    expect([fake.calls.patch, fake.calls.insert]).toEqual([patches, inserts]);
  });
});

describe("updates", () => {
  it("updates the same event for reschedule, driver change, locations, requirements and status", async () => {
    const b = confirmed();
    await syncBooking(b.id, deps());
    const eventId = eventIdFor(b.id);
    const edits: Array<[string, Partial<Booking>]> = [
      ["time", { start: new Date(Date.parse(b.start) + 3600000).toISOString(), end: new Date(Date.parse(b.end) + 3600000).toISOString() }],
      ["driver", { assignment: { ...b.assignment!, driverInitials: "ZZ", driverName: "Zed Zed" } }],
      ["location", { dropoff: { line: "9 New Road", postcode: "N1 9AA" } }],
      ["requirements", { requirements: { ...b.requirements, helpers: (b.requirements.helpers ?? 1) + 1 } }],
      ["status", { status: "completed", jobStatus: "COMPLETED" }]
    ];
    for (const [label, patch] of edits) {
      change(b.id, patch);
      expect((await syncBooking(b.id, deps())).outcome, label).toBe("updated");
      expect(fake.events.size).toBe(1);
    }
    const final = fake.events.get(eventId)!;
    expect(final.summary).toContain("ZZ"); expect(final.location).not.toBe("");
    expect(final.description).toContain("Completed");
  });

  it("never lets an older run overwrite a newer synchronised version", async () => {
    const b = confirmed();
    change(b.id, { version: b.version + 5 }); // jumps ahead
    const newest = bookings.get(b.id)!.version;
    await syncBooking(b.id, deps());
    const stale = structuredClone(bookings.get(b.id)!); stale.version = newest - 3;
    const r = await syncBooking(b.id, deps({ getBooking: async () => structuredClone(stale) }));
    expect(r.outcome).toBe("noop");
    expect(mappings.data.get(b.id)!.syncedVersion).toBe(newest);
  });

  it("recreates an event someone deleted by hand", async () => {
    const b = confirmed();
    await syncBooking(b.id, deps());
    fake.events.delete(eventIdFor(b.id));
    change(b.id, { notes: undefined } as Partial<Booking>);
    change(b.id, { start: new Date(Date.parse(b.start) + 900000).toISOString() });
    expect((await syncBooking(b.id, deps())).outcome).toBe("updated");
    expect(fake.events.size).toBe(1);
  });
});

describe("cancellation", () => {
  it("marks the event as cancelled and keeps it, once", async () => {
    const b = confirmed();
    await syncBooking(b.id, deps());
    change(b.id, { status: "cancelled" });
    expect((await syncBooking(b.id, deps())).outcome).toBe("cancelled");
    const ev = fake.events.get(eventIdFor(b.id))!;
    expect(ev.summary.startsWith("CANCELLED:")).toBe(true); expect(ev.transparency).toBe("transparent");
    expect((await syncBooking(b.id, deps())).outcome).toBe("noop");
    expect(fake.calls.remove).toBe(0);
  });

  it("deletes the event when configured, tolerates it already being gone, and revives it on re-confirmation", async () => {
    cfg = config({ cancellation: "delete" });
    const b = confirmed();
    await syncBooking(b.id, deps());
    change(b.id, { status: "cancelled" });
    expect((await syncBooking(b.id, deps())).outcome).toBe("deleted");
    expect(fake.events.size).toBe(0);
    expect((await syncBooking(b.id, deps())).outcome).toBe("noop");
    change(b.id, { status: "confirmed" });
    expect((await syncBooking(b.id, deps())).outcome).toBe("created");
    expect(fake.events.size).toBe(1);
  });

  it("does not create an event for a booking that was cancelled before it was ever mirrored", async () => {
    const b = confirmed();
    change(b.id, { status: "cancelled" });
    expect((await syncBooking(b.id, deps())).outcome).toBe("skipped");
    expect(fake.events.size).toBe(0);
  });
});

describe("failures never touch the booking and back off", () => {
  it("retries transient errors with growing delay, then succeeds", async () => {
    const b = confirmed(); const before = structuredClone(bookings.get(b.id));
    fake.failNext(new CalendarApiError(503, "backendError"));
    const r1 = await syncBooking(b.id, deps());
    expect(r1).toMatchObject({ outcome: "retry_scheduled", mapping: { status: "pending", attempts: 1 } });
    expect(Date.parse(r1.mapping.nextAttemptAt!) - clock.getTime()).toBe(backoffMs(1));
    expect((await syncBooking(b.id, deps())).outcome).toBe("deferred"); // not yet due
    clock = new Date(clock.getTime() + 61_000);
    expect((await syncBooking(b.id, deps())).outcome).toBe("created");
    expect(bookings.get(b.id)).toEqual(before);
  });

  it("treats network interruption as transient and rate limits as retryable", async () => {
    expect(classifyError(new TypeError("fetch failed")).kind).toBe("transient");
    expect(classifyError(new CalendarApiError(429)).kind).toBe("rate_limited");
    expect(classifyError(new CalendarApiError(403, "userRateLimitExceeded")).kind).toBe("rate_limited");
    expect(classifyError(new CalendarApiError(403, "forbidden")).kind).toBe("permanent");
    const b = confirmed();
    fake.failNext(new TypeError("fetch failed"));
    expect((await syncBooking(b.id, deps())).outcome).toBe("retry_scheduled");
  });

  it("marks a permanent refusal as failed at once, and a repeating outage as failed after the limit", async () => {
    const b = confirmed();
    fake.failNext(new CalendarApiError(400, "invalid"));
    expect(await syncBooking(b.id, deps())).toMatchObject({ outcome: "failed", mapping: { status: "failed" } });
    const c = [...bookings.values()].filter(x => x.status === "confirmed")[1];
    for (let i = 0; i < MAX_ATTEMPTS; i++) { fake.failNext(new CalendarApiError(500)); clock = new Date(clock.getTime() + 3600_000 * 2); await syncBooking(c.id, deps()); }
    expect(mappings.data.get(c.id)!.status).toBe("failed");
    expect(mappings.data.get(c.id)!.attempts).toBe(MAX_ATTEMPTS);
  });

  it("pauses on expired credentials without burning retries, and resumes after reconnecting", async () => {
    const b = confirmed();
    fake.failNext(new CalendarApiError(401, "authError"));
    const r = await syncBooking(b.id, deps());
    expect(r.outcome).toBe("paused_auth");
    expect(r.mapping).toMatchObject({ status: "pending", attempts: 0 });
    expect(auth).toHaveLength(1);
    expect((await syncBooking(b.id, deps(), { force: true })).outcome).toBe("created");
  });

  it("can force a retry of a failed task", async () => {
    const b = confirmed();
    fake.failNext(new CalendarApiError(400, "invalid"));
    await syncBooking(b.id, deps());
    expect((await syncBooking(b.id, deps(), { force: true })).outcome).toBe("created");
  });
});

describe("compatible (legacy) format", () => {
  it("blocks rather than inventing a price", async () => {
    cfg = config({ format: "compatible" });
    const unpriced = [...bookings.values()].find(b => b.status === "confirmed" && b.payments.agreedPence === null);
    if (!unpriced) return;
    const r = await syncBooking(unpriced.id, deps());
    expect(r).toMatchObject({ outcome: "blocked", mapping: { status: "blocked" } });
    expect(fake.events.size).toBe(0);
  });
  it("writes the legacy title shape for a priced booking", async () => {
    cfg = config({ format: "compatible" });
    const priced = [...bookings.values()].find(b => b.status === "confirmed" && b.payments.agreedPence !== null && b.requirements.helpers !== null)!;
    await syncBooking(priced.id, deps());
    expect([...fake.events.values()][0].summary).toMatch(/^\d+ Men - £\d+(\.\d{2})? - \d{2}:\d{2} \/ Y - (\w+|TBC)$/);
  });
});

describe("privacy", () => {
  it("shows no phone, email, inventory, notes or price by default and only the postcode", async () => {
    const b = confirmed();
    await syncBooking(b.id, deps());
    const text = (([...fake.events.values()][0]) as { summary: string; description: string; location: string });
    const all = `${text.summary}\n${text.description}\n${text.location}`;
    expect(all).not.toContain(b.customer.phone!); expect(all).not.toContain(b.customer.email!);
    expect(all).not.toMatch(/£/); expect(all).not.toContain(b.pickup.line);
    expect(all).toContain(b.pickup.postcode);
    expect(text.description).toContain(`${cfg.appBaseUrl}/admin?section=bookings&view=bookings&booking=`);
    expect(text.description).toMatch(/not read back/);
  });
  it("includes more only when switched on", async () => {
    cfg = config({ include: { ...DEFAULT_CALENDAR_CONFIG.include, customerPhone: true, addresses: "full", inventory: true } });
    const b = confirmed();
    await syncBooking(b.id, deps());
    const d = [...fake.events.values()][0].description;
    expect(d).toContain(b.customer.phone!); expect(d).toContain(b.pickup.line);
  });
  it("is a plan, not a write, when only planning", () => {
    const b = confirmed();
    expect(planSync(b, newMapping(b.id), cfg).decision.action).toBe("create");
    expect(fake.calls.insert).toBe(0);
  });
});

describe("reconciliation", () => {
  const run = async () => reconcile({ bookings: [...bookings.values()], mappings: [...mappings.data.values()], events: await fake.list(CAL, "2000-01-01T00:00:00Z", "2100-01-01T00:00:00Z"), config: cfg });

  it("is clean after a full sync and read-only", async () => {
    for (const b of bookings.values()) await syncBooking(b.id, deps());
    const before = fake.events.size;
    expect((await run()).filter(f => f.kind !== "possible_legacy_event")).toEqual([]);
    expect(fake.events.size).toBe(before);
  });

  it("reports missing, drifted, duplicate, orphan and possible legacy events without touching them", async () => {
    const [a, b, c] = [...bookings.values()].filter(x => x.status === "confirmed");
    for (const x of [a, b, c]) await syncBooking(x.id, deps());
    fake.events.delete(eventIdFor(a.id));                                                       // missing
    fake.external({ id: eventIdFor(b.id), calendarId: CAL, extendedProperties: { private: { ...fake.events.get(eventIdFor(b.id))!.extendedProperties.private, tmvFingerprint: "stale" } } }); // drifted
    fake.external({ id: "dupe1", calendarId: CAL, summary: "x", description: "", location: "", start: { dateTime: c.start, timeZone: "Europe/London" }, end: { dateTime: c.end, timeZone: "Europe/London" }, transparency: "opaque", status: "confirmed", extendedProperties: { private: { tmvBookingId: c.id, tmvFingerprint: "x", tmvFormat: "private" } } }); // duplicate
    fake.external({ id: "ghost", calendarId: CAL, summary: "x", description: "", location: "", start: { dateTime: c.start, timeZone: "Europe/London" }, end: { dateTime: c.end, timeZone: "Europe/London" }, transparency: "opaque", status: "confirmed", extendedProperties: { private: { tmvBookingId: "gone", tmvFingerprint: "x", tmvFormat: "private" } } }); // orphan
    fake.external({ id: "legacy1", calendarId: CAL, summary: `2 Men - £170 - 09:00 / Y - AR ${a.reference}`, description: "", location: "", start: { dateTime: a.start, timeZone: "Europe/London" }, end: { dateTime: a.end, timeZone: "Europe/London" }, transparency: "opaque", status: "confirmed", extendedProperties: { private: {} } as never }); // legacy
    const kinds = (await run()).map(f => f.kind);
    for (const k of ["missing_event", "drifted", "duplicate_events", "orphan_event", "possible_legacy_event"]) expect(kinds).toContain(k);
    expect(fake.calls.remove).toBe(0);
  });
});

describe("mutex", () => {
  it("runs work for one key in order", async () => {
    const m = new KeyedMutex(), order: number[] = [];
    await Promise.all([1, 2, 3].map(n => m.run("k", async () => { await new Promise(r => setTimeout(r, 4 - n)); order.push(n); })));
    expect(order).toEqual([1, 2, 3]);
  });
  it("keeps going after a failure", async () => {
    const m = new KeyedMutex();
    await expect(m.run("k", async () => { throw new Error("x"); })).rejects.toThrow("x");
    await expect(m.run("k", async () => 5)).resolves.toBe(5);
  });
});
void vi;
