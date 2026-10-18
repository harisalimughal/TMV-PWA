import { beforeEach, describe, expect, it } from "vitest";
import { handle, resetStore } from "./handlers";
import type { JobUpdateResult } from "../api/jobs";

describe("mock job handlers", () => {
  beforeEach(() => {
    resetStore();
  });

  it("handles the on-my-way job action without advancing workflow state", () => {
    const res = handle("POST", "/api/jobs/10232/on-my-way");

    expect(res?.status).toBe(200);
    const body = res?.body as JobUpdateResult;
    expect(body.job.jobId).toBe("10232");
    expect(body.job.onMyWayAt).toEqual(expect.any(String));
    expect(body.job.status).toBe("READY");
    expect(body.job.currentState).toBe("READY");
  });
});

describe("mock driver record handlers", () => {
  beforeEach(() => {
    resetStore();
  });

  it("serves pending submissions instead of treating the path as a job id", () => {
    const res = handle("GET", "/api/jobs/pending-submissions");
    expect(res?.status).toBe(200);
    expect((res?.body as any).jobs.length).toBeGreaterThan(0);
  });

  it("serves seeded Liability history and records new submissions", () => {
    const before = (handle("GET", "/api/jobs/10231/scenarios")?.body as any).submissions.length;
    expect(before).toBeGreaterThan(0);
    handle("POST", "/api/jobs/10231/scenarios/checkin");
    const after = (handle("GET", "/api/jobs/10231/scenarios")?.body as any).submissions;
    expect(after).toHaveLength(before + 1);
    expect(after.at(-1).scenario).toBe("checkin");
    expect((handle("GET", "/api/jobs/NOPE/scenarios")?.body as any).submissions).toEqual([]);
  });

  it("acknowledges job views and reverse-geocodes coordinates", () => {
    expect(handle("POST", "/api/jobs/10231/viewed")?.status).toBe(200);
    const geo = handle("GET", "/api/jobs/geocode/reverse", undefined, "?lat=51.5&lng=-0.1")?.body as any;
    expect(geo.locationName).toEqual(expect.any(String));
  });

  it("serves van compliance and moves the odometer on a new record", () => {
    const before = (handle("GET", "/api/van/compliance")?.body as any).compliance.currentMileage;
    const res = handle("POST", "/api/van/fuel");
    expect((res?.body as any).record.type).toBe("FUEL");
    const after = (handle("GET", "/api/van/compliance")?.body as any).compliance.currentMileage;
    expect(after).toBeGreaterThan(before);
  });

  it("returns no VAPID key so dev push subscription bails out cleanly", () => {
    expect((handle("GET", "/api/push/vapid-public-key")?.body as any).publicKey).toBeNull();
    expect(handle("POST", "/api/push/subscribe")?.status).toBe(200);
  });
});
