/**
 * CSV export.
 *
 * The dashboard had "Export CSV" and "Export Selection" buttons with no onClick at
 * all -- a manager who clicked one three times and got nothing stops trusting every
 * other control on the page. These are the real thing.
 *
 * `sanitizeCsvCell` is the single canonical cell encoder for every client-side CSV in
 * the dashboard -- do not hand-roll another one. It handles two separate concerns:
 *
 *  1. CSV structure (RFC 4180): quote any cell containing the delimiter, a double
 *     quote, or a newline, doubling embedded quotes.
 *  2. Spreadsheet formula injection: a cell whose first non-whitespace character is
 *     "=", "+", "-" or "@" is executed as a formula by Excel / Google Sheets /
 *     LibreOffice when the file is opened -- so a customer name like
 *     =HYPERLINK("http://evil","click") becomes a live payload in an operator's
 *     spreadsheet. The standard mitigation is to prefix the value with a single
 *     quote, which every spreadsheet renders back as literal text. Leading
 *     whitespace is stripped first, because spreadsheets skip it before deciding
 *     whether the cell is a formula.
 *
 * Genuine numbers (123, -1, 3.14, 1e5) are left untouched so numeric columns still
 * import as numbers.
 */

/** First non-whitespace char of one of these => spreadsheets may evaluate the cell. */
const FORMULA_TRIGGERS = ["=", "+", "-", "@"];
/** A plain (optionally signed / decimal / exponent) number -- safe, never prefixed. */
const PLAIN_NUMBER = /^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/;

function needsFormulaGuard(text: string): boolean {
  // Spreadsheets ignore leading whitespace (space, tab, CR, LF) before parsing a
  // cell, so strip it before inspecting the first real character.
  const stripped = text.replace(/^\s+/, "");
  if (stripped === "") return false;
  if (!FORMULA_TRIGGERS.includes(stripped[0])) return false;
  // "-1" / "3.14" on their own are just numbers -- don't mutate them.
  return !PLAIN_NUMBER.test(stripped);
}

export function sanitizeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  // Real numbers are always safe: emit them verbatim, no formula guard.
  let text = String(value);
  if (typeof value !== "number" && needsFormulaGuard(text)) {
    text = "'" + text;
  }
  // Quote anything containing a delimiter, quote or newline; double up inner quotes.
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function toCsv<T>(rows: T[], columns: Array<{ header: string; value: (row: T) => unknown }>): string {
  const head = columns.map(c => sanitizeCsvCell(c.header)).join(",");
  const body = rows.map(row => columns.map(c => sanitizeCsvCell(c.value(row))).join(","));
  // BOM so Excel opens UTF-8 (£ signs and accented names) correctly rather than as
  // mojibake -- this is the single most common complaint about exported CSVs.
  return "\uFEFF" + [head, ...body].join("\r\n");
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Revoke on the next tick -- revoking synchronously can cancel the download in
  // some browsers before it has started reading the blob.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** yyyy-MM-dd for filenames, in Europe/London. */
export function stampForFilename(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
}
