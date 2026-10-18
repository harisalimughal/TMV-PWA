import { describe, expect, it } from "vitest";
import { expectedJobRoadCharge } from "./jobRoadChargeSummary";
import { sampleJobs, sampleDriverReport } from "../fixtures/driverReport.sample";

describe("Expected per-job road charge totals", () => {
  it("preserves missing evidence and recorded zero without falling back to the saved fee", () => {
    const job = { ...sampleJobs[0], finance: { ...sampleJobs[0].finance, tunnelPence: 1360 } };
    expect(expectedJobRoadCharge({ ...job, roadAlerts: undefined }, "tunnel")).toBeNull();
    expect(expectedJobRoadCharge({ ...job, roadAlerts: [] }, "tunnel")).toBe(0);
  });
  it("sums job-linked amounts and keeps unavailable prices distinct from zero", async () => {
    const report = await sampleDriverReport("DEMO", { from: "2026-10-05", to: "2026-10-11" });
    const base = report.roadAlerts!.items[0], job = sampleJobs[0];
    const alert = { ...base, jobId: job.jobId, type: "tunnel" as const, estimatedPence: 1360 };
    expect(expectedJobRoadCharge({ ...job, roadAlerts: [alert, { ...alert, id: "second" }, { ...alert, jobId: "OTHER" }] }, "tunnel")).toBe(2720);
    expect(expectedJobRoadCharge({ ...job, roadAlerts: [{ ...alert, estimatedPence: null }] }, "tunnel")).toBeNull();
    expect(expectedJobRoadCharge({ ...job, roadAlerts: [alert, { ...alert, estimatedPence: null }] }, "tunnel")).toBe(1360);
  });
});
