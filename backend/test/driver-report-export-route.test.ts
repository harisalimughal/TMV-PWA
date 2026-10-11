import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ handlers: {} as Record<string, any>, getReport: vi.fn(), pdf: vi.fn(), xlsx: vi.fn() }));
vi.mock("express", () => ({ Router: () => ({ get: (path: string, handler: any) => { mocks.handlers[path] = handler; } }) }));
vi.mock("../src/reports/driver-report.service", () => ({ getDriverReport: mocks.getReport }));
vi.mock("../src/reports/driver-report.pdf", () => ({ generateDriverReportPdf: mocks.pdf }));
vi.mock("../src/reports/driver-report.xlsx", () => ({ generateDriverReportXlsx: mocks.xlsx }));
import { dashboardDriverReportsRoutes } from "../src/admin/dashboard/driver-reports.routes";
import { ReportCapacityError } from "../src/reports/driver-report.repo";
import { driverExportSample } from "./fixtures/driver-export.sample";
const response = () => { const res = { setHeader: vi.fn(), send: vi.fn(), status: vi.fn(), json: vi.fn() }; res.status.mockReturnValue(res); return res; };
beforeEach(() => { vi.clearAllMocks(); dashboardDriverReportsRoutes(); mocks.getReport.mockResolvedValue(driverExportSample()); mocks.pdf.mockResolvedValue(Buffer.from("PDF")); mocks.xlsx.mockResolvedValue(Buffer.from("XLSX")); });
const request = (format = "xlsx", query: Record<string, unknown> = {}) => ({ params: { initials: "demo", format }, query: { from: "2026-10-09", to: "2026-10-09", ...query } });
describe("Read-only admin export route", () => {
  it("uses the full service report despite UI pagination/scheme parameters and sets private download headers", async () => {
    const res = response(); await mocks.handlers["/:initials/export.:format"](request("xlsx", { pageSize: 1, jobsPage: 99, activityScheme: "tunnel" }), res);
    expect(mocks.xlsx.mock.calls[0][0].jobs).toHaveLength(105);
    expect(mocks.getReport).toHaveBeenCalledWith("DEMO", expect.objectContaining({ from: "2026-10-08T23:00:00.000Z", to: "2026-10-09T23:00:00.000Z" }), "day", true);
    expect(res.setHeader).toHaveBeenCalledWith("Cache-Control", "private, no-store");
    expect(res.setHeader).toHaveBeenCalledWith("Content-Disposition", 'attachment; filename="tmv-driver-DEMO-2026-10-09-2026-10-09.xlsx"');
    expect(res.send).toHaveBeenCalledWith(Buffer.from("XLSX"));
  });
  it.each([request("csv"), request("pdf", { groupBy: "bad" }), request("pdf", { from: "bad" })])("rejects invalid requests before private data is loaded", async req => {
    const res = response(); await mocks.handlers["/:initials/export.:format"](req, res); expect(res.status).toHaveBeenCalledWith(400); expect(mocks.getReport).not.toHaveBeenCalled();
  });
  it("refuses capacity overflow instead of returning a partial success", async () => {
    mocks.getReport.mockRejectedValue(new ReportCapacityError("Narrow the range."));
    const res = response(); await mocks.handlers["/:initials/export.:format"](request(), res);
    expect(res.status).toHaveBeenCalledWith(413); expect(res.send).not.toHaveBeenCalled();
  });
  it("does not leak private internal errors", async () => {
    mocks.pdf.mockRejectedValue(new Error("database private detail")); const res = response();
    await mocks.handlers["/:initials/export.:format"](request("pdf"), res);
    expect(res.status).toHaveBeenCalledWith(500); expect(JSON.stringify(res.json.mock.calls)).not.toContain("private detail");
  });
  it("bounds simultaneous exports and releases slots after a failed generation", async () => {
    const pending: Array<(error: Error) => void> = [];
    mocks.getReport.mockImplementation(() => new Promise((_resolve, fail) => { pending.push(fail); }));
    const first = mocks.handlers["/:initials/export.:format"](request(), response());
    const second = mocks.handlers["/:initials/export.:format"](request(), response());
    const third = response(); await mocks.handlers["/:initials/export.:format"](request(), third);
    expect(third.status).toHaveBeenCalledWith(429); expect(third.setHeader).toHaveBeenCalledWith("Retry-After", "5");
    pending.forEach(fail => fail(new Error("synthetic failure"))); await Promise.all([first, second]);
    mocks.getReport.mockResolvedValue(driverExportSample()); const retry = response();
    await mocks.handlers["/:initials/export.:format"](request(), retry); expect(retry.send).toHaveBeenCalled();
  });
});
