import { describe, expect, it } from "vitest";
import { sampleDriverReport } from "../fixtures/driverReport.sample";
import type { DriverReport } from "../driverReport.types";
import { JOB_COLUMNS, PDF_SHARE, loadDriverJobReport, reportFileName } from "./driverJobReport";
import { toPdf } from "./driverJobPdf";
import { PdfDocument, textWidth, wrapText } from "./pdfWriter";
import { customRange } from "./reportPeriods";

const range = customRange("2026-10-05", "2026-10-11") as { from: string; to: string };
const load = (initials: string, query: Record<string, string | number>) => sampleDriverReport(initials, query);
const build = (drivers = ["KA", "RF"], loader = load) => loadDriverJobReport(drivers, range, { load: loader, now: () => new Date("2026-10-15T09:00:00Z") });
const latin1 = (bytes: Uint8Array) => Array.from(bytes, byte => String.fromCharCode(byte)).join("");
/** Page texts in drawing order, from the Tj operators of each page's content stream. */
const pages = (pdf: Uint8Array) => latin1(pdf).split(/\d+ 0 obj\n<< \/Length \d+ >>\nstream\n/).slice(1).map(chunk => [...chunk.split("endstream")[0].matchAll(/\((.*)\) Tj/g)].map(match => match[1].replace(/\\([()\\])/g, "$1")));

describe("PDF file", () => {
  it("is a well formed PDF: header, end marker, and a cross reference table that points at every object", async () => {
    const bytes = toPdf(await build());
    const text = latin1(bytes);
    expect(text.startsWith("%PDF-1.4\n")).toBe(true);
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
    const startxref = Number(/startxref\n(\d+)\n%%EOF/.exec(text)![1]);
    expect(text.slice(startxref, startxref + 4)).toBe("xref");
    const entries = [...text.slice(startxref).matchAll(/(\d{10}) (\d{5}) ([nf]) \n/g)].filter(match => match[3] === "n");
    expect(entries.length).toBeGreaterThan(5);
    entries.forEach((entry, index) => expect(text.slice(Number(entry[1])).startsWith(`${index + 1} 0 obj`)).toBe(true));
    expect(/\/Count (\d+)/.exec(text)![1]).toBe(String(pages(bytes).length));
  });

  it("is the same bytes for the same report, and carries the title and date in its info", async () => {
    const report = await build();
    expect(toPdf(report)).toEqual(toPdf(report));
    const text = latin1(toPdf(report));
    expect(text).toContain("/Title (Driver Job Report)");
    expect(text).toContain("/CreationDate (D:20261015090000Z)");
  });

  it("states the report, period, drivers, status and 'Page n of m' on a multi-page report", async () => {
    const result = pages(toPdf(await build()));
    expect(result.length).toBeGreaterThan(2);
    const all = result.flat();
    expect(all).toEqual(expect.arrayContaining(["Driver Job Report", "5 Oct 2026 to 11 Oct 2026, London time", "Report status: COMPLETE", "All selected drivers"]));
    result.forEach((page, index) => expect(page).toContain(`Page ${index + 1} of ${result.length}`));
    // The table header repeats on every page that holds job rows.
    const withRows = result.filter(page => page.some(text => /^DEMO-\d+$/.test(text)));
    expect(withRows.length).toBeGreaterThan(1);
    for (const page of withRows) expect(page).toContain("Job ID");
  });

  it("lists every job once", async () => {
    const report = await build();
    const text = pages(toPdf(report)).flat();
    // The sample driver sections reuse the same job ids, so count per id across sections.
    const expected = new Map<string, number>();
    for (const id of report.sections.flatMap(section => section.jobs.map(job => job.jobId))) expected.set(id, (expected.get(id) ?? 0) + 1);
    for (const [id, count] of expected) expect(text.filter(item => item === id)).toHaveLength(count);
  });

  it("uses column shares that add up to exactly 100 and cover every job column", () => {
    expect(JOB_COLUMNS.map(column => column.key).sort()).toEqual(Object.keys(PDF_SHARE).sort());
    expect(Object.values(PDF_SHARE).reduce((sum, share) => sum + share, 0)).toBeCloseTo(100, 6);
  });

  it("writes Not available, not £0.00, for a missing figure, and says why in the notes", async () => {
    const gap = async (initials: string, query: Record<string, string | number>): Promise<DriverReport> => {
      const report = await sampleDriverReport(initials, query);
      const { Invoice: _omit, ...rest } = report.summary.systemPaymentsByMethodPence;
      return initials === "RF" ? { ...report, summary: { ...report.summary, financialBreakdown: undefined, systemPaymentsByMethodPence: rest } } : report;
    };
    const text = pages(toPdf(await build(["KA", "RF"], gap))).flat();
    expect(text).toContain("Not available");
    expect(text.some(item => /Known subtotal .* from 1 of 2 drivers/.test(item))).toBe(true);
  });

  it("breaks a very long job id instead of clipping it or running into the next column", async () => {
    const report = await build(["KA"]);
    const id = "TMV-" + "EBDA41133A".repeat(6);
    report.sections[0].jobs[0] = { ...report.sections[0].jobs[0], jobId: id };
    const text = pages(toPdf(report)).flat();
    expect(text.filter(item => id.startsWith(item) || id.endsWith(item)).join("").replace(/-$/, "")).toContain("TMV-");
    const columnWidth = (PDF_SHARE.jobId / 100) * (841.89 - 68) - 7;
    for (const piece of wrapText(id, columnWidth, 7.6)) expect(textWidth(piece, 7.6)).toBeLessThanOrEqual(columnWidth);
    expect(wrapText(id, columnWidth, 7.6).join("")).toBe(id);
  });

  it("marks a partial report and gives no combined totals", async () => {
    const flaky = (initials: string, query: Record<string, string | number>) => initials === "RF" ? Promise.reject(new Error("busy")) : sampleDriverReport(initials, query);
    const report = await loadDriverJobReport(["KA", "RF"], range, { load: flaky, continueOnError: true });
    const text = pages(toPdf(report)).flat();
    expect(text).toContain("Report status: PARTIAL REPORT");
    expect(text.some(item => /could not be loaded: RF/.test(item))).toBe(true);
    expect(text.some(item => /Combined totals are not available/.test(item))).toBe(true);
  });

  it("says plainly when a complete report has no jobs", async () => {
    const empty = await loadDriverJobReport(["PL"], customRange("2026-09-01", "2026-09-02") as { from: string; to: string }, { load });
    const text = pages(toPdf(empty)).flat();
    expect(text).toContain("Report status: COMPLETE, NO JOBS");
    expect(text).toContain("No jobs found for the selected period.");
  });

  it("handles a large report (many jobs, many pages) with repeating headers and no row split", async () => {
    const report = await build(["KA"]);
    const base = report.sections[0].jobs;
    report.sections[0].jobs = Array.from({ length: 600 }, (_, index) => ({ ...base[index % base.length], jobId: `BULK-${String(index).padStart(4, "0")}` }));
    report.sections[0].jobTotal = 600;
    const result = pages(toPdf(report));
    expect(result.length).toBeGreaterThan(20);
    const ids = result.flat().filter(item => /^BULK-\d{4}$/.test(item));
    expect(ids).toHaveLength(600);
    expect(new Set(ids).size).toBe(600);
    for (const page of result.filter(page => page.some(item => item.startsWith("BULK-")))) expect(page).toContain("Job ID");
  });

  it("writes characters the standard fonts cannot hold as ? instead of dropping or corrupting them", () => {
    const doc = new PdfDocument(); const page = doc.addPage();
    doc.text(page, 10, 20, "Zoë £5 – 日本");
    const text = latin1(doc.build({ title: "t", author: "a", created: new Date("2026-01-01T00:00:00Z") }));
    expect(text).toContain("(Zo\\353 \\2435 \\226 ??)");
  });

  it("names the file after the report type, driver and real dates", async () => {
    expect(reportFileName(await build(["KA"]), "pdf")).toBe("tmv-driver-jobs-KA-2026-10-05-to-2026-10-11.pdf");
    expect(reportFileName(await build(["KA", "RF"]), "pdf")).toBe("tmv-driver-jobs-drivers-2026-10-05-to-2026-10-11.pdf");
    const odd = await build(["KA"]); odd.sections[0].driver.initials = "K/A:*?";
    expect(reportFileName(odd, "pdf")).toBe("tmv-driver-jobs-KA-2026-10-05-to-2026-10-11.pdf");
  });
});

describe("PDF table text fitting", () => {
  it("never produces a line wider than the cell", () => {
    for (const text of ["Sample pickup, London", "Driver-reported time", "WWWWWWWWWWWWWWWWWWWW", "a b c d e f g h i j k l m n o p"]) {
      for (const width of [30, 52, 90]) for (const piece of wrapText(text, width, 7.6, true)) expect(textWidth(piece, 7.6, true)).toBeLessThanOrEqual(width + 0.01);
    }
  });
});
