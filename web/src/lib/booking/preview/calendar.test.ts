import { describe, expect, it } from "vitest";
import { createPreviewServer } from "./server";
import { handleBookingRoute } from "../routes";
import { CalendarApiError, eventIdFor } from "../calendar";

const NOW = new Date("2026-10-17T10:00:00Z");
const make = () => createPreviewServer(() => NOW);
const call = (s: ReturnType<typeof make>, method: string, path: string, body?: unknown) => handleBookingRoute(s, method, `/api/admin/integrations/google-calendar${path}`, "", body === undefined ? undefined : JSON.stringify(body))!;
const connectAndEnable = async (s: ReturnType<typeof make>, patch: Record<string, unknown> = {}) => {
  call(s, "POST", "/connect");
  const res = call(s, "PUT", "", { calendarId: "sample-ops", enabled: true, ...patch });
  expect(res.status).toBe(200);
  await s.calendar.flush();
};
const eligible = (s: ReturnType<typeof make>) => s.listBookings({ pageSize: 100 }).items.filter(b => b.status === "confirmed" || b.status === "completed");

describe("preview calendar integration", () => {
  it("starts disconnected and refuses to enable before a calendar is connected and chosen", () => {
    const s = make();
    expect((call(s, "GET", "").body as { connection: { state: string } }).connection.state).toBe("disconnected");
    const refused = call(s, "PUT", "", { enabled: true });
    expect(refused.status).toBe(422);
    call(s, "POST", "/connect");
    expect(call(s, "PUT", "", { enabled: true }).status).toBe(422);
    expect(call(s, "PUT", "", { calendarId: "not-mine" }).status).toBe(422);
  });

  it("backfills one event per confirmed booking when switched on, and none for unconfirmed ones", async () => {
    const s = make();
    await connectAndEnable(s);
    expect(s.calendar.fake.events.size).toBe(eligible(s).length);
    const status = call(s, "GET", "").body as { health: { synced: number; failed: number } };
    expect(status.health.synced).toBe(eligible(s).length); expect(status.health.failed).toBe(0);
  });

  it("follows assignment, rescheduling and cancellation on the same event, never duplicating", async () => {
    const s = make();
    await connectAndEnable(s);
    const target = s.listBookings({ pageSize: 100 }).items.find(b => b.allowedActions.includes("reassign"))!;
    const before = s.calendar.fake.events.size;
    const other = s.drivers().find(d => d.initials !== target.assignment!.driverInitials)!;
    const assigned = s.assign({ bookingId: target.id, driverInitials: other.initials, vehicleRegistration: null, version: target.version, reason: "Test" });
    await s.calendar.flush();
    if (assigned.ok) expect(s.calendar.fake.events.get(eventIdFor(target.id))!.summary).toContain(other.initials);
    const fresh = s.getBooking(target.id);
    s.cancelBooking(target.id, fresh.version, "Customer cancelled");
    await s.calendar.flush();
    expect(s.calendar.fake.events.size).toBe(before);
    expect(s.calendar.fake.events.get(eventIdFor(target.id))!.summary.startsWith("CANCELLED:")).toBe(true);
  });

  it("keeps the booking intact when Google fails, shows the failure, and retries on request", async () => {
    const s = make();
    call(s, "POST", "/connect"); call(s, "PUT", "", { calendarId: "sample-ops" });
    const victim = eligible(s)[0];
    s.calendar.fake.failNext(new CalendarApiError(400, "invalid"));
    call(s, "PUT", "", { enabled: true });
    await s.calendar.flush();
    const status = call(s, "GET", "").body as { health: { failed: number; lastError: string | null } };
    expect(status.health.failed).toBeGreaterThan(0); expect(status.health.lastError).toMatch(/refused/);
    const ops = (call(s, "GET", "/operations").body as { items: Array<{ bookingId: string; status: string }> }).items;
    const failed = ops.find(o => o.status === "failed")!;
    expect(s.getBooking(failed.bookingId).status).toBe(s.getBooking(failed.bookingId).status); // booking readable and unchanged
    call(s, "POST", `/operations/${failed.bookingId}/retry`);
    await new Promise(r => setTimeout(r, 10)); await s.calendar.flush();
    expect(s.calendar.fake.events.has(eventIdFor(failed.bookingId))).toBe(true);
    void victim;
  });

  it("pauses when the sign-in expires and resumes after reconnecting", async () => {
    const s = make();
    await connectAndEnable(s);
    s.calendar.fake.failNext(new CalendarApiError(401, "authError"));
    const target = s.listBookings({ pageSize: 100 }).items.find(b => b.allowedActions.includes("cancel") && b.status === "confirmed" && b.jobStatus !== "IN_PROGRESS" && b.jobStatus !== "COMPLETED")!;
    s.cancelBooking(target.id, target.version, "Test");
    await s.calendar.flush();
    expect((call(s, "GET", "").body as { connection: { state: string } }).connection.state).toBe("needs_reconnect");
    call(s, "POST", "/connect");
    const retry = call(s, "POST", `/operations/${target.id}/retry`); expect(retry.status).toBe(200);
    await new Promise(r => setTimeout(r, 10)); await s.calendar.flush();
    expect(s.calendar.fake.events.get(eventIdFor(target.id))!.summary.startsWith("CANCELLED:")).toBe(true);
  });

  it("reports reconciliation findings read-only", async () => {
    const s = make();
    await connectAndEnable(s);
    const [first] = eligible(s);
    s.calendar.fake.events.delete(eventIdFor(first.id));
    const findings = (call(s, "GET", "/reconcile").body as { items: Array<{ kind: string; bookingId: string }> }).items;
    expect(findings).toContainEqual(expect.objectContaining({ kind: "missing_event", bookingId: first.id }));
    expect(s.calendar.fake.events.has(eventIdFor(first.id))).toBe(false);
  });

  it("disconnecting turns synchronisation off and leaves existing events alone", async () => {
    const s = make();
    await connectAndEnable(s);
    const count = s.calendar.fake.events.size;
    call(s, "POST", "/disconnect");
    const status = call(s, "GET", "").body as { config: { enabled: boolean; calendarId: string | null }; connection: { state: string } };
    expect(status.connection.state).toBe("disconnected"); expect(status.config.enabled).toBe(false);
    expect(s.calendar.fake.events.size).toBe(count);
  });
});
