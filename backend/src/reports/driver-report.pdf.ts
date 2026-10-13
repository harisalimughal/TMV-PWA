import PDFDocument from "pdfkit";
import { existsSync } from "node:fs";
import path from "node:path";
import { ReportCapacityError } from "./driver-report.repo";
import { assertExportCellBudget, type ExportReport } from "./driver-report-export.model";
import { driverPdfSections, pdfDateRange, type PdfTable } from "./driver-report-pdf.model";
import { addReportMoney } from "./report-payments";

export async function generateDriverReportPdf(report: ExportReport): Promise<Buffer> {
  const sections = driverPdfSections(report);
  assertExportCellBudget(sections);
  const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 36, bufferPages: true,
    info: { Title: `Driver Breakdown - ${report.driver.initials}`, Author: "TMV", Subject: "Selected driver and date-range report" } });
  const chunks: Buffer[] = [];
  const complete = new Promise<Buffer>((resolve, reject) => { doc.on("data", chunk => chunks.push(chunk)); doc.on("end", () => resolve(Buffer.concat(chunks))); doc.on("error", reject); });
  const left = 36, width = doc.page.width - 72, bottom = doc.page.height - 58, lineHeight = 12;
  let y = 112, pageNumber = 1, sectionName = "Performance & Timings";
  const write = (text: string, x: number, at: number, size = 9, bold = false) => {
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(size).fillColor("#20272c").text(text, x, at, { lineBreak: false });
  };
  const rule = (at: number) => doc.moveTo(left, at).lineTo(left + width, at).lineWidth(.6).strokeColor("#dbe1e6").stroke();
  const header = (first = false) => {
    if (first) {
      const logo = path.resolve(__dirname, "../../../web/public/tmv-logo.png");
      if (existsSync(logo)) doc.image(logo, left, 28, { fit: [38, 38] });
      else write("TMV", left, 32, 14, true);
      write("Driver Breakdown", left + 52, 30, 20, true);
      const identity = lines(`${report.driver.name} (${report.driver.initials})`, width - 52);
      identity.forEach((text, index) => write(text, left + 52, 57 + index * lineHeight));
      const dateAt = 57 + identity.length * lineHeight + 9;
      write(`Selected dates: ${pdfDateRange(report)}`, left, dateAt, 9);
      rule(dateAt + 19); y = dateAt + 34;
    } else {
      write(sectionName, left, 28, 16, true);
      const identity = lines(`${report.driver.name} (${report.driver.initials})  |  ${pdfDateRange(report)}`, width);
      identity.forEach((text, index) => write(text, left, 52 + index * lineHeight));
      const bottomAt = 52 + identity.length * lineHeight + 7;
      rule(bottomAt); y = bottomAt + 14;
    }
  };
  const newPage = () => {
    if (pageNumber >= 3000) { doc.destroy(); throw new ReportCapacityError("PDF exceeds 3,000 pages. Narrow the date range; no partial PDF was returned."); }
    doc.addPage(); pageNumber++; header();
  };
  const lines = (text: string, cellWidth: number, bold = false, size = 9): string[] => {
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(size);
    const result: string[] = [];
    for (const paragraph of text.split(/\r?\n/)) {
      let current = "";
      for (const token of paragraph.split(/(\s+)/)) {
        if (doc.widthOfString(current + token) <= cellWidth) { current += token; continue; }
        if (current) result.push(current.trimEnd()); current = "";
        for (const character of token) {
          if (current && doc.widthOfString(current + character) > cellWidth) { result.push(current); current = ""; }
          current += character;
        }
      }
      result.push(current.trimEnd());
    }
    return result;
  };
  const renderTable = async (table: PdfTable) => {
    const weight = table.widths.reduce((sum, value) => sum + value, 0), widths = table.widths.map(value => value / weight * width);
    const headLines = table.headers.map((text, column) => lines(text, widths[column] - 12, true, 8));
    const headHeight = Math.max(...headLines.map(values => values.length)) * lineHeight + 8;
    const headings = () => {
      write(table.title, left, y, 11, true); y += 23;
      doc.rect(left, y, width, headHeight).fill("#f2f5f7");
      let x = left;
      headLines.forEach((values, column) => { values.forEach((text, index) => write(text, x + 6, y + 4 + index * lineHeight, 8, true)); x += widths[column]; });
      y += headHeight;
    };
    if (y + headHeight + 65 > bottom) newPage();
    headings();
    if (!table.rows.length) { write("No records for the selected dates.", left + 6, y + 9); y += 32; rule(y); }
    for (let rowIndex = 0; rowIndex < table.rows.length; rowIndex++) {
      if (rowIndex % 20 === 0) await new Promise<void>(resolve => setImmediate(resolve));
      const cells = table.rows[rowIndex].map((text, column) => lines(text, widths[column] - 12));
      const count = Math.max(...cells.map(values => values.length));
      let offset = 0;
      while (offset < count) {
        const room = Math.floor((bottom - y - 8) / lineHeight);
        if (room < 1 || offset === 0 && count <= 8 && count > room) { newPage(); headings(); continue; }
        const take = Math.min(room, count - offset), height = take * lineHeight + 8;
        if (rowIndex % 2) doc.rect(left, y, width, height).fill("#fafbfc");
        let x = left;
        cells.forEach((values, column) => {
          const visible = column === 0 && offset && values.length <= offset ? values.slice(0, take) : values.slice(offset, offset + take);
          visible.forEach((text, index) => write(text, x + 6, y + 4 + index * lineHeight)); x += widths[column];
        });
        y += height; rule(y); offset += take;
      }
    }
    if (table.note) for (const text of lines(table.note, width)) { if (y + 24 > bottom) newPage(); write(text, left, y + 6, 8); y += 14; }
    y += 22;
  };
  header(true);
  const empty = !report.jobs.length && !(report.roadAlerts?.length);
  for (let index = 0; index < sections.length; index++) {
    sectionName = sections[index].name;
    if (index) newPage();
    else { write(sectionName, left, y, 15, true); y += 29; }
    for (const table of empty ? sections[index].tables.slice(0, 1) : sections[index].tables) await renderTable(table);
    if (empty) { write("No jobs or GPSLive zone-entry records for the selected dates.", left, y, 9); break; }
  }
  const totalPaymentPence = Object.values(report.summary.systemPaymentsByMethodPence).reduce(addReportMoney, 0);
  const totalPayment = `GBP ${(totalPaymentPence / 100).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  sectionName = "Total Payment";
  if (y + 104 > bottom) newPage();
  const totalY = Math.max(y + 8, bottom - 88);
  doc.rect(left, totalY, width, 80).fill("#e8f4ee");
  write("TOTAL PAYMENT", left + 18, totalY + 14, 16, true);
  doc.font("Helvetica-Bold").fontSize(28).fillColor("#176447").text(totalPayment, left + width / 2, totalY + 12, { width: width / 2 - 18, align: "right", lineBreak: false });
  write("Recorded payment methods including invoices", left + 18, totalY + 48, 9);
  if (report.summary.paymentCards.jobFlowUnknownJobs) write("Recorded subtotal; some payment records require verification.", left + 18, totalY + 62, 8);
  const pages = doc.bufferedPageRange();
  for (let index = 0; index < pages.count; index++) {
    doc.switchToPage(index);
    const margin = doc.page.margins.bottom; doc.page.margins.bottom = 0;
    rule(doc.page.height - 39); write(`Page ${index + 1} of ${pages.count}`, left + width - 80, doc.page.height - 28, 8);
    doc.page.margins.bottom = margin;
  }
  doc.end();
  return complete;
}
