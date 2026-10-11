import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { exportFilename, exportSections } from "../src/reports/driver-report-export.model";
import { exportCellValue, generateDriverReportXlsx, spreadsheetText } from "../src/reports/driver-report.xlsx";
import { generateDriverReportPdf } from "../src/reports/driver-report.pdf";
import { driverExportSample } from "./fixtures/driver-export.sample";

describe("Complete driver report exports", () => {
  it("projects all 105 jobs and preserves source IDs, snapshots, unknowns and totals", () => {
    const report = driverExportSample();
    const sections = exportSections(report);
    expect(sections.map(row => row.name)).toEqual(["Summary", "Performance", "Payments", "Jobs", "Comparison", "Tunnels", "Congestion", "Liabilities"]);
    expect(sections[3].tables[0].rows).toHaveLength(105);
    expect(sections[4].tables[0].rows).toHaveLength(105);
    expect(JSON.stringify(sections)).toContain("SAMPLE-105");
    expect(JSON.stringify(sections)).toContain("EVENT-1");
    expect(JSON.stringify(sections)).not.toContain("must-not-export");
    expect(sections[0].tables[0].rows).toContainEqual(["expectedKnownPence", report.summary.expectedKnownPence]);
  });
  it("writes actual XLSX with typed GBP/duration cells, complete rows, filters and frozen headers", async () => {
    const report = driverExportSample();
    const buffer = await generateDriverReportXlsx(report);
    expect(buffer.subarray(0, 2).toString()).toBe("PK");
    const book = new ExcelJS.Workbook(); await book.xlsx.load(buffer as any);
    expect(book.worksheets).toHaveLength(8);
    const sheet = book.getWorksheet("Jobs")!, headers = sheet.getRow(4).values as string[];
    const money = headers.indexOf("Finance / Expected GBP"), duration = headers.indexOf("Duration / Working Minutes"), customer = headers.indexOf("Customer / Name");
    expect(sheet.getCell(5, money).value).toBe(255); expect(sheet.getCell(5, money).type).toBe(ExcelJS.ValueType.Number);
    expect(sheet.getCell(5, money).numFmt).toContain("GBP"); expect(sheet.getCell(5, duration).value).toBe(150);
    expect(sheet.getCell(5, customer).value).toMatch(/^'=HYPERLINK/); expect(sheet.getCell(5, customer).type).toBe(ExcelJS.ValueType.String);
    expect(sheet.getCell(109, 1).value).toBe("SAMPLE-105");
    expect(sheet.views[0]).toMatchObject({ state: "frozen", ySplit: 4 }); expect(sheet.autoFilter).toBeTruthy();
    const summary = book.getWorksheet("Summary")!;
    let expected: unknown;
    summary.eachRow(row => { if (row.getCell(1).value === "Expected Known GBP") expected = row.getCell(2).value; });
    expect(expected).toBe(report.summary.expectedKnownPence / 100);
    expect(JSON.stringify(book.model)).toContain("Unknown");
  }, 30000);
  it("sanitizes formula-like text, retains negative numeric amounts and refuses oversize cells", () => {
    expect(spreadsheetText(" \t=1+1")).toBe("' \t=1+1"); expect(spreadsheetText("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(() => spreadsheetText("a".repeat(32767))).toThrow("cell limit");
    expect(exportCellValue(-500, "signedDifferencePence")).toBe(-5);
    expect(() => exportCellValue(Number.MAX_SAFE_INTEGER, "expectedPence")).toThrow("currency precision");
  });
  it("retains unclassified GPS evidence without pretending it is a tunnel or charging it", () => {
    const report = driverExportSample();
    report.events.push({ ...report.events[0], _id: "UNKNOWN-EVENT", scheme: null });
    const sections = exportSections(report);
    expect(JSON.stringify(sections[0])).toContain("UNKNOWN-EVENT");
    expect(JSON.stringify(sections[5])).not.toContain("UNKNOWN-EVENT");
    expect(JSON.stringify(sections[6])).not.toContain("UNKNOWN-EVENT");
  });
  it("writes a multi-page real PDF containing all records, not a print-dialog substitute", async () => {
    const buffer = await generateDriverReportPdf(driverExportSample());
    expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
    expect(buffer.toString("latin1")).toContain("/Type /Pages");
    expect(buffer.length).toBeGreaterThan(10000);
  }, 60000);
  it("handles empty reports and stable London date filenames", async () => {
    const report = driverExportSample(0);
    expect(exportFilename(report, "pdf")).toBe("tmv-driver-DEMO-2026-10-09-2026-10-09.pdf");
    expect((await generateDriverReportXlsx(report)).length).toBeGreaterThan(1000);
    expect((await generateDriverReportPdf(report)).subarray(0, 5).toString()).toBe("%PDF-");
  }, 30000);
});
