import { beforeEach, describe, expect, it, vi } from "vitest";

const aggregate = vi.hoisted(() => vi.fn());
vi.mock("../src/db/mongo", () => ({ jobsCollection: async () => ({ aggregate }) }));
vi.mock("../src/reports/report-read-cache", () => ({ invalidateReportReads: vi.fn() }));
import { listJobsPage } from "../src/db/jobs.repo";

describe("admin job driver filtering", () => {
  beforeEach(() => {
    aggregate.mockReset();
    aggregate.mockImplementation(() => ({ toArray: async () => [] }));
  });

  it("filters both page and count by the displayed driver rather than the mutable calendar assignment", async () => {
    await listJobsPage({ driverInitials: "ti", allowedDriverInitials: ["TI", "MK"], status: "COMPLETED", page: 1, pageSize: 25 });
    for (const [pipeline] of aggregate.mock.calls) {
      expect(pipeline.find((stage: any) => stage.$match).$match).toEqual({ $and: [
        { status: "COMPLETED" }, { __displayDriverInitials: "TI" }
      ] });
      const identity = pipeline.find((stage: any) => stage.$addFields?.__displayDriverInitials)
        .$addFields.__displayDriverInitials.$toUpper.$trim.input;
      const fallback = (field: unknown, next: unknown) => ({ $cond: [{ $ne: [{ $ifNull: [field, ""] }, ""] }, field, next] });
      expect(identity).toEqual(fallback("$reportIdentity.initials", fallback("$timeBilling.driverInitials",
        fallback({ $arrayElemAt: ["$__driverSummary.driverInitials", 0] }, fallback("$driverInitials", "")))));
    }
    expect(aggregate.mock.calls[0][0].at(-1)).toEqual({ $project: { _id: 0, __driverSummary: 0, __displayDriverInitials: 0 } });
    expect(aggregate.mock.calls[1][0].at(-1)).toEqual({ $count: "total" });
  });

  it("uses displayed identity for roster scoping, name search and driver sorting", async () => {
    await listJobsPage({ allowedDriverInitials: ["TI"], q: "Tiago", qMatchedInitials: ["ti"], sort: "driverInitials", dir: "asc", page: 1, pageSize: 25 });
    const pipeline = aggregate.mock.calls[0][0];
    expect(pipeline.find((stage: any) => stage.$lookup).$lookup.from).toBe("driver_job_summaries");
    const clauses = pipeline.find((stage: any) => stage.$match).$match.$and;
    expect(clauses[0].$or).toContainEqual({ __displayDriverInitials: { $in: ["TI", "ti"] } });
    expect(clauses[1].$or).toContainEqual({ __displayDriverInitials: { $in: ["TI"] } });
    expect(pipeline.find((stage: any) => stage.$sort)).toEqual({ $sort: { __displayDriverInitials: 1 } });
  });

  it("continues rejecting a driver outside the allowed roster", async () => {
    await listJobsPage({ driverInitials: "OTHER", allowedDriverInitials: ["TI"], page: 1, pageSize: 25 });
    expect(aggregate.mock.calls[0][0].find((stage: any) => stage.$match).$match)
      .toEqual({ __displayDriverInitials: "__NONE__" });
  });
});
