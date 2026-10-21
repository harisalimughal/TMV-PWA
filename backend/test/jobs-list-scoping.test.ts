import { afterEach, describe, expect, it, vi, beforeEach } from "vitest";
import { JobStatus } from "../src/jobs/job.types";
import { WorkflowState } from "../src/workflow/workflow.states";

/**
 * Locks in that the driver-facing "Jobs" screens ask Mongo for just this driver's own
 * jobs (jobs.repo.ts's listJobs({ driverInitials })) instead of pulling every job in
 * the company over the wire and filtering in JS -- see that function's own doc
 * comment for why. A regression here (dropping the filter, or resolving it after
 * listJobs is already called) is exactly the kind of thing that silently makes the
 * "Jobs" tab slower as the collection grows without ever failing a test that only
 * checks the returned data shape.
 */

const getJob = vi.fn();
const listJobs = vi.fn().mockResolvedValue([]);
const listUnassignedJobBookings = vi.fn().mockResolvedValue([]);
const getDriverProfile = vi.fn();
const summaries = vi.fn().mockResolvedValue([]);
vi.mock("../src/db/driver-job-summary.repo", () => ({ listDriverJobSummariesForJobs: (...args: unknown[]) => summaries(...args) }));

vi.mock("../src/config/env", () => ({
  env: { timezone: "Europe/London", calendarSyncTtlMs: 120_000 }
}));
vi.mock("../src/db/jobs.repo", () => ({
  getJob: (...args: any[]) => getJob(...args),
  listJobs: (...args: any[]) => listJobs(...args),
  listUnassignedJobBookings: (...args: any[]) => listUnassignedJobBookings(...args),
  upsertJob: vi.fn()
}));
vi.mock("../src/auth/driver-account.service", () => ({
  getDriverProfile: (...args: any[]) => getDriverProfile(...args)
}));
vi.mock("../src/db/activity.repo", () => ({ appendActivity: vi.fn().mockResolvedValue(undefined), listActivityForJob: vi.fn().mockResolvedValue([]) }));
vi.mock("../src/jobs/congestion-zone.service", () => ({ checkCongestionZoneAtJobStart: vi.fn().mockResolvedValue(undefined) }));
// getJobsGroupedForDriver also triggers a throttled Calendar syncIfStale() (see its
// own doc comment) -- irrelevant to what this file locks in (the Mongo query
// scoping), so stubbed out rather than left to hit the real Google Calendar client.
vi.mock("../src/jobs/booking.service", () => ({
  syncTodayBookings: vi.fn().mockResolvedValue([])
}));

import { getJobsGroupedForDriver, getNextJobForDriver, getPendingSubmissionsForDriver, getTomorrowJobsForDriver, startJob, sendOnMyWay } from "../src/jobs/jobs.service";
import { syncTodayBookings } from "../src/jobs/booking.service";

const driver = {
  initials: "HE",
  fullName: "Helena Gray",
  email: "helena@example.com",
  chatUserName: "",
  active: true,
  role: "Driver",
  phone: "07123456789",
  vanRegistration: "HE12 ABC"
};

describe("driver job lists are scoped to that driver's own initials", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    listJobs.mockResolvedValue([]);
    listUnassignedJobBookings.mockResolvedValue([]);
    summaries.mockResolvedValue([]);
    getDriverProfile.mockResolvedValue(driver);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows a fresh admin-rescheduled attempt but never the completed attempts", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-16T07:00:00Z"));
    const notice = { kind: "admin-completed", scheduledStart: "2026-10-16T12:00:00Z" };
    listJobs.mockResolvedValue([
      { jobId: "PREVIOUS", driverInitials: "HE", status: JobStatus.COMPLETED, bookedStart: "2026-10-13T08:00:00Z",
        manualDetailsRequiredAt: "2026-10-13T09:00:00Z", rescheduledToJobId: "FRESH" },
      { jobId: "FRESH", driverInitials: "HE", status: JobStatus.READY, currentState: WorkflowState.READY,
        bookedStart: "2026-10-16T12:00:00Z", rescheduledFromJobId: "PREVIOUS", rescheduleNotice: notice },
      { jobId: "DRIVER-DONE", driverInitials: "HE", status: JobStatus.COMPLETED, bookedStart: "2026-10-16T10:00:00Z",
        rescheduleNotice: { ...notice, kind: "driver-completed" } }
    ]);
    const grouped = await getJobsGroupedForDriver("helena@example.com");
    expect(grouped.today.map(job => job.jobId)).toEqual(["FRESH"]);
    expect(grouped.past).toEqual([]);
    expect((await getNextJobForDriver("helena@example.com")).job?.jobId).toBe("FRESH");
    expect(await getPendingSubmissionsForDriver("helena@example.com")).toEqual([]);
  });

  it("getJobsGroupedForDriver (the 'Jobs' tab) queries only this driver's jobs", async () => {
    await getJobsGroupedForDriver("helena@example.com");
    expect(listJobs).toHaveBeenCalledTimes(1);
    expect(listJobs).toHaveBeenCalledWith({ driverInitials: "HE", excludeStatuses: [JobStatus.COMPLETED, JobStatus.CANCELLED] });
  });

  it("returns the stored job list while a Calendar sync is still pending", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2100-01-01T08:00:00Z"));
    let finishSync!: (jobs: []) => void;
    const pendingSync = new Promise<[]>(resolve => { finishSync = resolve; });
    vi.mocked(syncTodayBookings).mockReturnValueOnce(pendingSync);
    try {
      const grouped = await getJobsGroupedForDriver("helena@example.com");
      expect(grouped.today).toEqual([]);
      expect(syncTodayBookings).toHaveBeenCalled();
    } finally {
      finishSync([]);
      await pendingSync;
    }
  });
  it("keeps earlier unfinished jobs available in Past regardless of elapsed scheduled time", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-12T07:00:00Z"));
    const active = { jobId: "OVERNIGHT", driverInitials: "HE", status: JobStatus.IN_PROGRESS,
      bookedStart: "2026-10-11T22:00:00Z", bookedFinish: "2026-10-12T08:00:00Z" };
    const expired = { ...active, jobId: "EXPIRED", bookedFinish: "2026-10-12T06:00:00Z" };
    listJobs.mockResolvedValue([expired, active]);
    const grouped = await getJobsGroupedForDriver("helena@example.com");
    expect(grouped.today).toEqual([]);
    expect(grouped.past.map(job => job.jobId)).toEqual(["EXPIRED", "OVERNIGHT"]);
    expect((await getNextJobForDriver("helena@example.com")).job?.jobId).toBe("EXPIRED");
  });
  it("keeps today's unfinished job visible after its scheduled end while the next remains visible too", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-12T07:00:00Z"));
    listJobs.mockResolvedValue([
      { jobId: "EXPIRED", driverInitials: "HE", status: JobStatus.IN_PROGRESS, bookedStart: "2026-10-12T05:00:00Z", bookedFinish: "2026-10-12T06:00:00Z" },
      { jobId: "NEXT", driverInitials: "HE", status: JobStatus.READY, bookedStart: "2026-10-12T07:00:00Z", bookedFinish: "2026-10-12T08:00:00Z" }
    ]);
    const grouped = await getJobsGroupedForDriver("helena@example.com");
    expect(grouped.today.map(job => job.jobId)).toEqual(["EXPIRED", "NEXT"]);
    expect(grouped.past).toEqual([]);
    expect((await getNextJobForDriver("helena@example.com")).job?.jobId).toBe("EXPIRED");
  });

  it("tracks pending Manual details without redirecting jobs or blocking the next start", async () => {
    const completed = { jobId: "DONE", driverInitials: "HE", status: JobStatus.COMPLETED, currentState: WorkflowState.COMPLETED, bookedStart: new Date().toISOString(), manualDetailsRequiredAt: new Date().toISOString() };
    const next = { jobId: "NEXT", driverInitials: "HE", status: JobStatus.READY, currentState: WorkflowState.READY, bookedStart: new Date().toISOString() };
    listJobs.mockResolvedValue([completed, next]);
    expect((await getNextJobForDriver("helena@example.com")).job?.jobId).toBe("NEXT");
    expect((await getJobsGroupedForDriver("helena@example.com")).pendingManualDetails).toBeNull();
    expect((await getPendingSubmissionsForDriver("helena@example.com")).map(job => job.jobId)).toEqual(["DONE"]);
    getJob.mockResolvedValue({ ...next, onMyWayAt: new Date().toISOString() });
    await expect(startJob("NEXT", "helena@example.com")).resolves.toMatchObject({ status: JobStatus.IN_PROGRESS });
    await expect(sendOnMyWay("NEXT", "helena@example.com")).resolves.toMatchObject({ jobId: "NEXT" });
    summaries.mockResolvedValue([{ jobId: "DONE" }]);
    expect(await getPendingSubmissionsForDriver("helena@example.com")).toEqual([]);
    expect((await getNextJobForDriver("helena@example.com")).job?.jobId).toBe("NEXT");
    expect((await getJobsGroupedForDriver("helena@example.com")).pendingManualDetails).toBeNull();
  });
  it("allows starting an assigned new job despite another unfinished job", async () => {
    const target = { jobId: "NEXT", driverInitials: "HE", status: JobStatus.READY, currentState: WorkflowState.READY,
      bookedStart: new Date().toISOString(), onMyWayAt: new Date().toISOString() };
    getJob.mockResolvedValue(target);
    listJobs.mockResolvedValue([{ ...target, jobId: "OLDER", status: JobStatus.IN_PROGRESS }]);
    await expect(startJob("NEXT", "helena@example.com")).resolves.toMatchObject({ status: JobStatus.IN_PROGRESS });
  });
  it("scopes pending submissions to the authenticated driver's assigned jobs and returns minimal fields", async () => {
    const pending = { jobId: "OWN", driverInitials: "HE", status: JobStatus.COMPLETED, customerName: "Customer",
      bookedStart: "2026-10-12T07:00:00Z", actualFinish: "2026-10-12T08:00:00Z", manualDetailsRequiredAt: "2026-10-12T08:01:00Z", customerEmail: "private@example.test" };
    listJobs.mockResolvedValue([pending, { ...pending, jobId: "OTHER", driverInitials: "MA" }]);
    expect(await getPendingSubmissionsForDriver("helena@example.com")).toEqual([{ jobId: "OWN", customerName: "Customer", bookedStart: pending.bookedStart, actualFinish: pending.actualFinish, requiredAt: pending.manualDetailsRequiredAt }]);
    expect(listJobs).toHaveBeenCalledWith({ driverInitials: "HE" });
    expect(summaries).toHaveBeenCalledWith(["OWN"]);
  });

  it("never gates drivers for historical completed jobs without the prospective marker", async () => {
    listJobs.mockResolvedValue([{ jobId: "OLD", driverInitials: "HE", status: JobStatus.COMPLETED }]);
    expect((await getNextJobForDriver("helena@example.com")).job).toBeNull();
    expect(summaries).not.toHaveBeenCalled();
  });

  it("getNextJobForDriver (the home/active-job screen) queries only this driver's jobs", async () => {
    await getNextJobForDriver("helena@example.com");
    expect(listJobs).toHaveBeenCalledTimes(1);
    expect(listJobs).toHaveBeenCalledWith({ driverInitials: "HE", excludeStatuses: [JobStatus.COMPLETED, JobStatus.CANCELLED] });
  });

  it("still returns this driver's in-progress job as 'active' once scoped", async () => {
    listJobs.mockResolvedValue([
      {
        jobId: "TMV-1",
        driverInitials: "HE",
        status: JobStatus.IN_PROGRESS,
        currentState: WorkflowState.WAITING_ARRIVAL_PHOTO,
        bookedStart: new Date().toISOString()
      }
    ]);

    const { job } = await getNextJobForDriver("helena@example.com");
    expect(job?.jobId).toBe("TMV-1");
  });

  it("shows assigned tomorrow jobs in Upcoming before 21:00 London", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-23T19:59:00.000Z")); // 20:59 Europe/London
    listJobs.mockResolvedValue([
      {
        jobId: "TMV-TOMORROW",
        driverInitials: "HE",
        status: JobStatus.READY,
        currentState: WorkflowState.READY,
        bookedStart: "2026-09-24T09:00:00.000Z"
      }
    ]);

    const { next } = await getJobsGroupedForDriver("helena@example.com");

    expect(next.map(j => j.jobId)).toEqual(["TMV-TOMORROW"]);
  });

  it("shows assigned tomorrow endpoint jobs before 21:00 London", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-23T19:59:00.000Z")); // 20:59 Europe/London
    listUnassignedJobBookings.mockResolvedValue([{ bookedStart: "2026-09-24T10:00:00.000Z" }, { bookedStart: "2026-09-25T10:00:00.000Z" }]);
    listJobs.mockResolvedValue([
      {
        jobId: "TMV-TOMORROW",
        driverInitials: "HE",
        status: JobStatus.READY,
        currentState: WorkflowState.READY,
        bookedStart: "2026-09-24T09:00:00.000Z"
      },
      {
        jobId: "TMV-UNASSIGNED",
        driverInitials: "",
        status: JobStatus.READY,
        currentState: WorkflowState.READY,
        bookedStart: "2026-09-24T10:00:00.000Z"
      }
    ]);

    const { jobs, unassignedCount } = await getTomorrowJobsForDriver("helena@example.com");

    expect(jobs.map(j => j.jobId)).toEqual(["TMV-TOMORROW"]);
    expect(unassignedCount).toBe(1);
    expect(listJobs).toHaveBeenCalledWith({ driverInitials: "HE", excludeStatuses: [JobStatus.CANCELLED] });
    expect(listUnassignedJobBookings).toHaveBeenCalledOnce();
  });

  it("does not show jobs beyond tomorrow even after 21:00 London", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-23T20:30:00.000Z")); // 21:30 Europe/London
    listJobs.mockResolvedValue([
      {
        jobId: "TMV-DAY-AFTER",
        driverInitials: "HE",
        status: JobStatus.READY,
        currentState: WorkflowState.READY,
        bookedStart: "2026-09-25T09:00:00.000Z"
      }
    ]);

    const { next } = await getJobsGroupedForDriver("helena@example.com");

    expect(next.map(j => j.jobId)).toEqual([]);
  });
});
