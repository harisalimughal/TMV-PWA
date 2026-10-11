import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Job } from "../src/jobs/job.types";

const mocks = vi.hoisted(() => ({ getJob: vi.fn(), listJobs: vi.fn(), getSetting: vi.fn(), readGpsRange: vi.fn() }));
vi.mock("../src/db/jobs.repo", () => ({ getJob: mocks.getJob, listJobs: mocks.listJobs }));
vi.mock("../src/db/settings.repo", () => ({ getSetting: mocks.getSetting }));
vi.mock("../src/gps/gps.repo", () => ({ readGpsRange: mocks.readGpsRange }));
import { gpsJobMonitoring } from "../src/gps/gps.monitoring";

describe("GPS job monitoring coverage", () => {
  let job: Job;
  beforeEach(() => {
    vi.clearAllMocks();
    job = { jobId: "JOB", driverInitials: "AB", status: "COMPLETED", bookedStart: "2026-10-01T10:00:00Z",
      actualStart: "2026-10-01T10:00:00Z", actualFinish: "2026-10-01T11:00:00Z" } as Job;
    mocks.getJob.mockResolvedValue(job);
    mocks.listJobs.mockResolvedValue([job]);
    mocks.getSetting.mockResolvedValue("[]");
    mocks.readGpsRange.mockResolvedValue({ events: [], positions: [], drives: [], runs: [], truncated: false });
  });

  it("does not turn absent trackers into zero moving hours or confirmed crossings", async () => {
    const result = await gpsJobMonitoring("JOB");
    expect(result).toMatchObject({ coverage: "unavailable", providerCoverage: "unknown", workingSeconds: 3600,
      counts: { confirmedTunnelCrossings: null }, onJob: { coverage: "unavailable", movingSeconds: null } });
    expect(mocks.readGpsRange).toHaveBeenCalledWith([], expect.any(String), expect.any(String));
    expect(mocks.listJobs).not.toHaveBeenCalled();
  });

  it("surfaces incomplete imports and unconfigured portal geometry", async () => {
    job.gpsliveImei = "123";
    mocks.readGpsRange.mockResolvedValue({ events: [], positions: [], drives: [],
      runs: [{ _id: "RUN", status: "partial", zoneSnapshot: [] }], truncated: false });
    const result = await gpsJobMonitoring("JOB");
    expect(result).toMatchObject({ coverage: "partial", providerCoverage: "unknown" });
    expect(result?.portalIssue).toContain("not configured");
  });

  it("does not use administrative fallback finish timestamps as measured working hours", async () => {
    job.actualFinishSource = "admin-manual";
    expect(await gpsJobMonitoring("JOB")).toMatchObject({ workingSeconds: null });
  });

  it("returns no report for an unknown job", async () => {
    mocks.getJob.mockResolvedValue(null);
    expect(await gpsJobMonitoring("MISSING")).toBeNull();
    expect(mocks.readGpsRange).not.toHaveBeenCalled();
  });
});
