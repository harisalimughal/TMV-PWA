import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ handler: null as any, jobs: vi.fn(), roster: vi.fn(), normalize: vi.fn(), movement: vi.fn() }));
vi.mock("express", () => ({ Router: () => ({ get: (_path: string, handler: any) => { mocks.handler = handler; } }) }));
vi.mock("../src/auth/driver-account.service", () => ({ listDriverProfiles: mocks.roster }));
vi.mock("../src/db/jobs.repo", () => ({ listJobsInRange: mocks.jobs }));
vi.mock("../src/db/evidence.repo", () => ({ listEvidenceForJobs: async () => [] }));
vi.mock("../src/db/driver-job-summary.repo", () => ({ listDriverJobSummariesForJobs: async () => [] }));
vi.mock("../src/admin/dashboard/normalize", () => ({ normalizeMongoDataset: mocks.normalize }));
vi.mock("../src/admin/dashboard/dataset-cache", () => ({ getDashboardDataset: async () => { throw new Error("Unscoped reads prohibited"); } }));
vi.mock("../src/admin/dashboard/driver-summary-movement", () => ({ loadDriverMovement: mocks.movement }));
import { dashboardDriversSummaryRoutes } from "../src/admin/dashboard/drivers-summary.routes";
import { invalidateReportReads } from "../src/reports/report-read-cache";
beforeEach(() => {
  invalidateReportReads(); vi.clearAllMocks(); dashboardDriversSummaryRoutes();
  mocks.roster.mockResolvedValue([{ initials: "MA", fullName: "Driver", active: true }]);
  mocks.jobs.mockResolvedValue([{ jobId: "JOB", status: "COMPLETED" }]);
  mocks.normalize.mockResolvedValue([{ jobId: "JOB", driverInitials: "MA", status: "COMPLETED", totalCharges: 10000, evidenceCompleteness: {} }]);
  mocks.movement.mockResolvedValue(new Map([["MA", { movingKnownSeconds: 1800, movingUnknownJobs: 0, movingPartialJobs: 0 }]]));
});
const request = async (from = "2026-10-09", includeMoving = "1", completedOnly = "0") => {
  const response = { status: vi.fn(), json: vi.fn() }; response.status.mockReturnValue(response);
  await mocks.handler({ query: { from, to: "2026-10-10", includeMoving, completedOnly } }, response);
  expect(response.status).toHaveBeenCalledWith(200); return response.json.mock.calls[0][0];
};
describe("Breakdown summary cache", () => {
  it("isolates completed-only Breakdown from the operational driver summary", async () => {
    const done = { jobId: "DONE", status: "COMPLETED" };
    const active = { jobId: "ACTIVE", status: "IN_PROGRESS" };
    mocks.jobs.mockResolvedValue([done, active]);
    mocks.normalize.mockResolvedValue([done, active].map(job => ({ ...job, driverInitials: "MA", actualMinutes: 60, evidenceCompleteness: {} })));
    const breakdown = await request("2026-10-09", "1", "1");
    expect(breakdown.drivers[0]).toMatchObject({ assigned: 1, completed: 1, totalDurationMinutes: 60 });
    expect(mocks.normalize.mock.calls[0][0].jobs).toEqual([done]);
    expect(mocks.movement.mock.calls[0][0]).toEqual([done]);
    const operational = await request();
    expect(operational.drivers[0]).toMatchObject({ assigned: 2, completed: 1, totalDurationMinutes: 120 });
    expect(mocks.jobs).toHaveBeenCalledTimes(2);
  });
  it("reuses recent filter results without repeating job/GPS reads and isolates dates/moving requests", async () => {
    await request(); await request(); expect(mocks.jobs).toHaveBeenCalledTimes(1); expect(mocks.movement).toHaveBeenCalledTimes(1);
    await request("2026-10-08"); expect(mocks.jobs).toHaveBeenCalledTimes(2);
    await request("2026-10-09", "0"); expect(mocks.jobs).toHaveBeenCalledTimes(3); expect(mocks.movement).toHaveBeenCalledTimes(2);
  });
  it("reloads changed totals immediately after invalidation rather than serving old cached amounts", async () => {
    expect((await request()).drivers[0].calculatedChargesPounds).toBe(100);
    mocks.normalize.mockResolvedValue([{ jobId: "JOB", driverInitials: "MA", status: "COMPLETED", totalCharges: 20000, evidenceCompleteness: {} }]);
    invalidateReportReads();
    expect((await request()).drivers[0].calculatedChargesPounds).toBe(200); expect(mocks.jobs).toHaveBeenCalledTimes(2);
  });
});
