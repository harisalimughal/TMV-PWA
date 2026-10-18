import { describe, expect, it } from "vitest";
import {
  ACTIVITY_EVENTS, ACTIVITY_EVENT_BY_TYPE, LEGACY_EVENT_TYPE, MESSAGE_TYPES, activityProblems, canSendMessage, canViewConversation,
  fromLegacyActivity, isValidActivity, messageProblems, newClientRequestId, requestIdempotencyKey, systemIdempotencyKey, type ActivityMessage
} from ".";
import { STEPS } from "../../screens/workflow/steps";

// The real client source, read as text, so the catalogue is checked against what the apps send.
const raw = (files: Record<string, string>) => Object.values(files)[0];
const workflow = raw(import.meta.glob("../../screens/JobWorkflowScreen.tsx", { query: "?raw", import: "default", eager: true }) as Record<string, string>);
const driverApi = raw(import.meta.glob("../../api/jobs.ts", { query: "?raw", import: "default", eager: true }) as Record<string, string>);
const adminApi = raw(import.meta.glob("../../screens/admin/dashboard/api.ts", { query: "?raw", import: "default", eager: true }) as Record<string, string>);

const at = "2026-10-15T09:00:00.000Z";
const base = (patch: Partial<ActivityMessage>): ActivityMessage => ({
  id: "a1", jobId: "TMV-1", kind: "operational", type: "job.started", category: "lifecycle", actor: { role: "driver", driverInitials: "KA", displayName: "Caio" },
  title: "Driver started the job", occurredAt: at, recordedAt: at, source: "driver_app", verification: "driver_submitted", idempotencyKey: "req:TMV-1:job.started:r1", ...patch
});
const message = (patch: Partial<ActivityMessage>): ActivityMessage => ({
  id: "m1", jobId: "TMV-1", kind: "message", type: "message.admin_to_driver", category: "message", actor: { role: "admin", adminId: "a", displayName: "Office" },
  title: "Message", body: "Call me", occurredAt: at, recordedAt: at, source: "admin_dashboard", verification: "not_applicable", idempotencyKey: "req:TMV-1:message.admin_to_driver:c1", ...patch
});

describe("event catalogue is the real workflow", () => {
  it("has unique types and no message types mixed in", () => {
    const types = ACTIVITY_EVENTS.map(event => event.type);
    expect(new Set(types).size).toBe(types.length);
    for (const type of MESSAGE_TYPES) expect(ACTIVITY_EVENT_BY_TYPE.has(type)).toBe(false);
  });

  it("every driver action it names is one the driver app really sends", () => {
    for (const event of ACTIVITY_EVENTS.filter(e => e.actorRole === "driver" && e.trigger.action)) {
      expect(workflow, `${event.type} -> ${event.trigger.action}`).toContain(`"${event.trigger.action}"`);
    }
  });

  it("every endpoint it names exists in the driver or admin API client", () => {
    const paths: Array<[string, string]> = [
      ["POST /api/jobs/:id/viewed", "/viewed"], ["POST /api/jobs/:id/on-my-way", "/on-my-way"], ["POST /api/jobs/:id/start", "/start"],
      ["POST /api/jobs/:id/evidence", "/evidence"], ["POST /api/jobs/:id/signature", "/signature"], ["POST /api/jobs/:id/driver-summary", "/driver-summary"],
      ["POST /api/jobs/:id/scenarios/:scenario", "/scenarios/"]
    ];
    for (const [named, fragment] of paths) {
      expect(ACTIVITY_EVENTS.some(e => e.trigger.endpoint === named), named).toBe(true);
      expect(driverApi, named).toContain(fragment);
    }
    for (const [named, fragment] of [["POST /api/admin/jobs/:id/reassign", "/reassign"], ["POST /api/admin/jobs/:id/finish-manually", "/finish-manually"], ["POST /api/admin/jobs/:id/review", "/review"], ["POST /api/admin/jobs", "/api/admin/jobs"]] as const) {
      expect(ACTIVITY_EVENTS.some(e => e.trigger.endpoint === named), named).toBe(true);
      expect(adminApi, named).toContain(fragment);
    }
    expect(adminApi).toContain("/evidence/");
  });

  it("every workflow state it names is a real step", () => {
    for (const event of ACTIVITY_EVENTS) {
      for (const state of (event.trigger.atState ?? "").split("|").map(part => part.trim()).filter(Boolean)) {
        if (state.includes("*")) { expect(Object.keys(STEPS).some(key => new RegExp(`^${state.replace(/\*/g, ".*")}$`).test(key)), state).toBe(true); continue; }
        expect(Object.keys(STEPS), `${event.type} at ${state}`).toContain(state);
      }
    }
  });

  it("invents no steps the app does not have", () => {
    const titles = ACTIVITY_EVENTS.map(event => event.title.toLowerCase()).join(" | ");
    for (const invented of ["loading started", "loading completed", "unloading started", "unloading completed", "departed from pickup"]) expect(titles).not.toContain(invented);
  });

  it("keeps each source honest: driver steps are driver-submitted, GPS is only an observation", () => {
    for (const event of ACTIVITY_EVENTS) {
      if (event.source === "gps_tracker") { expect(event.verification).toBe("tracker_observed"); expect(event.actorRole).toBe("system"); expect(event.caveat).toBeTruthy(); }
      if (event.actorRole === "driver") { expect(event.source).toBe("driver_app"); expect(event.verification).toBe("driver_submitted"); }
      if (event.actorRole === "admin") { expect(event.source).toBe("admin_dashboard"); expect(event.verification).toBe("admin_recorded"); }
      if (event.verification === "tracker_observed") expect(event.title.toLowerCase()).toMatch(/detected/);
    }
  });
});

describe("invariants", () => {
  it("accepts well-formed events and messages", () => {
    expect(activityProblems(base({}))).toEqual([]);
    expect(isValidActivity(message({}))).toBe(true);
    expect(isValidActivity(message({ type: "message.driver_to_admin", actor: { role: "driver", driverInitials: "KA", displayName: "Caio" }, source: "driver_app" }))).toBe(true);
  });

  it("a direct message can never pose as a confirmed event", () => {
    expect(isValidActivity(message({ verification: "driver_submitted" }))).toBe(false);
    expect(isValidActivity(message({ type: "job.completed" }))).toBe(false);
    expect(isValidActivity(message({ actor: { role: "system", displayName: "System" } }))).toBe(false);
    expect(isValidActivity(message({ type: "message.admin_to_driver", actor: { role: "driver", driverInitials: "KA", displayName: "Caio" }, source: "driver_app" }))).toBe(false);
    expect(isValidActivity(message({ body: "   " }))).toBe(false);
  });

  it("an event cannot be attributed to the wrong actor, source or certainty", () => {
    expect(isValidActivity(base({ actor: { role: "admin", adminId: "a", displayName: "Office" } }))).toBe(false);
    expect(isValidActivity(base({ source: "admin_dashboard" }))).toBe(false);
    expect(isValidActivity(base({ verification: "tracker_observed" }))).toBe(false);
    expect(isValidActivity(base({ type: "driver.invented" }))).toBe(false);
    expect(isValidActivity(base({ actor: { role: "driver", displayName: "Caio" } }))).toBe(false);
  });

  it("a tracker reading stays a system observation", () => {
    const tracker = base({ type: "tracker.dropoff_arrival_detected", category: "tracking", stop: "dropoff", actor: { role: "system", displayName: "System" }, source: "gps_tracker", verification: "tracker_observed", title: "Tracker detected the van near the drop-off" });
    expect(isValidActivity(tracker)).toBe(true);
    expect(isValidActivity({ ...tracker, actor: { role: "driver", driverInitials: "KA", displayName: "Caio" }, source: "driver_app", verification: "driver_submitted" })).toBe(false);
  });

  it("rejects bad times and client messages", () => {
    expect(isValidActivity(base({ occurredAt: "yesterday" }))).toBe(false);
    expect(messageProblems({ clientMessageId: "c", body: "hello" })).toEqual([]);
    expect(messageProblems({ clientMessageId: "", body: "hello" })).toHaveLength(1);
    expect(messageProblems({ clientMessageId: "c", body: "x".repeat(1001) })).toHaveLength(1);
  });
});

describe("idempotency", () => {
  it("is stable for a retry and distinct for a new action", () => {
    const first = newClientRequestId();
    expect(requestIdempotencyKey("TMV-1", "job.started", first)).toBe(requestIdempotencyKey("TMV-1", "job.started", first));
    expect(requestIdempotencyKey("TMV-1", "job.started", first)).not.toBe(requestIdempotencyKey("TMV-1", "job.started", newClientRequestId()));
    expect(systemIdempotencyKey("TMV-1", "tracker.pickup_arrival_detected", "2026-10-15T08:56:00Z")).toBe("sys:TMV-1:tracker.pickup_arrival_detected:2026-10-15T08:56:00Z");
  });
});

describe("who can see and send", () => {
  const job = { jobId: "TMV-1", driverInitials: "KA" };
  it("a driver sees only jobs assigned to them, and loses access on reassignment", () => {
    expect(canViewConversation({ role: "driver", driverInitials: "KA" }, job)).toBe(true);
    expect(canViewConversation({ role: "driver", driverInitials: "TI" }, job)).toBe(false);
    expect(canViewConversation({ role: "driver" }, job)).toBe(false);
    expect(canViewConversation({ role: "driver", driverInitials: "KA" }, { ...job, driverInitials: "TI" })).toBe(false);
  });
  it("an admin can message only when a driver is assigned", () => {
    expect(canSendMessage({ role: "admin" }, job)).toBe(true);
    expect(canSendMessage({ role: "admin" }, { ...job, driverInitials: "" })).toBe(false);
    expect(canSendMessage({ role: "driver", driverInitials: "TI" }, job)).toBe(false);
  });
});

describe("adapter from the existing audit trail", () => {
  const trail = [
    { timestamp: "2026-10-15T08:15:00Z", driver: "KA", action: "ON_MY_WAY", fromState: "READY" },
    { timestamp: "2026-10-15T14:05:00Z", driver: "System", action: "JOB_COMPLETED", toState: "COMPLETED", detail: "All steps done" },
    { timestamp: "not a date", driver: "KA", action: "BROKEN" },
    { timestamp: "2026-10-15T08:15:00Z", driver: "KA", action: "JOB_VIEWED" }
  ];
  it("orders by time, drops undated entries and never upgrades an unverified action", () => {
    const out = fromLegacyActivity("TMV-1", trail);
    expect(out.map(entry => entry.metadata?.originalAction)).toEqual(["ON_MY_WAY", "JOB_VIEWED", "JOB_COMPLETED"]);
    for (const entry of out) { expect(entry.type).toBe(LEGACY_EVENT_TYPE); expect(entry.verification).toBe("system_recorded"); expect(isValidActivity(entry)).toBe(true); }
    expect(new Set(out.map(entry => entry.id)).size).toBe(out.length);
    expect(out[2].body).toBe("All steps done");
    expect(out[0].actor).toMatchObject({ role: "driver", driverInitials: "KA" });
    expect(out[2].actor.role).toBe("system");
  });
  it("maps to a catalogue event only through an explicit, verified table", () => {
    const out = fromLegacyActivity("TMV-1", trail, { actionMap: { ON_MY_WAY: "driver.on_my_way" }, driverName: code => (code === "KA" ? "Caio" : code) });
    const mapped = out.find(entry => entry.metadata?.originalAction === "ON_MY_WAY")!;
    expect(mapped).toMatchObject({ type: "driver.on_my_way", verification: "driver_submitted", source: "driver_app", title: "Driver is on the way" });
    expect(mapped.actor.displayName).toBe("Caio");
    expect(isValidActivity(mapped)).toBe(true);
    expect(fromLegacyActivity("TMV-1", undefined)).toEqual([]);
  });
});
