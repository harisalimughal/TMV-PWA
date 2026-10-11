import ExcelJS from "exceljs";
import { assertExportCellBudget, exportLabel, exportSections, type ExportCell, type ExportReport } from "./driver-report-export.model";

export function spreadsheetText(value: string): string {
  const clean = value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
  if (clean.length > 32766) throw new RangeError("A report field exceeds Excel's cell limit; verify source data.");
  return /^[\s]*[=+@-]/.test(clean) ? `'${clean}` : clean;
}
const currency = '"GBP "#,##0.00;[Red]-"GBP "#,##0.00';
export function exportCellValue(value: ExportCell, key: string): ExcelJS.CellValue {
  if (value === null) return "Unknown";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new RangeError("Report contains a non-finite number.");
    if (/Pence(?:\.|$)/.test(key) && (!Number.isSafeInteger(value) || Math.abs(value) > 999_999_999_999_999)) throw new RangeError("A monetary amount exceeds exact Excel currency precision; verify source data.");
    return /Pence(?:\.|$)/.test(key) ? value / 100 : value;
  }
  return typeof value === "string" ? spreadsheetText(value) : value ? "Yes" : "No";
}
export async function generateDriverReportXlsx(report: ExportReport): Promise<Buffer> {
  const sections = exportSections(report); assertExportCellBudget(sections);
  const book = new ExcelJS.Workbook();
  book.creator = "TMV"; book.created = new Date(report.generatedAt); book.modified = book.created;
  for (const section of sections) {
    const sheet = book.addWorksheet(section.name, { views: [{ state: "frozen", ySplit: 4 }],
      pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 } });
    sheet.addRow([spreadsheetText(`TMV | ${section.name} | ${report.driver.name} (${report.driver.initials})`)]);
    sheet.addRow([`Generated ${report.generatedAt} | Europe/London | Unknown is not zero | Money: GBP | Durations: minutes/hours/seconds as labelled`]);
    let firstHeader = 0;
    for (const table of section.tables) {
      const title = sheet.addRow([spreadsheetText(table.title)]); title.font = { bold: true, size: 12, color: { argb: "FF1678B5" } };
      const headers = table.headers.map(header => spreadsheetText(exportLabel(header)));
      const header = sheet.addRow(headers);
      firstHeader ||= header.number;
      header.font = { bold: true, color: { argb: "FFFFFFFF" } };
      header.eachCell(cell => { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1678B5" } }; });
      header.height = 56; header.alignment = { wrapText: true, vertical: "middle" };
      let rowIndex = 0;
      for (const values of table.rows) {
        if (rowIndex++ % 100 === 0) await new Promise<void>(resolve => setImmediate(resolve));
        const row = sheet.addRow(values.map((value, index) => index === 0 && table.headers[0] === "Metric" ? exportLabel(String(value)) : exportCellValue(value, table.headers[index] === "Value" ? String(values[0]) : table.headers[index])));
        row.eachCell((cell, index) => {
          const key = table.headers[index - 1] === "Value" ? String(values[0]) : table.headers[index - 1];
          if (typeof cell.value === "number") cell.numFmt = /Pence(?:\.|$)/.test(key) ? currency : /(?:Jobs|Count|Records|Blocks|Seconds)$/i.test(key) ? "0" : "0.00";
          cell.alignment = { vertical: "top", wrapText: true, horizontal: typeof cell.value === "number" ? "right" : "left", indent: 1 };
          cell.border = { bottom: { style: "hair", color: { argb: "FFDCE3E7" } }, right: { style: "hair", color: { argb: "FFDCE3E7" } } };
          if (row.number % 2 === 0) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F6F8" } };
        });
      }
      if (!table.rows.length) sheet.addRow(["No records in the selected range."]).alignment = { wrapText: true, vertical: "top", indent: 1 };
      sheet.addRow([]);
    }
    const maxColumns = Math.max(...section.tables.map(table => table.headers.length));
    for (let index = 1; index <= maxColumns; index++) {
      const keys = section.tables.map(table => table.headers[index - 1] || "");
      sheet.getColumn(index).width = keys.some(key => /description/.test(key)) ? 120 : section.name === "Summary" ? index === 1 ? 48 : 70 : keys.some(key => /issues|Snapshot|photos|chargeItems/.test(key)) ? 55 : 26;
    }
    sheet.eachRow(row => {
      if (row.number <= 2 || row.font?.bold) return;
      let lines = 1;
      row.eachCell((cell, index) => { lines = Math.max(lines, Math.ceil(String(cell.value ?? "").length / Math.max(10, (sheet.getColumn(index).width || 26) - 4))); });
      row.height = Math.min(409, Math.max(22, lines * 14 + 8));
    });
    if (maxColumns > 1) { sheet.mergeCells(1, 1, 1, Math.min(maxColumns, 8)); sheet.mergeCells(2, 1, 2, Math.min(maxColumns, 8)); }
    const titleWidth = Array.from({ length: Math.min(maxColumns, 8) }, (_, index) => sheet.getColumn(index + 1).width || 26).reduce((sum, value) => sum + value, 0);
    sheet.getRow(1).font = { bold: true, size: 16, color: { argb: "FF12303C" } };
    sheet.getRow(1).alignment = { wrapText: true, vertical: "middle" };
    sheet.getRow(1).height = Math.max(30, Math.ceil(String(sheet.getCell(1, 1).value).length / Math.max(15, titleWidth / 1.5)) * 22 + 6);
    sheet.getRow(2).font = { size: 10, color: { argb: "FF52636C" } }; sheet.getRow(2).alignment = { wrapText: true, vertical: "middle" };
    sheet.getRow(2).height = Math.max(30, Math.ceil(String(sheet.getCell(2, 1).value).length / Math.max(15, titleWidth - 4)) * 14 + 6);
    // One native filter per sheet covers its primary table; further tables retain their own headers.
    const primary = section.tables[0];
    sheet.autoFilter = { from: { row: firstHeader, column: 1 }, to: { row: firstHeader + primary.rows.length, column: primary.headers.length } };
    sheet.pageSetup.printTitlesRow = `1:${firstHeader}`;
    sheet.headerFooter.oddFooter = "&LTMV | Confidential driver report&RPage &P of &N";
  }
  return Buffer.from(await book.xlsx.writeBuffer());
}
