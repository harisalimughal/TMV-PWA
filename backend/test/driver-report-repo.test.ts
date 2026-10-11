import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ getDb: vi.fn(), aggregate: vi.fn(), find: vi.fn() }));
vi.mock("../src/db/mongo", () => ({ getDb: mocks.getDb }));
import { loadDriverReportJobs, loadReportContextJobs, ReportCapacityError } from "../src/reports/driver-report.repo";
beforeEach(() => {
  vi.clearAllMocks(); mocks.aggregate.mockReturnValue({ toArray: async () => [] });
  mocks.getDb.mockResolvedValue({ collection: () => ({ aggregate: mocks.aggregate, find: mocks.find }) });
});
describe("Report database scope and guardrails", () => {
  it("filters converted UTC instants with an exclusive end, then frozen/manual/current ownership", async () => {
    await loadDriverReportJobs("AB", "2026-10-09T00:00:00Z", "2026-10-10T00:00:00Z");
    const pipeline = mocks.aggregate.mock.calls[1][0];
    expect(pipeline[0].$match.status).toBe("COMPLETED");
    expect(mocks.aggregate.mock.calls[0][0].find((stage: any) => stage.$match?.["__job.status"])?.$match["__job.status"]).toBe("COMPLETED");
    expect(pipeline[2]).toEqual({ $match: { __date: { $gte: new Date("2026-10-09T00:00:00Z"), $lt: new Date("2026-10-10T00:00:00Z") } } });
    expect(pipeline.some((stage: any) => stage.$lookup?.from === "driver_job_summaries")).toBe(true);
    expect(JSON.stringify(pipeline)).toContain("$reportIdentity.initials");
    expect(JSON.stringify(pipeline)).toContain("$convert");
    expect(pipeline.some((stage: any) => stage.$match?.__driver === "AB")).toBe(true);
  });
  it("rejects oversized reports instead of calculating totals from a truncated page", async () => {
    mocks.aggregate.mockReturnValue({ toArray: async () => Array.from({ length: 5001 }, () => ({})) });
    await expect(loadDriverReportJobs("AB", "2026-10-09T00:00:00Z", "2026-10-10T00:00:00Z")).rejects.toBeInstanceOf(ReportCapacityError);
  });
  it("includes other drivers' same-device context for ambiguity checks, not their financial totals", async () => {
    await loadReportContextJobs("AB", "2026-10-09T00:00:00Z", "2026-10-10T00:00:00Z", ["123"]);
    expect(mocks.aggregate.mock.calls[0][0][0]).toEqual({ $match: { $or: [{ gpsliveImei: { $in: ["123"] } }, { "gpsDeviceHistory.imei": { $in: ["123"] } }] } });
  });
});
