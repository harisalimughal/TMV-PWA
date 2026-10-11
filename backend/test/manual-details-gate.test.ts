import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JobStatus, type Job } from "../src/jobs/job.types";
import { isQueueBlockingJob } from "../src/jobs/job-queue-policy";
const summaries = vi.hoisted(() => vi.fn());
vi.mock("../src/db/driver-job-summary.repo", () => ({ listDriverJobSummariesForJobs: summaries }));
import { assertQueueReleased } from "../src/jobs/manual-details-gate";

const now = new Date("2026-10-12T07:00:00Z");
const job = (changes: Partial<Job> = {}) => ({ jobId: "OLD", driverInitials: "MA", status: JobStatus.IN_PROGRESS,
  bookedStart: "2026-10-12T06:00:00Z", bookedFinish: "2026-10-12T08:00:00Z", actualFinish: "", ...changes } as Job);
const target = job({ jobId: "NEXT", status: JobStatus.READY });

describe("Time-scoped driver queue blockers", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(now); summaries.mockReset().mockResolvedValue([]); });
  afterEach(() => vi.useRealTimers());
  it.each([
    { bookedStart: "2026-09-25T17:30:00+01:00", bookedFinish: "2026-09-25T20:00:00+01:00" },
    { actualFinish: "2026-10-12T06:59:00Z" },
    { bookedFinish: "2026-10-12T06:59:00Z" },
    { bookedFinish: "2026-10-12T07:00:00Z" },
    { bookedStart: "2026-09-28T19:00:00+01:00", bookedFinish: "" },
    { bookedStart: "2026-09-28T19:00:00+01:00", bookedFinish: "invalid" }
  ])("releases finished/expired records without rewriting them: %j", async changes => {
    const old = job(changes), before = JSON.stringify(old);
    await expect(assertQueueReleased([old, target], target)).resolves.toBeUndefined();
    expect(isQueueBlockingJob(old, now)).toBe(false);
    expect(JSON.stringify(old)).toBe(before);
  });
  it("still blocks a genuinely ongoing unexpired job", async () => {
    await expect(assertQueueReleased([job(), target], target)).rejects.toThrow("Finish your active job");
  });
  it("keeps a genuine overnight job active until its scheduled finish", () => {
    expect(isQueueBlockingJob(job({ bookedStart: "2026-10-11T22:00:00Z" }), now)).toBe(true);
  });
  it("does not trust an invalid or future actual finish to release an ongoing job", () => {
    expect(isQueueBlockingJob(job({ actualFinish: "invalid" }), now)).toBe(true);
    expect(isQueueBlockingJob(job({ actualFinish: "2026-10-12T08:00:00Z" }), now)).toBe(true);
  });
  it("uses the London day for legacy missing end times around midnight and DST", () => {
    const legacy = job({ bookedStart: "2026-10-11T23:10:00Z", bookedFinish: "" });
    expect(isQueueBlockingJob(legacy, new Date("2026-10-11T23:30:00Z"))).toBe(true);
    expect(isQueueBlockingJob(legacy, new Date("2026-10-12T23:00:00Z"))).toBe(false);
    expect(isQueueBlockingJob(job({ bookedStart: "2026-10-25T00:30:00Z", bookedFinish: "" }), new Date("2026-10-25T02:00:00Z"))).toBe(true);
  });
  it("ignores ready/completed jobs as active blockers", () => {
    expect(isQueueBlockingJob(target, now)).toBe(false);
    expect(isQueueBlockingJob(job({ status: JobStatus.COMPLETED }), now)).toBe(false);
  });
  it("preserves the mandatory manual-details gate for completed jobs", async () => {
    const done = job({ jobId: "DONE", status: JobStatus.COMPLETED, manualDetailsRequiredAt: now.toISOString() });
    await expect(assertQueueReleased([done, target], target)).rejects.toThrow("Submit Manual details for job DONE");
    summaries.mockResolvedValue([{ jobId: "DONE" }]);
    await expect(assertQueueReleased([done, target], target)).resolves.toBeUndefined();
  });
  it("allows resuming the same already active job", async () => {
    const active = job();
    await expect(assertQueueReleased([active], active)).resolves.toBeUndefined();
  });
});
