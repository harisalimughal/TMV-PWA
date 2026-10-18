/**
 * File formats for the driver job report. Each one lays out the same DriverJobReport
 * model, so the formats can never disagree on jobs or totals.
 *
 * XLSX and DOCX are real Office Open XML packages (a zip of XML parts), written here
 * with fflate rather than a large office library: the report needs two sheets and a
 * few tables, and keeping it small keeps the admin chunk lean. Both open in Excel,
 * Word, LibreOffice, Google Sheets and Google Docs (File > Import).
 */
import { strToU8, zipSync } from "fflate";
import { DateTime } from "luxon";
import {
  JOB_COLUMNS, NOT_AVAILABLE, cellText, combinedSummary, generatedLabel, lineText, reportStatus, type DriverJobReport, type JobLine, type SummaryLine
} from "./driverJobReport";
import { rangeLabel } from "./reportPeriods";

export type ReportFormat = "pdf" | "xlsx" | "csv" | "docx";
export const MIME: Record<ReportFormat, string> = {
  pdf: "application/pdf",
  csv: "text/csv;charset=utf-8",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
};

const xml = (value: string) => value.replace(/[<>&"']/g, char => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" }[char]!))
  // Characters XML 1.0 cannot hold (control codes from pasted text) are dropped.
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");

/* -------------------------------------------------------------------- CSV ---- */

/** A text cell starting with = + - @ (or a tab/CR) would run as a formula in Excel or
 *  Sheets; prefixing an apostrophe shows it as text. Numbers are written bare. */
export function csvCell(value: string | number | null): string {
  if (value === null) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

const UNIT_LABEL: Record<SummaryLine["unit"], string> = { pence: "GBP", minutes: "minutes", count: "count" };
const csvAmount = (value: number | null, unit: SummaryLine["unit"]): number | null => value === null ? null : unit === "pence" ? Math.round(value) / 100 : Math.round(value);

const JOB_HEADERS = ["Driver", "Driver code", ...JOB_COLUMNS.map(column => column.header + (column.unit === "pence" ? " (GBP)" : column.unit === "minutes" ? " (minutes)" : ""))];
function csvValue(line: JobLine, column: (typeof JOB_COLUMNS)[number]): string | number | null {
  const value = line[column.key];
  if (value === null || value === undefined) return null;
  if (column.unit === "pence") return Math.round(value as number) / 100;
  if (column.unit === "minutes") return Math.round(value as number);
  return String(value);
}

/**
 * One file, four labelled sections, each a normal CSV table with its own header row, separated by a blank line:
 *
 *   REPORT           field and value pairs: status, period, drivers, generated, source, notes
 *   DRIVER SUMMARY   one row per driver and measure
 *   OVERALL SUMMARY  the combined totals (only when more than one driver was selected)
 *   JOB RECORDS      one row per job
 *
 * Money is in pounds and durations in whole minutes, as plain numbers. A figure the source did not
 * provide is an empty cell with Coverage "unavailable", never 0. UTF-8 with a byte-order mark so Excel reads £.
 * Nothing outside this repository reads the file (it is only downloaded), so the sections are not a compatibility
 * break; a tool that wants only the jobs reads from the JOB RECORDS header row down.
 */
export function toCsv(report: DriverJobReport): string {
  const status = reportStatus(report);
  const rows: Array<Array<string | number | null>> = [
    ["REPORT"], ["Field", "Value"],
    ["Report", report.title], ["Status", status.label], ...status.reasons.map(reason => ["Status detail", reason]),
    ["Period", `${rangeLabel(report.range)}, London time`],
    ["Drivers", report.sections.map(section => `${section.driver.name} (${section.driver.initials})`).join("; ") || "None"],
    ["Generated", generatedLabel(report.generatedAt)], ["Source", report.sources.join("; ") || "Driver report API"],
    ...(report.notes ?? []).map(note => ["Note", note]), [],
    ["DRIVER SUMMARY"], ["Driver", "Driver code", "Measure", "Total", "Unit", "Coverage", "Notes"]
  ];
  for (const section of report.sections) for (const line of section.summary) rows.push([section.driver.name, section.driver.initials, line.label, csvAmount(line.value, line.unit), UNIT_LABEL[line.unit], line.coverage, line.note ?? null]);
  const combined = combinedSummary(report);
  if (combined) {
    rows.push([], ["OVERALL SUMMARY"], ["Measure", "Total", "Unit", "Coverage", "Known subtotal", "Notes"]);
    for (const line of combined) rows.push([line.label, csvAmount(line.value, line.unit), UNIT_LABEL[line.unit], line.coverage, csvAmount(line.knownSubtotal ?? null, line.unit), line.note ?? null]);
  }
  rows.push([], ["JOB RECORDS"], JOB_HEADERS);
  for (const section of report.sections) for (const line of section.jobs) rows.push([section.driver.name, section.driver.initials, ...JOB_COLUMNS.map(column => csvValue(line, column))]);
  return "\uFEFF" + rows.map(row => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

/* ------------------------------------------------------------------- XLSX ---- */

type Cell = { kind: "text"; value: string; style?: number } | { kind: "number"; value: number; style?: number } | { kind: "empty"; style?: number };
const S = { text: 0, header: 1, money: 2, duration: 3, date: 4, title: 5, muted: 6, count: 7 };

const colName = (index: number) => { let name = "", n = index + 1; while (n > 0) { const r = (n - 1) % 26; name = String.fromCharCode(65 + r) + name; n = Math.floor((n - 1) / 26); } return name; };
const excelDate = (iso: string) => DateTime.fromISO(iso, { zone: "utc" }).diff(DateTime.utc(1899, 12, 30), "days").days;

interface SheetOptions { freezeRow?: number; autoFilter?: string }
function sheetXml(rows: Cell[][], widths: number[], options: SheetOptions = {}): string {
  const freezeRow = options.freezeRow ?? 0;
  const body = rows.map((row, r) => `<row r="${r + 1}">${row.map((cell, c) => {
    const ref = `${colName(c)}${r + 1}`, style = cell.style ? ` s="${cell.style}"` : "";
    if (cell.kind === "number") return `<c r="${ref}"${style}><v>${cell.value}</v></c>`;
    if (cell.kind === "text") return `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${xml(cell.value)}</t></is></c>`;
    return `<c r="${ref}"${style}/>`;
  }).join("")}</row>`).join("");
  const pane = freezeRow ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${freezeRow}" topLeftCell="A${freezeRow + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` : `<sheetViews><sheetView workbookViewId="0"/></sheetViews>`;
  const cols = `<cols>${widths.map((width, i) => `<col min="${i + 1}" max="${i + 1}" width="${width}" customWidth="1"/>`).join("")}</cols>`;
  // Element order follows the schema: sheetPr, sheetViews, cols, sheetData, autoFilter, pageMargins, pageSetup.
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>${pane}${cols}<sheetData>${body}</sheetData>${options.autoFilter ? `<autoFilter ref="${options.autoFilter}"/>` : ""}<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/><pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>`;
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="3"><numFmt numFmtId="164" formatCode="&quot;£&quot;#,##0.00"/><numFmt numFmtId="165" formatCode="[h]:mm"/><numFmt numFmtId="166" formatCode="d mmm yyyy"/></numFmts>
<fonts count="4"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="14"/><name val="Calibri"/></font><font><sz val="10"/><color rgb="FF5B6670"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF1F3F6"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top/><bottom style="thin"><color rgb="FFD6DDE3"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="8"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="1" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

const text = (value: string, style?: number): Cell => ({ kind: "text", value, style });
const MUTED_NA = (): Cell => text(NOT_AVAILABLE, S.muted);
const valueCell = (value: number | null, unit: SummaryLine["unit"]): Cell => value === null ? MUTED_NA()
  : unit === "pence" ? { kind: "number", value: Math.round(value) / 100, style: S.money }
  : unit === "minutes" ? { kind: "number", value: Math.round(value) / 1440, style: S.duration }
  : { kind: "number", value, style: S.count };

function summaryRows(report: DriverJobReport): Cell[][] {
  const status = reportStatus(report);
  const rows: Cell[][] = [
    [text("THE MAN VAN", S.title)],
    [text(report.title, S.title)],
    [text("Status", S.muted), text(status.label)],
    ...status.reasons.map(reason => [text("Status detail", S.muted), text(reason)]),
    [text("Period", S.muted), text(`${rangeLabel(report.range)}, London time`)],
    [text("Generated", S.muted), text(generatedLabel(report.generatedAt))],
    [text("Source", S.muted), text(report.sources.join("; ") || "Driver report API")],
    ...(report.notes ?? []).map(note => [text("Note", S.muted), text(note)]),
    []
  ];
  const block = (heading: string, lines: SummaryLine[], warnings: string[] = []) => {
    rows.push([text(heading, S.header), text("Total", S.header), text("Coverage", S.header), text("Known subtotal", S.header), text("Notes", S.header)]);
    for (const line of lines) rows.push([text(line.label), valueCell(line.value, line.unit), text(line.coverage, S.muted), line.knownSubtotal != null ? valueCell(line.knownSubtotal, line.unit) : { kind: "empty" }, line.note ? text(line.note, S.muted) : { kind: "empty" }]);
    for (const warning of warnings) rows.push([text("Note", S.muted), { kind: "empty" }, { kind: "empty" }, { kind: "empty" }, text(warning, S.muted)]);
    rows.push([]);
  };
  for (const section of report.sections) block(`${section.driver.name} (${section.driver.initials})`, section.summary, section.warnings);
  const combined = combinedSummary(report);
  if (combined) block("All selected drivers", combined);
  return rows;
}

function jobRows(report: DriverJobReport): Cell[][] {
  const rows: Cell[][] = [["Driver", "Driver code", ...JOB_COLUMNS.map(column => column.header)].map(header => text(header, S.header))];
  for (const section of report.sections) for (const line of section.jobs) {
    rows.push([text(section.driver.name), text(section.driver.initials), ...JOB_COLUMNS.map((column): Cell => {
      const value = line[column.key];
      if (value === null || value === undefined) return MUTED_NA();
      if (column.unit === "date") return { kind: "number", value: excelDate(value as string), style: S.date };
      if (column.unit === "pence" || column.unit === "minutes") return valueCell(value as number, column.unit);
      return text(String(value));
    })]);
  }
  return rows;
}

// new Uint8Array(...) copies into this realm's Uint8Array: fflate tells files from folders
// with instanceof, and an encoder's array from another realm (jsdom, iframes) would fail it.
const zip = (files: Record<string, string>) => zipSync(Object.fromEntries(Object.entries(files).map(([name, content]) => [name, new Uint8Array(strToU8(content))])), { level: 6, mtime: new Date("2026-01-01T00:00:00Z") });

export function toXlsx(report: DriverJobReport): Uint8Array {
  const jobSheet = jobRows(report);
  const lastColumn = colName(jobSheet[0].length - 1);
  const sheets = [
    { name: "Summary", xml: sheetXml(summaryRows(report), [34, 18, 14, 16, 70]) },
    { name: "Jobs", xml: sheetXml(jobSheet, [18, 10, ...JOB_COLUMNS.map(column => column.width)], { freezeRow: 1, autoFilter: `A1:${lastColumn}${jobSheet.length}` }) }
  ];
  const ct = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`;
  const files: Record<string, string> = {
    "[Content_Types].xml": ct,
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`,
    "docProps/core.xml": coreProps(report),
    "xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((sheet, i) => `<sheet name="${sheet.name}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets><definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="1" hidden="1">Jobs!$A$1:$${lastColumn}$${jobSheet.length}</definedName></definedNames></workbook>`,
    "xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    "xl/styles.xml": STYLES
  };
  sheets.forEach((sheet, i) => { files[`xl/worksheets/sheet${i + 1}.xml`] = sheet.xml; });
  return zip(files);
}

function coreProps(report: DriverJobReport): string {
  const drivers = report.sections.map(section => `${section.driver.name} (${section.driver.initials})`).join(", ");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xml(report.title)}</dc:title><dc:subject>${xml(`${drivers} · ${rangeLabel(report.range)}`)}</dc:subject><dc:creator>The Man Van dashboard</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${report.generatedAt.replace(/\.\d+Z$/, "Z")}</dcterms:created></cp:coreProperties>`;
}

/* ------------------------------------------------------------------- DOCX ---- */

const run = (value: string, opts: { bold?: boolean; size?: number; color?: string } = {}) =>
  `<w:r><w:rPr>${opts.bold ? "<w:b/>" : ""}${opts.color ? `<w:color w:val="${opts.color}"/>` : ""}<w:sz w:val="${opts.size ?? 18}"/></w:rPr><w:t xml:space="preserve">${xml(value)}</w:t></w:r>`;
/** Paragraph properties are written in the order the WordprocessingML schema requires:
 *  pStyle, keepNext, pageBreakBefore, spacing, jc. */
const para = (content: string, opts: { after?: number; keepNext?: boolean; pageBreakBefore?: boolean; align?: "right"; style?: "Title" | "Heading1" | "Heading2" } = {}) =>
  `<w:p><w:pPr>${opts.style ? `<w:pStyle w:val="${opts.style}"/>` : ""}${opts.keepNext ? "<w:keepNext/>" : ""}${opts.pageBreakBefore ? "<w:pageBreakBefore/>" : ""}<w:spacing w:before="0" w:after="${opts.after ?? 80}"/>${opts.align ? `<w:jc w:val="${opts.align}"/>` : ""}</w:pPr>${content}</w:p>`;
const tcell = (value: string, width: number, header = false, right = false) =>
  `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${header ? `<w:shd w:val="clear" w:color="auto" w:fill="F1F3F6"/>` : ""}</w:tcPr>${para(run(value, { bold: header, size: 16 }), { after: 0, align: right ? "right" : undefined })}</w:tc>`;
const table = (headers: string[], rows: string[][], widths: number[], right: ReadonlySet<number> = new Set()) =>
  `<w:tbl><w:tblPr><w:tblW w:w="${widths.reduce((a, b) => a + b, 0)}" w:type="dxa"/><w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="D6DDE3"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="D6DDE3"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="E3E8EC"/></w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="70" w:type="dxa"/><w:right w:w="70" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${widths.map(w => `<w:gridCol w:w="${w}"/>`).join("")}</w:tblGrid>`
  + `<w:tr><w:trPr><w:cantSplit/><w:tblHeader/></w:trPr>${headers.map((h, i) => tcell(h, widths[i], true, right.has(i))).join("")}</w:tr>`
  + rows.map(row => `<w:tr><w:trPr><w:cantSplit/></w:trPr>${row.map((v, i) => tcell(v, widths[i], false, right.has(i))).join("")}</w:tr>`).join("") + `</w:tbl>`;

/** The Word report drops two long columns (pickup and drop-off are in the spreadsheet
 *  formats) so the job table stays readable on A4 landscape. Widths are twentieths of a point
 *  and fit within the 15,138 available between the margins. */
const DOCX_COLUMNS = JOB_COLUMNS.filter(column => column.key !== "pickup" && column.key !== "dropoff");
export const DOCX_WIDTHS = [1500, 1100, 700, 1700, 1100, 1150, 1150, 1400, 1250, 1350, 1250, 1300];
const DOCX_RIGHT = new Set(DOCX_COLUMNS.flatMap((column, index) => column.unit === "pence" || column.unit === "minutes" ? [index] : []));

const DOCX_STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="18"/><w:szCs w:val="18"/><w:lang w:val="en-GB"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="80" w:line="259" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>`
  + `<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>`
  + `<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="0" w:after="120"/></w:pPr><w:rPr><w:b/><w:sz w:val="40"/><w:szCs w:val="40"/></w:rPr></w:style>`
  + `<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="100"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr></w:style>`
  + `<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="160" w:after="80"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:style></w:styles>`;

export function toDocx(report: DriverJobReport): Uint8Array {
  const status = reportStatus(report);
  const statusColor = status.status === "PARTIAL" ? "8A4B00" : "1D2329";
  const body: string[] = [
    para(run("THE MAN VAN", { bold: true, size: 20, color: "5B6670" }), { after: 0 }),
    para(run(report.title, { bold: true, size: 40 }), { style: "Title" }),
    para(run(`Report status: ${status.label}`, { bold: true, color: statusColor })),
    ...status.reasons.map(reason => para(run(reason, { color: statusColor, size: 16 }))),
    para(run(`Period: ${rangeLabel(report.range)}, London time`)),
    para(run(`Generated: ${generatedLabel(report.generatedAt)}`)),
    para(run(`Source: ${report.sources.join("; ") || "Driver report API"}`, { color: "5B6670" }), { after: 200 }),
    ...(report.notes ?? []).map(note => para(run(note, { color: "5B6670" })))
  ];
  const summaryTable = (lines: SummaryLine[]) => table(["Measure", "Total", "Notes"], lines.map(line => [line.label, lineText(line), line.note ?? ""]), [4200, 2400, 8538], new Set([1]));
  report.sections.forEach((section, index) => {
    body.push(para(run(`${section.driver.name} (${section.driver.initials})`, { bold: true, size: 28 }), { style: "Heading1", keepNext: true, pageBreakBefore: index > 0, after: 100 }));
    body.push(summaryTable(section.summary));
    for (const warning of section.warnings) body.push(para(run(warning, { color: "8A4B00", size: 16 })));
    body.push(para(run(`Jobs (${section.jobs.length}${section.jobs.length < section.jobTotal ? ` of ${section.jobTotal}` : ""})`, { bold: true, size: 22 }), { style: "Heading2", keepNext: true, after: 80 }));
    body.push(section.jobs.length
      ? table(DOCX_COLUMNS.map(column => column.header), section.jobs.map(line => DOCX_COLUMNS.map(column => cellText(line, column))), DOCX_WIDTHS, DOCX_RIGHT)
      : para(run("No jobs found for the selected period.", { color: "5B6670" })));
    body.push(para("", { after: 200 }));
  });
  const combined = combinedSummary(report);
  if (combined) { body.push(para(run("All selected drivers", { bold: true, size: 28 }), { style: "Heading1", keepNext: true, pageBreakBefore: true })); body.push(summaryTable(combined)); }
  body.push(para(run("Final charges are billed amounts and include invoices; recorded receipts, unpaid invoices and manual entries are separate measures. Per-job Final charge is the amount the driver entered at completion, and the Final charges total is the sum of those amounts.", { size: 15, color: "5B6670" }), { after: 0 }));
  const footer = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${para(run(`${report.title} · ${rangeLabel(report.range)} · ${status.label} · Page `, { size: 16, color: "5B6670" }) + `<w:fldSimple w:instr="PAGE"><w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:t>1</w:t></w:r></w:fldSimple>`, { after: 0, align: "right" })}</w:ftr>`;
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${body.join("")}<w:sectPr><w:footerReference w:type="default" r:id="rId2"/><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/><w:pgMar w:top="850" w:right="850" w:bottom="850" w:left="850" w:header="400" w:footer="400" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  return zip({
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`,
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`,
    "word/_rels/document.xml.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/></Relationships>`,
    "word/document.xml": document,
    "word/styles.xml": DOCX_STYLES,
    "word/footer1.xml": footer,
    "docProps/core.xml": coreProps(report)
  });
}

/* --------------------------------------------------------------- download ---- */

export function saveFile(data: BlobPart, type: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = filename; document.body.appendChild(anchor);
  try { anchor.click(); } finally { anchor.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 60_000); }
}
