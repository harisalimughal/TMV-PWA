import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import type { Server } from "node:http";
import type { Job, DriverProfile } from "../src/jobs/job.types";

const state = vi.hoisted(() => ({ docs: new Map<string, Map<string, any>>(), jobs: [] as any[], activity: [] as any[], drivers: [] as any[] }));
vi.mock("../src/db/mongo", () => ({
  getDb: async () => ({ collection: (name: string) => {
    const docs = state.docs.get(name) || new Map<string, any>(); state.docs.set(name, docs);
    return {
      find: () => ({ toArray: async () => structuredClone([...docs.values()]) }),
      findOne: async ({ _id }: any) => structuredClone(docs.get(_id) || null),
      insertOne: async (doc: any) => { if (docs.has(doc._id)) throw { code: 11000 }; docs.set(doc._id, structuredClone(doc)); },
      findOneAndUpdate: async (query: any, update: any) => {
        const old = docs.get(query._id); if (!old || old.value.version !== query["value.version"]) return null;
        const next = { ...old, ...structuredClone(update.$set) }; docs.set(query._id, next); return structuredClone(next);
      },
      updateOne: async (query: any, update: any) => {
        const old = docs.get(query._id); docs.set(query._id, { _id: query._id, upToId: old && old.upToId > update.$max.upToId ? old.upToId : update.$max.upToId });
      }
    };
  } }),
  activityCollection: async () => ({ find: (query: any) => ({ toArray: async () => structuredClone(state.activity.filter(a => !query.jobId || query.jobId === a.jobId)) }) })
}));
vi.mock("../src/db/jobs.repo", () => ({ listJobs: async () => structuredClone(state.jobs), getJob: async (id: string) => structuredClone(state.jobs.find(j => j.jobId === id) || null) }));
vi.mock("../src/auth/driver-account.service", () => ({ listDriverProfiles: async () => structuredClone(state.drivers) }));
vi.mock("../src/db/activity.repo", () => ({ listActivityForJob: async (id: string) => structuredClone(state.activity.filter(a => a.jobId === id)) }));

import { dashboardBookingRoutes } from "../src/booking/routes";
import { bookingFromJob, resourceAvailability } from "../src/booking/legacy";
import { activityEntry, activityPage, dashboardActivityRoutes } from "../src/admin/dashboard/activity.routes";
import { requireAdminAuth } from "../src/auth/require-admin-auth";
import { setAdminSessionCookie } from "../src/auth/admin-session";
import { EMPTY_DRAFT } from "../src/booking/validation";

const job = { jobId: "TMV-existing", calendarEventId: "original-calendar-id", customerName: "Fixture Customer", customerEmail: "fixture@example.invalid", customerPhone: "",
  pickup: "Original pickup", dropoff: "Original destination", stopBy: "", driverInitials: "AA", status: "COMPLETED", bookedStart: "2026-10-20T09:00:00.000Z", bookedFinish: "2026-10-20T11:00:00.000Z",
  bookedMinutes: 120, basePrice: 170, amountCharged: 19900, paidOnline: true, crewSize: 2, currentState: "COMPLETED", createdAt: "2026-10-01T09:00:00.000Z", updatedAt: "2026-10-20T12:00:00.000Z" } as Job;
const driver = { initials: "AA", fullName: "Fixture Driver", active: true, vanRegistration: "FIXTURE" } as DriverProfile;
const draft = { ...EMPTY_DRAFT, customerName: "New Fixture", phone: "07700900000", pickupAddress: "Pickup", pickupPostcode: "SW1A 1AA", dropoffAddress: "Dropoff", dropoffPostcode: "E1 6AN", vanType: "Large van", helpers: "2", hours: "2", date: "2099-10-20", startTime: "10:00" };
let server: Server, base: string, cookie: string;
const call = async (path: string, body?: unknown, authenticated = true) => {
  const response = await fetch(`${base}/api/admin${path}`, { method: body === undefined ? "GET" : "POST", headers: { ...(authenticated ? { Cookie: cookie } : {}), "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, data: await response.json() };
};

beforeAll(async () => {
  const app = express(); app.use(express.json(), cookieParser());
  app.post("/test-session", (_req, res) => { setAdminSessionCookie(res); res.json({ ok: true }); });
  app.use("/api/admin", requireAdminAuth, dashboardActivityRoutes(), dashboardBookingRoutes());
  server = await new Promise<Server>(resolve => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); });
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  cookie = (await fetch(`${base}/test-session`, { method: "POST" })).headers.get("set-cookie")!.split(";")[0];
});
afterAll(() => new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())));
beforeEach(() => {
  state.docs.clear(); state.jobs = [structuredClone(job)]; state.drivers = [structuredClone(driver)];
  state.activity = [1, 2, 3, 4].map(n => ({ _id: `row-${n}`, jobId: job.jobId, driver: "AA", action: "ORIGINAL_ACTION", detail: `Original detail ${n}`, timestamp: `2026-10-20T10:00:0${n}.000Z` }));
});

describe("new frontend preservation and API integration", () => {
  it("requires an admin session for new read and write APIs", async () => {
    expect((await call("/bookings", undefined, false)).status).toBe(401);
    expect((await call("/enquiries", { draft, idempotencyKey: "unauthorized" }, false)).status).toBe(401);
    expect((await call("/activity", undefined, false)).status).toBe(401);
    expect(state.docs.size).toBe(0);
  });
  it("projects all legacy job identifiers and leaves financial unknowns unknown", async () => {
    const before = structuredClone(state.jobs);
    const response = await call("/bookings");
    expect(response.status).toBe(200);
    expect(response.data.items[0]).toMatchObject({ id: job.jobId, jobId: job.jobId, customer: { name: job.customerName }, requirements: { helpers: null }, allowedActions: ["open_job"], payments: { collectedPence: null, outstandingPence: null, state: "unknown" } });
    expect(state.jobs).toEqual(before);
    expect(state.jobs[0].calendarEventId).toBe("original-calendar-id");
    expect(state.jobs[0].amountCharged).toBe(19900);
  });
  it("keeps the completed attempt's captured driver identity after Calendar reassignment", () => {
    const result = bookingFromJob({ ...job, driverInitials: "BB", reportIdentity: { initials: "AA", name: "Captured Driver", email: null, vehicleImei: null, source: "fixture" } }, [driver]);
    expect(result.assignment).toMatchObject({ driverInitials: "AA", driverName: "Captured Driver", vehicle: null });
  });
  it("blocks unsupported mutations without changing jobs, history or enquiries", async () => {
    const before = structuredClone({ jobs: state.jobs, activity: state.activity });
    for (const path of ["/bookings", `/bookings/${job.jobId}/cancel`, "/schedule/moves", "/assignments"]) expect((await call(path, { bookingId: job.jobId, reason: "fixture" })).status).toBe(409);
    expect({ jobs: state.jobs, activity: state.activity }).toEqual(before);
    expect(state.docs.size).toBe(0);
  });
  it("returns real jobs in the schedule, blocks moves, and never declares unknown shifts available", async () => {
    state.jobs[0].status = "READY";
    const response = await call("/schedule?from=2026-10-20T08:00:00Z&to=2026-10-20T12:00:00Z");
    expect(response.data.items[0]).toMatchObject({ bookingId: job.jobId, allowedActions: [] });
    expect(response.data.resources[0].state).toBe("busy");
    expect(resourceAvailability([driver], [], "2026-10-20T08:00:00Z", "2026-10-20T12:00:00Z")[0].state).toBe("unknown");
    expect((await call("/schedule?from=invalid&to=invalid")).status).toBe(422);
  });
  it("saves an enquiry once across retries and rejects reuse with different customer data", async () => {
    const first = await call("/enquiries", { draft, idempotencyKey: "save-once" });
    const retry = await call("/enquiries", { draft, idempotencyKey: "save-once" });
    expect(first.status).toBe(201); expect(retry.data.id).toBe(first.data.id);
    expect((await call("/enquiries", { draft: { ...draft, customerName: "Different" }, idempotencyKey: "save-once" })).status).toBe(409);
    expect(state.docs.get("booking_enquiries")?.size).toBe(1);
    expect(state.jobs).toEqual([job]);
  });
  it("retains every manual quote and rejects stale edits", async () => {
    const { data: e } = await call("/enquiries", { draft, idempotencyKey: "quotes" });
    const first = await call(`/enquiries/${e.id}/manual-quote`, { version: 1, totalPence: 10000, reason: "Original price" });
    expect(first.data.quotation.versions).toHaveLength(1);
    expect((await call(`/enquiries/${e.id}/close`, { version: 1 })).status).toBe(409);
    const second = await call(`/enquiries/${e.id}/manual-quote`, { version: 2, totalPence: 12000, reason: "Additional inventory" });
    expect(second.data.quotation.versions.map((v: any) => v.totalPence)).toEqual([10000, 12000]);
    expect(second.data.allowedActions).not.toContain("confirm");
    expect(second.data.history).toHaveLength(3);
  });
  it("validates submitted details and preserves an existing enquiry when a write is invalid", async () => {
    expect((await call("/enquiries", { draft: { ...draft, customerName: "" }, idempotencyKey: "bad" })).status).toBe(422);
    const { data: e } = await call("/enquiries", { draft, idempotencyKey: "good" });
    expect((await call(`/enquiries/${e.id}/manual-quote`, { version: 1, totalPence: 10.5, reason: "invalid" })).status).toBe(422);
    expect((await call(`/enquiries/${e.id}`)).data).toEqual(e);
  });
  it("reads the old audit trail with stable IDs, chronological paging and persistent forward-only read markers", async () => {
    const before = structuredClone(state.activity);
    const first = await call(`/jobs/${job.jobId}/activity?limit=2`);
    expect(first.data.items.map((e: any) => e.body)).toEqual(["Original detail 3", "Original detail 4"]);
    const older = await call(`/jobs/${job.jobId}/activity?limit=2&before=${encodeURIComponent(first.data.olderCursor)}`);
    expect(older.data.items.map((e: any) => e.body)).toEqual(["Original detail 1", "Original detail 2"]);
    expect((await call("/activity/unread")).data.total).toBe(4);
    expect((await call(`/jobs/${job.jobId}/activity/read`, { upToId: first.data.nextCursor })).status).toBe(200);
    await call(`/jobs/${job.jobId}/activity/read`, { upToId: older.data.nextCursor });
    expect((await call("/activity/unread")).data.total).toBe(0);
    expect((await call(`/jobs/${job.jobId}/activity/read`, { upToId: "other-job-cursor" })).status).toBe(400);
    expect((await call(`/jobs/${job.jobId}/activity`)).data.items.at(-1).id).toBe(first.data.nextCursor);
    expect(state.activity).toEqual(before);
  });
  it("does not skip entries during incremental recovery", () => {
    const entries = state.activity.map(activityEntry);
    const batch = activityPage(entries, { after: entries[0].id }, 2, true);
    expect(batch.items.map(e => e.body)).toEqual(["Original detail 2", "Original detail 3"]);
    expect(activityPage(entries, { after: batch.nextCursor }, 2, true).items.map(e => e.body)).toEqual(["Original detail 4"]);
  });
  it("reports missing Booking OS revenue rather than counting Calendar confirmation as collected money", async () => {
    const response = await call("/bookings/summary?from=2026-10-01T00:00:00Z&to=2026-11-01T00:00:00Z");
    expect(response.data.sample).toBe(false); expect(response.data.bookingRevenuePence.value).toBeNull();
    expect(response.data.confirmedBookings.value).toBeNull();
    expect(response.data.driverUtilizationPct.value).toBeNull();
    expect((await call("/integrations/google-calendar")).status).toBe(501);
  });
});
