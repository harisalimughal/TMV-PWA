/**
 * PDF layout of the driver job report, printed through PrintPortal like the other
 * report documents. A4 landscape; the job table flows across pages with its header
 * repeated on each one and no row split between pages. Same model and the same
 * cell text as the Word and spreadsheet formats.
 */
import React from "react";
import { JOB_COLUMNS, PDF_SHARE, cellText, isMissingText, combinedSummary, generatedLabel, lineText, reportStatus, type DriverJobReport, type SummaryLine } from "./driverJobReport";
import { rangeLabel } from "./reportPeriods";

const CSS = `
  @page { size: A4 landscape; margin: 12mm; }
  .report-driver-jobs { font-family: var(--font-sans), Arial, sans-serif; color: #1d2329; background: #fff; font-variant-numeric: tabular-nums; }
  .report-driver-jobs .rdj-head { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding-bottom: 10px; margin-bottom: 12px; border-bottom: 1px solid #d6dde3; }
  .report-driver-jobs .rdj-head img { height: 34px; width: 34px; object-fit: contain; }
  .report-driver-jobs .rdj-brand { display: flex; align-items: center; gap: 10px; }
  .report-driver-jobs .rdj-company { margin: 0; font-size: 10px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #5b6670; }
  .report-driver-jobs h1 { margin: 0; font-size: 20px; font-weight: 700; }
  .report-driver-jobs .rdj-meta { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 4px 18px; margin: 0 0 14px; font-size: 11px; }
  .report-driver-jobs .rdj-meta dt { font-size: 9px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: #6b7680; }
  .report-driver-jobs .rdj-meta dd { margin: 0; font-weight: 600; }
  .report-driver-jobs h2 { margin: 16px 0 6px; font-size: 14px; font-weight: 700; break-after: avoid; }
  .report-driver-jobs h3 { margin: 10px 0 5px; font-size: 12px; font-weight: 700; break-after: avoid; }
  .report-driver-jobs table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  .report-driver-jobs thead { display: table-header-group; }
  .report-driver-jobs tr { break-inside: avoid; page-break-inside: avoid; }
  .report-driver-jobs th { padding: 4px 5px; background: #f1f3f6; border-bottom: 1px solid #d6dde3; text-align: left; font-size: 8.5px; font-weight: 700; }
  .report-driver-jobs td { padding: 4px 5px; border-bottom: 1px solid #edf1f4; font-size: 8.5px; line-height: 1.35; vertical-align: top; overflow-wrap: break-word; word-break: normal; }
  .report-driver-jobs td.rdj-num, .report-driver-jobs th.rdj-num { text-align: right; }
  .report-driver-jobs .rdj-summary { width: 70%; }
  .report-driver-jobs .rdj-summary td { font-size: 10px; }
  .report-driver-jobs .rdj-missing { color: #6b7680; }
  .report-driver-jobs .rdj-warn { margin: 4px 0; font-size: 10px; color: #8a4b00; }
  .report-driver-jobs .rdj-empty { margin: 6px 0; font-size: 11px; color: #5b6670; }
  .report-driver-jobs .rdj-section + .rdj-section { break-before: page; page-break-before: always; }
  .report-driver-jobs .rdj-foot { margin-top: 14px; padding-top: 6px; border-top: 1px solid #d6dde3; font-size: 9px; color: #6b7680; }
`;

const NUMERIC = new Set(["pence", "minutes", "count"]);

function SummaryTable({ lines }: { lines: SummaryLine[] }) {
  return (
    <table className="rdj-summary">
      <thead><tr><th style={{ width: "34%" }}>Measure</th><th className="rdj-num" style={{ width: "18%" }}>Total</th><th>Notes</th></tr></thead>
      <tbody>
        {lines.map(line => (
          <tr key={line.key}>
            <td>{line.label}</td>
            <td className={`rdj-num${line.value === null ? " rdj-missing" : ""}`}>{lineText(line)}</td>
            <td className="rdj-missing">{line.note ?? ""}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function PaperDriverJobReport({ report, isPreview = false }: { report: DriverJobReport; isPreview?: boolean }) {
  const combined = combinedSummary(report);
  return (
    <div className={`report-document report-driver-jobs ${isPreview ? "p-4" : ""}`}>
      <style>{CSS}</style>
      {/* A div, not <header>: the global print rules hide every header element. */}
      <div className="rdj-head">
        <div className="rdj-brand">
          <img src="/tmv-logo.png" alt="TMV company logo" />
          <div><p className="rdj-company">The Man Van</p><h1>{report.title}</h1></div>
        </div>
        <span style={{ fontSize: 11, color: "#5b6670" }}>020 3773 9113</span>
      </div>
      <dl className="rdj-meta">
        <div><dt>Period</dt><dd>{rangeLabel(report.range)}, London time</dd></div>
        <div><dt>Drivers</dt><dd>{report.sections.map(section => `${section.driver.name} (${section.driver.initials})`).join(", ") || "None"}</dd></div>
        <div><dt>Generated</dt><dd>{generatedLabel(report.generatedAt)}</dd></div>
      </dl>
      <p className="rdj-warn" style={{ color: reportStatus(report).status === "PARTIAL" ? "#8a4b00" : "#1d2329", fontWeight: 700 }}>Report status: {reportStatus(report).label}</p>
      {reportStatus(report).reasons.map(reason => <p key={reason} className="rdj-warn">{reason}</p>)}
      {(report.notes ?? []).map(note => <p key={note} className="rdj-warn" style={{ color: "#5b6670" }}>{note}</p>)}

      {report.sections.map(section => (
        <section key={section.driver.initials} className="rdj-section" aria-label={`${section.driver.name} (${section.driver.initials})`}>
          <h2>{section.driver.name} ({section.driver.initials})</h2>
          <SummaryTable lines={section.summary} />
          {section.warnings.map(warning => <p key={warning} className="rdj-warn">{warning}</p>)}
          <h3>Jobs ({section.jobs.length}{section.jobs.length < section.jobTotal ? ` of ${section.jobTotal}` : ""})</h3>
          {section.jobs.length ? (
            <table>
              <thead><tr>{JOB_COLUMNS.map(column => <th key={column.key} className={NUMERIC.has(column.unit ?? "") ? "rdj-num" : undefined} style={{ width: `${PDF_SHARE[column.key]}%` }}>{column.header}</th>)}</tr></thead>
              <tbody>
                {section.jobs.map(line => (
                  <tr key={line.jobId}>
                    {JOB_COLUMNS.map(column => {
                      const value = cellText(line, column);
                      return <td key={column.key} className={[NUMERIC.has(column.unit ?? "") ? "rdj-num" : "", isMissingText(value) ? "rdj-missing" : ""].filter(Boolean).join(" ") || undefined}>{value}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="rdj-empty">No jobs found for the selected period.</p>}
        </section>
      ))}

      {combined && (
        <section className="rdj-section" aria-label="All selected drivers">
          <h2>All selected drivers</h2>
          <SummaryTable lines={combined} />
          <p className="rdj-warn" style={{ color: "#5b6670" }}>The sum of the driver sections. Each job has one assigned driver code, so no job is counted twice.</p>
        </section>
      )}

      <p className="rdj-foot">
        Generated {generatedLabel(report.generatedAt)} from the dashboard's driver report data ({report.sources.join("; ") || "Driver report API"}). Final charges are billed amounts and include invoices; recorded receipts, unpaid invoices and manual entries are separate measures.
      </p>
    </div>
  );
}
