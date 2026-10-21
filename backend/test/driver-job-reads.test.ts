import { beforeEach, describe, expect, it, vi } from "vitest";
import { JobStatus } from "../src/jobs/job.types";
const mocks = vi.hoisted(() => ({ find: vi.fn() }));
vi.mock("../src/db/mongo", () => ({ getClient: vi.fn(), jobsCollection: async () => ({ find: mocks.find }) }));
vi.mock("../src/reports/report-read-cache", () => ({ invalidateReportReads: vi.fn() }));
import { listJobs, listUnassignedJobBookings } from "../src/db/jobs.repo";

describe("Driver job database reads", () => {
  beforeEach(() => vi.clearAllMocks());
  it("excludes closed history in Mongo without truncating or projecting away job details", async () => {
    const rows = [{ _id: "OLD", jobId: "OLD", driverInitials: "AR", status: JobStatus.IN_PROGRESS,
      bookedStart: "2020-01-01T10:00:00Z", pickup: "Pickup", rawDescription: "Booking details" }];
    const cursor = { toArray: vi.fn().mockResolvedValue(rows) };
    mocks.find.mockReturnValue(cursor);
    const jobs = await listJobs({ driverInitials: "AR", excludeStatuses: [JobStatus.COMPLETED, JobStatus.CANCELLED] });
    expect(mocks.find).toHaveBeenCalledWith({ driverInitials: "AR", status: { $nin: [JobStatus.COMPLETED, JobStatus.CANCELLED] } });
    expect(jobs).toEqual(rows.map(({ _id, ...job }) => job));
    expect(rows[0]._id).toBe("OLD");
  });
  it("keeps existing unfiltered callers unchanged", async () => {
    mocks.find.mockReturnValue({ toArray: async () => [] });
    await listJobs();
    expect(mocks.find).toHaveBeenCalledWith({});
  });
  it("gets only booking dates for the unassigned count and includes missing legacy assignment fields", async () => {
    const cursor = { project: vi.fn(), toArray: vi.fn().mockResolvedValue([{ bookedStart: "2026-10-23T08:00:00Z" }]) };
    cursor.project.mockReturnValue(cursor);
    mocks.find.mockReturnValue(cursor);
    expect(await listUnassignedJobBookings()).toEqual([{ bookedStart: "2026-10-23T08:00:00Z" }]);
    expect(mocks.find).toHaveBeenCalledWith({ driverInitials: { $in: ["", null] }, status: { $ne: JobStatus.CANCELLED } });
    expect(cursor.project).toHaveBeenCalledWith({ _id: 0, bookedStart: 1 });
  });
});
