import { describe, expect, it } from "vitest";
import { driverPdfSections } from "../src/reports/driver-report-pdf.model";
import { driverExportSample } from "./fixtures/driver-export.sample";
describe("Concise table-only Driver Breakdown PDF", () => {
  it("matches the six report tabs and preserves all filtered jobs without technical audit fields", () => {
    const report = driverExportSample();
    const sections = driverPdfSections(report);
    expect(sections.map(section => section.name)).toEqual(["Performance & Timings", "Payments", "Jobs", "Comparison", "Tunnel Charges", "Congestion Charges"]);
    expect(sections[2].tables[0].rows).toHaveLength(105);
    expect(sections[3].tables[0].rows).toHaveLength(105);
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
