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
