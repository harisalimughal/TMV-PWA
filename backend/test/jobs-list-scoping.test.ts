import { describe, expect, it, vi, beforeEach } from "vitest";
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
const getDriverProfile = vi.fn();

vi.mock("../src/config/env", () => ({
  env: { timezone: "Europe/London", calendarSyncTtlMs: 120_000 }
}));
vi.mock("../src/db/jobs.repo", () => ({
  getJob: (...args: any[]) => getJob(...args),
  listJobs: (...args: any[]) => listJobs(...args),
  upsertJob: vi.fn()
}));
vi.mock("../src/auth/driver-account.service", () => ({
  getDriverProfile: (...args: any[]) => getDriverProfile(...args)
}));

import { getJobsGroupedForDriver, getNextJobForDriver } from "../src/jobs/jobs.service";

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
    listJobs.mockResolvedValue([]);
    getDriverProfile.mockResolvedValue(driver);
  });

  it("getJobsGroupedForDriver (the 'Jobs' tab) queries only this driver's jobs", async () => {
    await getJobsGroupedForDriver("helena@example.com");
    expect(listJobs).toHaveBeenCalledTimes(1);
    expect(listJobs).toHaveBeenCalledWith({ driverInitials: "HE" });
  });

  it("getNextJobForDriver (the home/active-job screen) queries only this driver's jobs", async () => {
    await getNextJobForDriver("helena@example.com");
    expect(listJobs).toHaveBeenCalledTimes(1);
    expect(listJobs).toHaveBeenCalledWith({ driverInitials: "HE" });
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
});
