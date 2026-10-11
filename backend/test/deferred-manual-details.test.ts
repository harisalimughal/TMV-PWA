import { beforeEach, describe, expect, it, vi } from "vitest";
import { JobStatus, type Job } from "../src/jobs/job.types";
const summaries = vi.hoisted(() => vi.fn());
vi.mock("../src/db/driver-job-summary.repo", () => ({ listDriverJobSummariesForJobs: summaries }));
import { pendingManualSubmissions } from "../src/jobs/manual-details-gate";
const job = (changes: Partial<Job> = {}) => ({ jobId: "PENDING", status: JobStatus.COMPLETED,
  manualDetailsRequiredAt: "2026-10-12T07:00:00Z", ...changes } as Job);

describe("Deferred manual submissions", () => {
  beforeEach(() => summaries.mockReset().mockResolvedValue([]));
  it("lists every required unsubmitted completion, oldest requirement first", async () => {
    const first = job({ jobId: "FIRST", manualDetailsRequiredAt: "2026-10-11T07:00:00Z" });
    const second = job();
    expect(await pendingManualSubmissions([second, first])).toEqual([first, second]);
    expect(summaries).toHaveBeenCalledWith(["FIRST", "PENDING"]);
  });
  it("removes locked submissions without changing other pending jobs", async () => {
    const pending = job(), done = job({ jobId: "DONE" });
    summaries.mockResolvedValue([{ jobId: "DONE" }]);
    expect(await pendingManualSubmissions([done, pending])).toEqual([pending]);
  });
  it("does not invent requirements for historical, cancelled or unfinished jobs", async () => {
    expect(await pendingManualSubmissions([job({ manualDetailsRequiredAt: undefined }), job({ status: JobStatus.IN_PROGRESS }), job({ status: JobStatus.CANCELLED })])).toEqual([]);
    expect(summaries).not.toHaveBeenCalled();
  });
  it("does not mutate the job records", async () => {
    const source = [job()]; const before = JSON.stringify(source);
    await pendingManualSubmissions(source);
    expect(JSON.stringify(source)).toBe(before);
  });
});
