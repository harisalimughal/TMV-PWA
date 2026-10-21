import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ handler: null as any, getReport: vi.fn() }));
vi.mock("express", () => ({ Router: () => ({ get: (_path: string, handler: any) => { mocks.handler = handler; } }) }));
vi.mock("../src/reports/driver-report.service", () => ({ getDriverReport: mocks.getReport }));
import { dashboardDriverReportsRoutes } from "../src/admin/dashboard/driver-reports.routes";
beforeEach(() => {
  vi.clearAllMocks(); dashboardDriverReportsRoutes();
  mocks.getReport.mockResolvedValue({ summary: { expectedKnownPence: 12345 }, jobs: [{ jobId: "A" }, { jobId: "B" }], liabilities: [],
    gpsSummary: { coverage: "sampled" }, visits: [{ id: "cong", scheme: "congestion", entryObserved: true }, { id: "tunnel-one", scheme: "dartford", physicalCrossingConfirmed: true }, { id: "tunnel-two", scheme: "blackwall-silvertown", physicalCrossingConfirmed: true }],
    events: [{ _id: "cong", scheme: "congestion" }, { _id: "tunnel", scheme: "dartford" }], charges: [{ id: "cong", type: "congestion", expectedPence: 1800 }, { id: "t1", type: "tunnel", expectedPence: 1360 }, { id: "t2", type: "tunnel", expectedPence: 1360 }] });
});
describe("Scheme-filtered report pagination", () => {
  it("requests lightweight road activity while retaining GPS alert evidence", async () => {
    const report = await mocks.getReport();
    report.meta = { movementIncluded: false };
    mocks.getReport.mockClear();
    const res = { json: vi.fn(), status: vi.fn(), setHeader: vi.fn() }; res.status.mockReturnValue(res);
    await mocks.handler({ params: { initials: "AB" }, query: { from: "2026-10-09", to: "2026-10-09", detail: "activity", activityScheme: "tunnel" } }, res);
    expect(mocks.getReport).toHaveBeenCalledWith("AB", expect.any(Object), "day", false, { includeLiabilities: false, includeGps: true, includePositions: false });
    expect(res.json.mock.calls[0][0].activitySummary.confirmedCrossings).toBeNull();
  });
  it.each(["asc", "desc"])("sorts the whole job and event ranges %s before pagination without mutating cached data", async sortDir => {
    const report = await mocks.getReport();
    report.jobs = [
      { jobId: "MID", operationalDate: "2026-10-09T09:00:00Z" },
      { jobId: "NEW", operationalDate: "2026-10-09T12:00:00Z" },
      { jobId: "OLD", bookedStart: "2026-10-09T09:00:00+01:00" },
      { jobId: "UNKNOWN" }
    ];
    report.roadAlerts = report.jobs.map((job: any) => ({ id: job.jobId, jobId: job.jobId, type: "tunnel", enteredAt: job.operationalDate || job.bookedStart, estimatedPence: 100 }));
    const res = { json: vi.fn(), status: vi.fn(), setHeader: vi.fn() }; res.status.mockReturnValue(res);
    await mocks.handler({ params: { initials: "AB" }, query: { from: "2026-10-09", to: "2026-10-09", sortDir, pageSize: 1, jobsPage: 1, roadAlertsPage: 3 } }, res);
    const result = res.json.mock.calls[0][0];
    expect(result.jobs.items[0].jobId).toBe(sortDir === "asc" ? "OLD" : "NEW");
    expect(result.roadAlerts.items[0].id).toBe(sortDir === "asc" ? "NEW" : "OLD");
    expect(result.jobs.total).toBe(4);
    expect(result.summary.expectedKnownPence).toBe(12345);
    expect(report.jobs.map((job: any) => job.jobId)).toEqual(["MID", "NEW", "OLD", "UNKNOWN"]);
  });

  it("rejects invalid date order before loading report data", async () => {
    const res = { json: vi.fn(), status: vi.fn(), setHeader: vi.fn() }; res.status.mockReturnValue(res);
    await mocks.handler({ params: { initials: "AB" }, query: { from: "2026-10-09", to: "2026-10-09", sortDir: "invalid" } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mocks.getReport).not.toHaveBeenCalled();
  });
  it("requests an inexpensive core report without unused liabilities", async () => {
    const res = { json: vi.fn(), status: vi.fn(), setHeader: vi.fn() }; res.status.mockReturnValue(res);
    await mocks.handler({ params: { initials: "AB" }, query: { from: "2026-10-09", to: "2026-10-09", detail: "core" } }, res);
    expect(mocks.getReport).toHaveBeenCalledWith("AB", expect.any(Object), "day", false, { includeLiabilities: false, includeGps: false });
  });
  it("rejects unsupported detail levels before reading any report data", async () => {
    const res = { json: vi.fn(), status: vi.fn(), setHeader: vi.fn() }; res.status.mockReturnValue(res);
    await mocks.handler({ params: { initials: "AB" }, query: { from: "2026-10-09", to: "2026-10-09", detail: "bad" } }, res);
    expect(res.status).toHaveBeenCalledWith(400); expect(mocks.getReport).not.toHaveBeenCalled();
  });
  it("filters alert entries before pagination and calculates totals across all pages", async () => {
    const report = await mocks.getReport();
    report.roadAlerts = [{ id: "c", jobId: "A", type: "congestion", chargeable: true, estimatedPence: 1800 }, { id: "a", jobId: "A", type: "tunnel", chargeable: true, estimatedPence: 1360 }, { id: "b", jobId: "B", type: "tunnel", chargeable: false, estimatedPence: 0 }, { id: "off-job", jobId: null, type: "tunnel", chargeable: true, estimatedPence: 1360 }];
    const res = { json: vi.fn(), status: vi.fn(), setHeader: vi.fn() }; res.status.mockReturnValue(res);
    await mocks.handler({ params: { initials: "AB" }, query: { from: "2026-10-09", to: "2026-10-09", activityScheme: "tunnel", pageSize: 1, roadAlertsPage: 2 } }, res);
    expect(res.json.mock.calls[0][0]).toMatchObject({ roadAlerts: { total: 2, page: 2, items: [{ id: "b" }] }, roadAlertSummary: { entries: 2, chargeableEntries: 1, estimatedKnownPence: 1360 } });
  });
  it("filters before pagination without altering full-range financial totals", async () => {
    const res = { json: vi.fn(), status: vi.fn(), setHeader: vi.fn() }; res.status.mockReturnValue(res);
    await mocks.handler({ params: { initials: "AB" }, query: { from: "2026-10-09", to: "2026-10-09", activityScheme: "tunnel", pageSize: 1, visitsPage: 2 } }, res);
    expect(res.json.mock.calls[0][0]).toMatchObject({ summary: { expectedKnownPence: 12345 }, visits: { total: 2, items: [{ id: "tunnel-two" }], page: 2 }, activitySummary: { confirmedCrossings: 2, knownCustomerPence: 2720 } });
  });
  it("rejects unknown schemes before reading private report data", async () => {
    const res = { json: vi.fn(), status: vi.fn(), setHeader: vi.fn() }; res.status.mockReturnValue(res);
    await mocks.handler({ params: { initials: "AB" }, query: { from: "2026-10-09", to: "2026-10-09", activityScheme: "invalid" } }, res);
    expect(res.status).toHaveBeenCalledWith(400); expect(mocks.getReport).not.toHaveBeenCalled();
  });
});
