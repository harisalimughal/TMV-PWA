/**
 * The driver job report as a real PDF file (A4 landscape), laid out from the same DriverJobReport
 * model, columns and cell text as the spreadsheet and Word formats. The job table repeats its header
 * on every page and never splits a row; the page number is "Page n of m".
 */
import {
  JOB_COLUMNS, PDF_SHARE, cellText, combinedSummary, generatedLabel, isMissingText, lineText, reportStatus,
  type DriverJobReport, type DriverSection, type SummaryLine
} from "./driverJobReport";
import { PdfDocument, textWidth, wrapText, type Rgb } from "./pdfWriter";
import { rangeLabel } from "./reportPeriods";

const INK: Rgb = [29, 35, 41], MUTED: Rgb = [107, 118, 128], LINE: Rgb = [214, 221, 227], HEAD_FILL: Rgb = [241, 243, 246], AMBER: Rgb = [138, 75, 0], BRAND: Rgb = [91, 33, 182];
const MARGIN = 34, TOP = 56, BOTTOM = 40, PAD_X = 3.5, PAD_Y = 2.5;
const BODY = 7.6, LEAD = 9.4, NUM_PAD = 8;

const NUMERIC = new Set(["pence", "minutes", "count"]);

export function toPdf(report: DriverJobReport): Uint8Array {
  const doc = new PdfDocument();
  const usable = doc.width - MARGIN * 2;
  const status = reportStatus(report);
  const heading = `${report.title} · ${rangeLabel(report.range)}`;
  let page = -1, y = 0;

  const newPage = () => {
    page = doc.addPage();
    doc.text(page, MARGIN, 30, "THE MAN VAN", { size: 8, bold: true, color: MUTED });
    doc.text(page, doc.width - MARGIN, 30, heading, { size: 8, color: MUTED, align: "right" });
    doc.line(page, MARGIN, 38, doc.width - MARGIN, 38);
    y = TOP;
  };
  const room = (height: number) => y + height <= doc.height - BOTTOM;
  const ensure = (height: number) => { if (!room(height)) newPage(); };

  /** A table whose columns are shares (summing to 100) of the usable width. */
  const table = (columns: Array<{ header: string; share: number; numeric?: boolean }>, rows: Array<{ cells: string[]; bold?: boolean }>, options: { size?: number } = {}) => {
    const size = options.size ?? BODY;
    const widths = columns.map(column => (column.share / 100) * usable);
    const drawHeader = () => {
      const lines = columns.map((column, i) => wrapText(column.header, widths[i] - PAD_X * 2, size, true));
      const height = Math.max(...lines.map(l => l.length)) * LEAD + PAD_Y * 2;
      doc.rect(page, MARGIN, y, usable, height, { fill: HEAD_FILL });
      let x = MARGIN;
      lines.forEach((cell, i) => {
        cell.forEach((text, n) => doc.text(page, columns[i].numeric ? x + widths[i] - NUM_PAD : x + PAD_X, y + PAD_Y + LEAD * (n + 1) - 2.6, text, { size, bold: true, align: columns[i].numeric ? "right" : "left" }));
        x += widths[i];
      });
      doc.line(page, MARGIN, y + height, MARGIN + usable, y + height, { color: LINE });
      y += height;
    };
    const headerHeight = Math.max(...columns.map((column, i) => wrapText(column.header, widths[i] - PAD_X * 2, size, true).length)) * LEAD + PAD_Y * 2;
    ensure(headerHeight + LEAD * 2);
    drawHeader();
    for (const row of rows) {
      const wrapped = row.cells.map((cell, i) => wrapText(cell, widths[i] - PAD_X * 2, size, row.bold));
      const height = Math.max(...wrapped.map(l => l.length)) * LEAD + PAD_Y * 2;
      if (!room(height)) { newPage(); drawHeader(); }
      let x = MARGIN;
      wrapped.forEach((cell, i) => {
        const missing = isMissingText(row.cells[i]);
        cell.forEach((text, n) => doc.text(page, columns[i].numeric ? x + widths[i] - NUM_PAD : x + PAD_X, y + PAD_Y + LEAD * (n + 1) - 2.6, text, { size, bold: row.bold, color: missing ? MUTED : INK, align: columns[i].numeric ? "right" : "left" }));
        x += widths[i];
      });
      doc.line(page, MARGIN, y + height, MARGIN + usable, y + height, { color: [237, 241, 244] });
      y += height;
    }
  };

  const summaryTable = (lines: SummaryLine[]) => table(
    [{ header: "Measure", share: 30 }, { header: "Total", share: 20, numeric: true }, { header: "Notes", share: 50 }],
    lines.map(line => ({ cells: [line.label, lineText(line), line.note ?? ""] })), { size: 8 });

  const paragraph = (text: string, options: { size?: number; color?: Rgb; bold?: boolean } = {}) => {
    const size = options.size ?? 8.5;
    for (const line of wrapText(text, usable, size, options.bold)) { ensure(size + 4); doc.text(page, MARGIN, y + size, line, { size, color: options.color ?? INK, bold: options.bold }); y += size + 3.4; }
  };
  const sectionHeading = (text: string, size = 12) => { ensure(size + 30); doc.text(page, MARGIN, y + size, text, { size, bold: true }); y += size + 7; };

  // ---- Cover block -----------------------------------------------------------------------
  newPage();
  doc.text(page, MARGIN, y + 8, "THE MAN VAN", { size: 9, bold: true, color: BRAND }); y += 14;
  doc.text(page, MARGIN, y + 20, report.title, { size: 20, bold: true }); y += 30;
  const drivers = report.sections.length ? report.sections.map(section => `${section.driver.name} (${section.driver.initials})`).join(", ") : "None";
  const meta: Array<[string, string]> = [["Period", `${rangeLabel(report.range)}, London time`], ["Drivers", drivers], ["Generated", generatedLabel(report.generatedAt)]];
  const colWidth = usable / 3;
  const cells = meta.map(([label, value]) => ({ label, lines: wrapText(value, colWidth - 12, 9, true) }));
  cells.forEach((cell, i) => {
    doc.text(page, MARGIN + colWidth * i, y + 7, cell.label.toUpperCase(), { size: 6.5, bold: true, color: MUTED });
    cell.lines.forEach((text, n) => doc.text(page, MARGIN + colWidth * i, y + 19 + n * 11, text, { size: 9, bold: true }));
  });
  y += 19 + Math.max(...cells.map(cell => cell.lines.length)) * 11 + 8;
  // Status: always stated, so a partial report can never pass for a complete one.
  const statusColor = status.status === "PARTIAL" ? AMBER : INK;
  doc.rect(page, MARGIN, y, usable, 14 + status.reasons.length * 0, { fill: status.status === "PARTIAL" ? [255, 247, 232] : HEAD_FILL });
  doc.text(page, MARGIN + 6, y + 10, `Report status: ${status.label}`, { size: 8.5, bold: true, color: statusColor });
  y += 14 + 5;
  for (const reason of [...status.reasons, ...(report.notes ?? [])]) paragraph(reason, { size: 8, color: statusColor });
  y += 6;

  // ---- One section per driver --------------------------------------------------------------
  report.sections.forEach((section: DriverSection, index) => {
    if (index > 0) newPage();
    sectionHeading(`${section.driver.name} (${section.driver.initials})`, 13);
    summaryTable(section.summary);
    y += 4;
    for (const warning of section.warnings) paragraph(warning, { size: 8, color: AMBER });
    y += 4;
    sectionHeading(`Jobs (${section.jobs.length}${section.jobs.length < section.jobTotal ? ` of ${section.jobTotal}` : ""})`, 10.5);
    if (!section.jobs.length) { paragraph("No jobs found for the selected period.", { color: MUTED }); return; }
    table(
      JOB_COLUMNS.map(column => ({ header: column.header, share: PDF_SHARE[column.key], numeric: NUMERIC.has(column.unit ?? "") })),
      section.jobs.map(line => ({ cells: JOB_COLUMNS.map(column => cellText(line, column)) })), { size: BODY });
  });

  const combined = combinedSummary(report);
  if (combined) {
    newPage();
    sectionHeading("All selected drivers", 13);
    summaryTable(combined);
    y += 4;
    paragraph(report.failed?.length
      ? "Combined totals are not available because some drivers could not be loaded."
      : "The sum of the driver sections. Each job has one assigned driver code, so no job is counted twice. A total shows Not available when any driver's value is not available; the known subtotal is given in the notes.", { size: 8, color: MUTED });
  }
  y += 8;
  paragraph("Final charges are billed amounts and include invoices; recorded receipts, unpaid invoices and manual entries are separate measures. Per-job Final charge is the amount the driver entered at completion, and the Final charges total is the sum of those amounts.", { size: 7.5, color: MUTED });
  paragraph(`Source: ${report.sources.join("; ") || "Driver report API"}.`, { size: 7.5, color: MUTED });

  // ---- Footer on every page, now that the page count is known -----------------------------------------------------
  const total = doc.pageCount;
  for (let p = 0; p < total; p++) {
    doc.line(p, MARGIN, doc.height - 30, doc.width - MARGIN, doc.height - 30);
    doc.text(p, MARGIN, doc.height - 19, `Generated ${generatedLabel(report.generatedAt)} · ${status.label}`, { size: 7, color: MUTED });
    doc.text(p, doc.width - MARGIN, doc.height - 19, `Page ${p + 1} of ${total}`, { size: 7, color: MUTED, align: "right" });
  }
  return doc.build({ title: report.title, author: "The Man Van dashboard", subject: `${drivers} · ${rangeLabel(report.range)}`, created: new Date(report.generatedAt) });
}

export { textWidth };
