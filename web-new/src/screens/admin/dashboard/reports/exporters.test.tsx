import React from "react";
import { render } from "@testing-library/react";
import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { sampleDriverReport } from "../fixtures/driverReport.sample";
import type { DriverReport } from "../driverReport.types";
import { loadDriverJobReport, type DriverJobReport } from "./driverJobReport";
import { csvCell, toCsv, toDocx, toXlsx, DOCX_WIDTHS } from "./exporters";
import { PaperDriverJobReport } from "./PaperDriverJobReport";
import { customRange } from "./reportPeriods";

const range = customRange("2026-10-05", "2026-10-06") as { from: string; to: string };
const load = (initials: string, query: Record<string, string | number>) => sampleDriverReport(initials, query);
const build = (drivers = ["KA", "RF"]) => loadDriverJobReport(drivers, range, { load, now: () => new Date("2026-10-15T09:00:00Z") });
const jobIds = (report: DriverJobReport) => report.sections.flatMap(section => section.jobs.map(job => job.jobId));
const unzip = (data: Uint8Array) => Object.fromEntries(Object.entries(unzipSync(data)).map(([name, bytes]) => [name, strFromU8(bytes)]));
const PK = [0x50, 0x4b, 0x03, 0x04];
/** Minimal RFC 4180 reader for the checks below (quoted fields, doubled quotes). */
const parseCsv = (csv: string) => csv.replace(/^\uFEFF/, "").trim().split("\r\n").map(line => {
  const cells: string[] = []; let cell = "", quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) { if (ch === '"' && line[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') quoted = false; else cell += ch; }
    else if (ch === '"') quoted = true; else if (ch === ",") { cells.push(cell); cell = ""; } else cell += ch;
  }
  cells.push(cell); return cells;
});

/** Splits the CSV into its labelled sections (REPORT, DRIVER SUMMARY, OVERALL SUMMARY, JOB RECORDS). */
const sections = (csv: string) => {
  const out: Record<string, string[][]> = {}; let current = "";
  for (const row of parseCsv(csv.replace(/\r\n\r\n/g, "\r\n\u0000\r\n"))) {
    if (row.length === 1 && row[0] === "\u0000") { current = ""; continue; }
    if (!current) { current = row[0]; out[current] = []; continue; }
    out[current].push(row);
  }
  return out;
};

describe("report file formats", () => {
  it("escapes CSV cells and stops spreadsheet formulas", () => {
    expect(csvCell("=HYPERLINK(\"x\")")).toBe("\"'=HYPERLINK(\"\"x\"\")\"");
    expect(csvCell("+44 7700")).toBe("'+44 7700");
    expect(csvCell("-1")).toBe("'-1");
    expect(csvCell("@cmd")).toBe("'@cmd");
    expect(csvCell("Flat 2, 10 Road")).toBe("\"Flat 2, 10 Road\"");
    expect(csvCell(-12.5)).toBe("-12.5");
    expect(csvCell(null)).toBe("");
  });

  it("writes a CSV with labelled sections: report, driver summary, overall summary and one row per job, plus a BOM", async () => {
    const report = await build();
    const csv = toCsv(report);
    expect(csv.startsWith("\uFEFFREPORT\r\n")).toBe(true);
    const parts = sections(csv);
    expect(Object.keys(parts)).toEqual(["REPORT", "DRIVER SUMMARY", "OVERALL SUMMARY", "JOB RECORDS"]);
    // Every section is a rectangular table.
    for (const rows of Object.values(parts)) expect(rows.every(row => row.length === rows[0].length)).toBe(true);
    const jobs = parts["JOB RECORDS"];
    expect(jobs[0].slice(0, 4)).toEqual(["Driver", "Driver code", "Job ID", "Date"]);
    expect(jobs).toHaveLength(1 + jobIds(report).length);
    expect(jobs[1][1]).toBe("KA");
    expect(parts["REPORT"].find(row => row[0] === "Status")![1]).toBe("COMPLETE");
  });

  it("puts the totals in the CSV: per driver and overall, as numbers, matching the summaries", async () => {
    const report = await build();
    const parts = sections(toCsv(report));
    const driver = parts["DRIVER SUMMARY"];
    expect(driver[0]).toEqual(["Driver", "Driver code", "Measure", "Total", "Unit", "Coverage", "Notes"]);
    const kaFinal = driver.find(row => row[1] === "KA" && row[2] === "Final charges")!;
    expect(Number(kaFinal[3])).toBe(report.sections[0].summary.find(line => line.key === "final")!.value! / 100);
    expect(kaFinal.slice(4, 6)).toEqual(["GBP", "complete"]);
    const overall = parts["OVERALL SUMMARY"].find(row => row[0] === "Final charges")!;
    expect(Number(overall[1])).toBe(report.sections.reduce((sum, section) => sum + section.summary.find(line => line.key === "final")!.value!, 0) / 100);
  });

  it("leaves an unavailable figure empty with coverage 'unavailable' in the CSV, never 0, and keeps the known subtotal apart", async () => {
    const gap = async (initials: string, query: Record<string, string | number>): Promise<DriverReport> => {
      const report = await sampleDriverReport(initials, query);
      if (initials !== "RF") return report;
      const { Invoice: _omit, ...rest } = report.summary.systemPaymentsByMethodPence;
      return { ...report, summary: { ...report.summary, financialBreakdown: undefined, systemPaymentsByMethodPence: rest } };
    };
    const report = await loadDriverJobReport(["KA", "RF"], range, { load: gap });
    const parts = sections(toCsv(report));
    const rf = parts["DRIVER SUMMARY"].find(row => row[1] === "RF" && row[2] === "Unpaid invoices")!;
    expect(rf[3]).toBe(""); expect(rf[5]).toBe("unavailable");
    const overall = parts["OVERALL SUMMARY"].find(row => row[0] === "Unpaid invoices")!;
    expect(overall[1]).toBe(""); expect(overall[3]).toBe("unavailable");
    expect(Number(overall[4])).toBe(report.sections[0].summary.find(line => line.key === "invoices")!.value! / 100);
  });

  it("marks a partial report as PARTIAL in the CSV and gives no combined totals", async () => {
    const flaky = (initials: string, query: Record<string, string | number>) => initials === "RF" ? Promise.reject(new Error("busy")) : sampleDriverReport(initials, query);
    const report = await loadDriverJobReport(["KA", "RF"], range, { load: flaky, continueOnError: true });
    const parts = sections(toCsv(report));
    expect(parts["REPORT"].find(row => row[0] === "Status")![1]).toBe("PARTIAL REPORT");
    expect(parts["REPORT"].some(row => row[0] === "Status detail" && /RF/.test(row[1]))).toBe(true);
    expect(parts["OVERALL SUMMARY"].every(row => row[0] === "Measure" || row[1] === "")).toBe(true);
  });

  it("escapes commas, quotes and line breaks in the CSV and stops formulas in text", async () => {
    const report = await build();
    report.sections[0].jobs[0] = { ...report.sections[0].jobs[0], customer: '=HYPERLINK("http://x")', pickup: 'A, "B"\nC', dropoff: "@cmd" };
    const csv = toCsv(report);
    expect(csv).toContain(`"'=HYPERLINK(""http://x"")"`);
    expect(csv).toContain(`"A, ""B""\nC"`);
    expect(csv).toContain(",'@cmd,");
    const jobs = sections(csv)["JOB RECORDS"];
    expect(jobs.every(row => row.length === jobs[0].length)).toBe(true);
  });

  it("writes a real XLSX package with Summary and Jobs sheets, numbers as numbers", async () => {
    const report = await build();
    const data = toXlsx(report);
    expect([...data.slice(0, 4)]).toEqual(PK);
    const parts = unzip(data);
    expect(Object.keys(parts)).toEqual(expect.arrayContaining(["[Content_Types].xml", "xl/workbook.xml", "xl/styles.xml", "xl/worksheets/sheet1.xml", "xl/worksheets/sheet2.xml"]));
    expect(parts["xl/workbook.xml"]).toContain('<sheet name="Summary"');
    expect(parts["xl/workbook.xml"]).toContain('<sheet name="Jobs"');
    const jobs = parts["xl/worksheets/sheet2.xml"];
    expect((jobs.match(/<row /g) || []).length).toBe(1 + jobIds(report).length);
    for (const id of jobIds(report)) expect(jobs).toContain(`>${id}<`);
    expect(parts["xl/styles.xml"]).toContain('formatCode="&quot;£&quot;#,##0.00"');
    expect(jobs).toMatch(/<c r="M2" s="2"><v>[\d.]+<\/v><\/c>/); // final charge as a £ number
  });

  it("writes a real DOCX package with every job and a page-number footer", async () => {
    const report = await build();
    const data = toDocx(report);
    expect([...data.slice(0, 4)]).toEqual(PK);
    const parts = unzip(data);
    expect(parts["word/document.xml"]).toContain("Driver Job Report");
    for (const id of jobIds(report)) expect(parts["word/document.xml"]).toContain(id);
    expect(parts["word/document.xml"]).toContain('w:orient="landscape"');
    expect(parts["word/footer1.xml"]).toContain('w:instr="PAGE"');
  });

  it("puts the same jobs and the same totals in every format", async () => {
    const report = await build();
    const ids = jobIds(report);
    const csv = toCsv(report);
    const csvParts = sections(csv);
    const xlsx = unzip(toXlsx(report));
    const docx = unzip(toDocx(report))["word/document.xml"];
    const pdf = render(<PaperDriverJobReport report={report} />).container.textContent || "";
    for (const id of ids) {
      expect(csv).toContain(id);
      expect(xlsx["xl/worksheets/sheet2.xml"]).toContain(id);
      expect(docx).toContain(id);
      expect(pdf).toContain(id);
    }
    const final = report.sections[0].summary.find(line => line.key === "final")!.value!;
    const pounds = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(final / 100);
    expect(docx).toContain(pounds);
    expect(pdf).toContain(pounds);
    expect(xlsx["xl/worksheets/sheet1.xml"]).toContain(`<v>${final / 100}</v>`);
    expect(Number(csvParts["DRIVER SUMMARY"].find(row => row[1] === "KA" && row[2] === "Final charges")![3])).toBe(final / 100);
    const rows = csvParts["JOB RECORDS"], finalColumn = rows[0].indexOf("Final charge (GBP)");
    const csvFinal = rows.slice(1).filter(row => row[1] === "KA").reduce((sum, row) => sum + Number(row[finalColumn] || 0), 0);
    const tableFinal = report.sections[0].jobs.reduce((sum, job) => sum + (job.finalChargePence ?? 0), 0) / 100;
    expect(csvFinal).toBeCloseTo(tableFinal, 2);
  });

  it("says no jobs were found instead of printing an empty table", async () => {
    const report = await loadDriverJobReport(["PL"], customRange("2026-09-01", "2026-09-02") as { from: string; to: string }, { load });
    expect(render(<PaperDriverJobReport report={report} />).container.textContent).toContain("No jobs found for the selected period.");
    expect(unzip(toDocx(report))["word/document.xml"]).toContain("No jobs found for the selected period.");
  });

  it("shows an unavailable figure the same way in the preview model, Excel, Word and the PDF layout", async () => {
    const gap = async (initials: string, query: Record<string, string | number>): Promise<DriverReport> => {
      const report = await sampleDriverReport(initials, query);
      if (initials !== "RF") return report;
      const { Invoice: _omit, ...rest } = report.summary.systemPaymentsByMethodPence;
      return { ...report, summary: { ...report.summary, financialBreakdown: undefined, systemPaymentsByMethodPence: rest } };
    };
    const report = await loadDriverJobReport(["KA", "RF"], range, { load: gap });
    const parts = (data: Uint8Array) => Object.values(unzip(data)).join("\n");
    for (const file of [parts(toXlsx(report)), parts(toDocx(report))]) { expect(file).toContain("Not available"); expect(file).toContain("Known subtotal"); }
    expect(parts(toXlsx(report))).toContain("Not provided by the server for this driver and period");
    const { container } = render(<PaperDriverJobReport report={report} />);
    const rows = [...container.querySelectorAll(".rdj-summary tr")].filter(tr => tr.textContent?.startsWith("Unpaid invoices"));
    expect(rows).toHaveLength(3); // KA, RF, all selected drivers
    expect(rows[0].textContent).toMatch(/£/);
    expect(rows[1].textContent).toContain("Not available");
    expect(rows[2].textContent).toContain("Not available");
    expect(rows[1].textContent).not.toContain("£0.00");
    expect(rows[2].textContent).not.toMatch(/Unpaid invoices£/);
  });
});

describe("office file structure", () => {
  const parse = (xml: string) => { const doc = new DOMParser().parseFromString(xml, "application/xml"); expect(doc.getElementsByTagName("parsererror")).toHaveLength(0); return doc; };

  it("writes well formed XML in every part of the workbook, with the elements Excel expects in schema order", async () => {
    const parts = unzip(toXlsx(await build()));
    for (const [name, xml] of Object.entries(parts)) if (name.endsWith(".xml") || name.endsWith(".rels")) parse(xml);
    const workbook = parse(parts["xl/workbook.xml"]);
    const names = [...workbook.getElementsByTagName("sheet")].map(sheet => sheet.getAttribute("name")!);
    expect(names).toEqual(["Summary", "Jobs"]);
    for (const name of names) { expect(name.length).toBeLessThanOrEqual(31); expect(name).not.toMatch(/[\[\]:*?/\\]/); }
    const sheet = parse(parts["xl/worksheets/sheet2.xml"]).documentElement;
    expect([...sheet.children].map(child => child.tagName)).toEqual(["sheetPr", "sheetViews", "cols", "sheetData", "autoFilter", "pageMargins", "pageSetup"]);
    const filter = sheet.getElementsByTagName("autoFilter")[0].getAttribute("ref")!;
    expect(filter).toMatch(/^A1:P\d+$/);
    expect(parts["xl/workbook.xml"]).toContain(`Jobs!$A$1:$P$${filter.split("P")[1]}`);
  });

  it("keeps money, minutes and dates as real numbers in the Jobs sheet and Not available as text", async () => {
    const report = await build(["KA"]);
    report.sections[0].jobs[0] = { ...report.sections[0].jobs[0], finalChargePence: null, workingMinutes: 90 };
    const jobs = unzip(toXlsx(report))["xl/worksheets/sheet2.xml"];
    expect(jobs).toMatch(/<c r="D2" s="4"><v>\d{5}\.?\d*<\/v><\/c>/);                         // a date serial, date style
    expect(jobs).toContain(`<c r="K2" s="3"><v>${90 / 1440}</v></c>`);                          // 90 minutes as a day fraction, [h]:mm
    expect(jobs).toMatch(/<c r="M2" s="6" t="inlineStr"><is><t xml:space="preserve">Not available<\/t><\/is><\/c>/);
    expect(jobs).not.toMatch(/<c r="M2"[^>]*><v>0<\/v>/);
  });

  it("puts status, coverage and known subtotal columns in the Summary sheet", async () => {
    const summary = unzip(toXlsx(await build()))["xl/worksheets/sheet1.xml"];
    expect(summary).toContain(">COMPLETE<");
    for (const heading of ["Total", "Coverage", "Known subtotal", "Notes"]) expect(summary).toContain(`>${heading}<`);
  });

  it("writes Word paragraph properties in schema order and a real heading style set", async () => {
    const parts = unzip(toDocx(await build()));
    for (const [name, xml] of Object.entries(parts)) if (name.endsWith(".xml") || name.endsWith(".rels")) parse(xml);
    const ORDER = ["pStyle", "keepNext", "keepLines", "pageBreakBefore", "spacing", "ind", "jc"];
    const doc = parse(parts["word/document.xml"]);
    const props = [...doc.getElementsByTagName("w:pPr")];
    expect(props.length).toBeGreaterThan(20);
    for (const pPr of props) {
      const order = [...pPr.children].map(child => child.localName);
      expect(order).toEqual([...order].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b)));
    }
    expect(props.some(pPr => pPr.getElementsByTagName("w:keepNext").length && pPr.getElementsByTagName("w:spacing").length)).toBe(true);
    const styles = parts["word/styles.xml"];
    for (const id of ["Normal", "Title", "Heading1", "Heading2"]) expect(styles).toContain(`w:styleId="${id}"`);
    expect(parts["word/_rels/document.xml.rels"]).toContain("styles.xml");
    expect(parts["[Content_Types].xml"]).toContain("/word/styles.xml");
  });

  it("starts each driver on a new page, repeats table headers, and fits the table inside the margins", async () => {
    const xml = unzip(toDocx(await build()))["word/document.xml"];
    expect((xml.match(/<w:pageBreakBefore\/>/g) ?? []).length).toBe(2);   // second driver, and the combined totals
    expect(xml).toContain("<w:tblHeader/>");
    expect(DOCX_WIDTHS.reduce((sum, width) => sum + width, 0)).toBeLessThanOrEqual(16838 - 2 * 850);
  });

  it("states a partial report in the Word and Excel files, and shows no combined total", async () => {
    const flaky = (initials: string, query: Record<string, string | number>) => initials === "RF" ? Promise.reject(new Error("busy")) : sampleDriverReport(initials, query);
    const report = await loadDriverJobReport(["KA", "RF"], range, { load: flaky, continueOnError: true });
    expect(unzip(toDocx(report))["word/document.xml"]).toContain("Report status: PARTIAL REPORT");
    expect(unzip(toXlsx(report))["xl/worksheets/sheet1.xml"]).toContain(">PARTIAL REPORT<");
  });
});

describe("final charge reconciliation", () => {
  it("per-job Final charge is the same measure the Final charges total sums (acceptedPence), so they reconcile when every job is listed", async () => {
    const report = await build(["KA"]);
    const section = report.sections[0];
    expect(section.jobs.length).toBe(section.jobTotal);
    const total = section.summary.find(line => line.key === "final")!.value!;
    expect(section.jobs.reduce((sum, job) => sum + (job.finalChargePence ?? 0), 0)).toBe(total);
  });
});
