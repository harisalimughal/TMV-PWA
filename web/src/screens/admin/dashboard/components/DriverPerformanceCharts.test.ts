import { describe, expect, it } from "vitest";
import { performanceChartData } from "./DriverPerformanceCharts";
import { sampleDriverReport } from "../fixtures/driverReport.sample";

describe("Performance chart data", () => {
  it("uses working hours and job counts across all dates without payment data", async () => {
    const report = await sampleDriverReport("DEMO", { from: "2026-10-05", to: "2026-10-11", pageSize: 1 });
    const row = report.trends[0];
    const data = performanceChartData([{ ...row, expectedKnownPence: 65300, paymentCards: { ...row.paymentCards!, driverCollectionPence: 37600 }, workingMinutesKnown: 150, workingMinutesUnknownJobs: 0 }]);
    expect(data[0]).toMatchObject({ hours: 2.5, jobs: row.completedJobs });
    expect(data[0]).not.toHaveProperty("collected");
    expect(performanceChartData(report.trends)).toHaveLength(report.trends.length);
    expect(report.jobs.items).toHaveLength(1);
  });
  it("does not turn entirely missing hours into zero", async () => {
    const report = await sampleDriverReport("DEMO", { from: "2026-10-05", to: "2026-10-11" });
    const row = report.trends[0];
    expect(performanceChartData([{ ...row, completedJobs: 2, workingMinutesUnknownJobs: 2, paymentCards: { ...row.paymentCards!, driverCollectionPence: null } }])[0]).toMatchObject({ hours: null, missingHours: 2 });
    expect(performanceChartData([])).toEqual([]);
  });
});
