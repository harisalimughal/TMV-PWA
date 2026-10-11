import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Job } from "../src/jobs/job.types";
import type { ScenarioSubmissionDoc } from "../src/db/scenario.repo";
import { buildLiabilityRecord } from "../src/liabilities/liability.model";
const mocks = vi.hoisted(() => ({ job: vi.fn(), sources: vi.fn(), saved: vi.fn(), persist: vi.fn() }));
vi.mock("../src/db/jobs.repo", () => ({ getJob: mocks.job }));
vi.mock("../src/db/scenario.repo", () => ({ listLiabilitySourcesForJob: mocks.sources }));
vi.mock("../src/liabilities/liability.repo", () => ({ readJobLiabilities: mocks.saved, persistLiability: mocks.persist }));
import { jobLiabilityReport } from "../src/liabilities/liability.service";
const job = { jobId: "JOB" } as Job;
const source = { _id: "one", jobId: "JOB", scenario: "parking", driver: "AB", fields: {}, photoUrls: [], signatureUrl: "", submittedAt: "2026-10-09T10:00:00Z" } as ScenarioSubmissionDoc;
beforeEach(() => {
  vi.clearAllMocks(); mocks.job.mockResolvedValue(job); mocks.sources.mockResolvedValue({ items: [source], truncated: false }); mocks.saved.mockResolvedValue({ items: [], truncated: false }); mocks.persist.mockResolvedValue("inserted-or-identical");
});
describe("Job liability report isolation", () => {
  it("reads sources without mutation and reports unknown costs honestly", async () => {
    const report = await jobLiabilityReport("JOB");
    expect(mocks.persist).not.toHaveBeenCalled();
    expect(report).toMatchObject({ financialIntakeEnabled: false, adminEditingEnabled: false, totals: { unknownAmountCount: 1, completeTotalPence: null } });
  });
  it("imports only when explicitly reconciled, deduplicating repeat source entries", async () => {
    mocks.sources.mockResolvedValue({ items: [source, source], truncated: false });
    const report = await jobLiabilityReport("JOB", true);
    expect(mocks.persist).toHaveBeenCalledTimes(1); expect(report?.items).toHaveLength(1);
  });
  it("preserves saved audit snapshots and flags changes rather than repricing", async () => {
    const saved = buildLiabilityRecord(source, job)!;
    mocks.saved.mockResolvedValue({ items: [saved], truncated: false });
    mocks.sources.mockResolvedValue({ items: [{ ...source, fields: { client_name: "Changed" } }], truncated: false });
    const report = await jobLiabilityReport("JOB");
    expect(report?.items[0].sourceHash).toBe(saved.sourceHash); expect(report?.sourceConflicts).toEqual([saved.sourceRef]); expect(report?.totalsComplete).toBe(false);
  });
  it("flags removed sources without turning stale audit records into current fees", async () => {
    mocks.saved.mockResolvedValue({ items: [buildLiabilityRecord({ ...source, _id: "gone" }, job)], truncated: false });
    expect(await jobLiabilityReport("JOB")).toMatchObject({ missingSourceReferences: ["scenario:gone"], totalsComplete: false });
  });
  it("marks bounded/truncated reports as partial without claiming complete totals", async () => {
    mocks.sources.mockResolvedValue({ items: [source], truncated: true });
    expect(await jobLiabilityReport("JOB")).toMatchObject({ coverage: "partial", totalsComplete: false });
  });
  it("fails safely on persistence errors and does not mutate financial/job totals", async () => {
    mocks.persist.mockRejectedValue(new Error("Storage unavailable"));
    await expect(jobLiabilityReport("JOB", true)).rejects.toThrow("Storage unavailable");
    expect(job).toEqual({ jobId: "JOB" });
  });
  it("returns not found without reading other drivers' records", async () => {
    mocks.job.mockResolvedValue(null); expect(await jobLiabilityReport("MISSING", true)).toBeNull(); expect(mocks.sources).not.toHaveBeenCalled();
  });
});
