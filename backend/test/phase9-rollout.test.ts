import { afterEach, describe, expect, it, vi } from "vitest";
import { planGpsBackfill } from "../src/gps/gps-backfill-plan";
import { reportExportConcurrency, reportFeatureEnabled } from "../src/reports/release-controls";
import { buildReportJob } from "../src/reports/driver-report.model";
import type { Job } from "../src/jobs/job.types";
import { assertExportCellBudget } from "../src/reports/driver-report-export.model";
afterEach(() => vi.unstubAllEnvs());
describe("Additive rollout and reviewable import plan", () => {
  it("deduplicates/sorts tracker plans with stable run IDs and bounded six-hour windows", () => {
    const args = ["2026-10-08T00:00:00Z", "2026-10-09T00:00:00Z", new Date("2026-10-10T00:00:00Z")] as const;
    const a = planGpsBackfill(["456", "123", "123"], ...args), b = planGpsBackfill(["123", "456"], ...args);
    expect(a).toEqual(b); expect(a.windows).toHaveLength(8); expect(a.executesImport).toBe(false); expect(a.maximumProviderRequests).toBe(144);
    expect(new Set(a.windows.map(row => row.id)).size).toBe(8);
  });
  it("rejects future, ambiguous, oversized and invalid tracker plans before any import", () => {
    const now = new Date("2026-10-10T00:00:00Z");
    expect(() => planGpsBackfill(["bad"], "2026-10-08T00:00:00Z", "2026-10-09T00:00:00Z", now)).toThrow();
    expect(() => planGpsBackfill(["123"], "2026-10-08", "2026-10-09T00:00:00Z", now)).toThrow("offsets");
    expect(() => planGpsBackfill(["123"], "2026-10-08T00:00:00Z", "2026-10-11T00:00:00Z", now)).toThrow("past-only");
    expect(() => planGpsBackfill(["123", "456"], "2026-09-10T00:00:00Z", "2026-10-09T00:00:00Z", now)).toThrow("128");
  });
  it("defaults on, permits operational pause and fails closed on invalid switches", () => {
    vi.stubEnv("TMV_DRIVER_REPORTS_ENABLED", ""); expect(reportFeatureEnabled("reports")).toBe(true);
    vi.stubEnv("TMV_DRIVER_REPORTS_ENABLED", "false"); expect(reportFeatureEnabled("reports")).toBe(false);
    vi.stubEnv("TMV_DRIVER_REPORTS_ENABLED", "typo"); expect(() => reportFeatureEnabled("reports")).toThrow("boolean");
  });
  it("labels legacy first-entry hints as incomplete without inventing crossings or charges", () => {
    const job = { jobId: "LEGACY", status: "COMPLETED", driverInitials: "AB", totalCharges: 0, amountCharged: 0, calculatedTotalCharges: 0,
      congestionZoneEnteredAt: "2026-10-09T09:00:00Z", bookedStart: "2026-10-09T09:00:00Z", bookedFinish: "2026-10-09T10:00:00Z" } as Job;
    const result = buildReportJob(job, null);
    expect(result.firstEntryHints).toMatchObject({ coverage: "first-entry-only-incomplete", eligibleForAutomaticCharges: false });
    expect(result.finance.expectedPence).toBe(0); expect(job).not.toHaveProperty("manualDetailsRequiredAt"); expect(job).not.toHaveProperty("roadTariffSnapshot");
  });
  it("refuses oversized workbooks before allocating/styling cells instead of truncating them", () => {
    expect(() => assertExportCellBudget([{ name: "Jobs", tables: [{ title: "Large", headers: Array(100).fill("Field"), rows: Array(10000).fill([]) }] }])).toThrow("one million");
  });
  it("defaults exports to one slot and bounds any staging override", () => {
    vi.stubEnv("TMV_DRIVER_REPORT_EXPORT_CONCURRENCY", ""); expect(reportExportConcurrency()).toBe(1);
    vi.stubEnv("TMV_DRIVER_REPORT_EXPORT_CONCURRENCY", "2"); expect(reportExportConcurrency()).toBe(2);
    vi.stubEnv("TMV_DRIVER_REPORT_EXPORT_CONCURRENCY", "100"); expect(() => reportExportConcurrency()).toThrow("1 or 2");
  });
});
