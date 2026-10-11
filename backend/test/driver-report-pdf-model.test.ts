import { describe, expect, it } from "vitest";
import { driverPdfSections } from "../src/reports/driver-report-pdf.model";
import { driverExportSample } from "./fixtures/driver-export.sample";
describe("Concise table-only Driver Breakdown PDF", () => {
  it("includes the recorded On the Way milestone in the job timings table", () => {
    const report = driverExportSample(1);
    report.jobs[0].timings.onMyWayAt = "2026-10-09T07:40:00Z";
    const table = driverPdfSections(report)[0].tables.find(table => table.title === "Job timings")!;
    expect(table.headers[1]).toBe("On the Way");
    expect(table.rows[0][1]).toBe("09 Oct, 08:40");
  });
  it("compares per-job GPS charges instead of the saved tunnel fee", () => {
    const report = driverExportSample(1), job = report.jobs[0];
    job.finance.tunnelPence = 1360;
    job.manualDetails!.chargeItems = [{ type: "tunnel", amountPence: 1360 }];
    const alert = { id: "first", type: "tunnel", jobId: job.jobId, zone: "Tunnel", enteredAt: "2026-10-09T09:00:00Z", estimatedPence: 1360 };
    report.roadAlerts = [alert, { ...alert, id: "second" }, { ...alert, id: "other", jobId: "OTHER" }] as typeof report.roadAlerts;
    const table = driverPdfSections(report)[3].tables.find(table => table.title === "Expected and reported job charges")!;
    expect(table.headers).toEqual(["Job ID", "Charge", "Expected", "Reported"]);
    expect(table.rows).toContainEqual([job.jobId, "Tunnel", "GBP 27.20", "GBP 13.60"]);
  });
  it("matches the six report tabs and preserves all filtered jobs without technical audit fields", () => {
    const report = driverExportSample();
    const sections = driverPdfSections(report);
    expect(sections.map(section => section.name)).toEqual(["Performance & Timings", "Payments", "Jobs", "Comparison", "Tunnel Charges", "Congestion Charges"]);
    expect(sections[2].tables[0].rows).toHaveLength(105);
    expect(sections[3].tables[0].rows).toHaveLength(105);
    const comparison = JSON.stringify(sections[3]);
    for (const label of ["Scheduled", "Allocated", "Overtime", "Total Charges"]) expect(comparison).not.toContain(label);
    const content = JSON.stringify(sections);
    expect(content).toContain("SAMPLE-105"); expect(content).not.toContain("must-not-export");
    for (const internal of ["authorityIssue", "candidateJobIds", "readConsistency", "liabilitySummary", "signedDifferencePence"]) expect(content).not.toContain(internal);
    expect(sections.every(section => section.tables.every(table => table.rows.every(row => row.length === table.headers.length)))).toBe(true);
  });
  it("uses GPSLive alert fees rather than the old physical-verification ledger", () => {
    const report = driverExportSample(3);
    report.roadAlerts = [{ id: "test", type: "tunnel", jobId: "SAMPLE-001", zone: "Dartford", enteredAt: "2026-10-09T09:00:00Z", exitedAt: null, chargeable: true, estimatedPence: 1360, rateBasis: "Current Pricing Settings estimate" }] as typeof report.roadAlerts;
    const tunnel = driverPdfSections(report)[4];
    expect(tunnel.tables[0].rows.flat()).toContain("GBP 13.60");
    expect(tunnel.tables[1].rows[0]).toContain("Current Pricing Settings");
    expect(tunnel.tables[1].rows[0]).toContain("SAMPLE-001");
  });
});
