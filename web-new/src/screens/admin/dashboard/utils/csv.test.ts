import { describe, it, expect } from "vitest";
import { sanitizeCsvCell, toCsv } from "./csv";

describe("sanitizeCsvCell", () => {
  it("passes ordinary text through unchanged", () => {
    expect(sanitizeCsvCell("hello world")).toBe("hello world");
    expect(sanitizeCsvCell("Acme Removals Ltd")).toBe("Acme Removals Ltd");
  });

  it("quotes cells containing a comma", () => {
    expect(sanitizeCsvCell("12 High Street, London")).toBe('"12 High Street, London"');
  });

  it("quotes and doubles embedded double-quotes", () => {
    expect(sanitizeCsvCell('she said "hi"')).toBe('"she said ""hi"""');
  });

  it("quotes cells containing newlines (LF and CRLF)", () => {
    expect(sanitizeCsvCell("line1\nline2")).toBe('"line1\nline2"');
    expect(sanitizeCsvCell("line1\r\nline2")).toBe('"line1\r\nline2"');
  });

  it("neutralises a leading = formula", () => {
    expect(sanitizeCsvCell("=SUM(A1:A2)")).toBe("'=SUM(A1:A2)");
    expect(sanitizeCsvCell('=HYPERLINK("http://evil","x")')).toBe(
      '"\'=HYPERLINK(""http://evil"",""x"")"'
    );
  });

  it("neutralises a leading + formula", () => {
    expect(sanitizeCsvCell("+cmd|' /C calc'!A0")).toBe("'+cmd|' /C calc'!A0");
  });

  it("neutralises a leading @ formula", () => {
    expect(sanitizeCsvCell("@SUM(1)")).toBe("'@SUM(1)");
  });

  it("neutralises a leading - expression that is not a plain number", () => {
    expect(sanitizeCsvCell("-1+2")).toBe("'-1+2");
    expect(sanitizeCsvCell("-2-3-cmd")).toBe("'-2-3-cmd");
  });

  it("neutralises a formula hidden behind leading whitespace / tab", () => {
    expect(sanitizeCsvCell("   =1+1")).toBe("'   =1+1");
    // A leading TAB is stripped before the formula check; TAB itself does not force
    // RFC-4180 quoting, so the result is just the prefixed value.
    expect(sanitizeCsvCell("\t=1+1")).toBe("'\t=1+1");
  });

  it("does not mutate genuine numbers", () => {
    expect(sanitizeCsvCell(1234)).toBe("1234");
    expect(sanitizeCsvCell(-42)).toBe("-42");
    expect(sanitizeCsvCell(3.14)).toBe("3.14");
    expect(sanitizeCsvCell("-1")).toBe("-1");
    expect(sanitizeCsvCell("-12.5")).toBe("-12.5");
    expect(sanitizeCsvCell("1e5")).toBe("1e5");
    expect(sanitizeCsvCell("-1.5e-3")).toBe("-1.5e-3");
  });

  it("renders null / undefined as an empty cell", () => {
    expect(sanitizeCsvCell(null)).toBe("");
    expect(sanitizeCsvCell(undefined)).toBe("");
  });

  it("neutralises then quotes a value that is both a formula and contains a comma", () => {
    expect(sanitizeCsvCell("=1,2")).toBe('"\'=1,2"');
  });
});

describe("toCsv", () => {
  const rows = [
    { name: "Ada Lovelace", note: "on time" },
    { name: "=cmd()", note: "flagged, urgent" }
  ];
  const columns = [
    { header: "Name", value: (r: (typeof rows)[number]) => r.name },
    { header: "Note", value: (r: (typeof rows)[number]) => r.note }
  ];

  it("prefixes a UTF-8 BOM and joins rows with CRLF", () => {
    const csv = toCsv(rows, columns);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const body = csv.slice(1);
    expect(body.split("\r\n")[0]).toBe("Name,Note");
  });

  it("sanitises formula-injection payloads in body cells", () => {
    const csv = toCsv(rows, columns);
    const lines = csv.slice(1).split("\r\n");
    expect(lines[1]).toBe("Ada Lovelace,on time");
    // "=cmd()" is neutralised; "flagged, urgent" is quoted for its comma.
    expect(lines[2]).toBe("'=cmd(),\"flagged, urgent\"");
  });
});
