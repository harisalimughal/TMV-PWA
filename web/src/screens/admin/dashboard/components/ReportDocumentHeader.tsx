import React from "react";
import "./reportDocument.css";

export function ReportDocumentHeader({ title, page }: { title: string; reference: string; page: number }) {
  return page === 1 ? <header className="report-document-header">
    <div className="report-heading"><img src="/tmv-logo.png" alt="TMV company logo" /><div><h1>{title}</h1></div></div><span className="report-contact">020 3773 9113</span>
  </header> : null;
}

export function ReportDocumentFooter({ reference, page, total }: { reference: string; page: number; total: number }) {
  return <footer className="report-page-footer"><span>{reference}</span><span>Page {page} of {total}</span></footer>;
}

export function ReportRecordMeta({ name, initials, timestamp, reference, jobId, point }: { name: string; initials: string; timestamp: string; reference: string; jobId?: string; point?: string }) {
  return <dl className="report-record-meta">
    <div><dt>Driver</dt><dd>{name} ({initials})</dd></div>
    <div><dt>Record time</dt><dd>{timestamp} | Europe/London</dd></div>
    <div><dt>Reference</dt><dd>{reference}</dd></div>
    {jobId && jobId !== reference && <div><dt>Job ID</dt><dd>{jobId}</dd></div>}
    {point && <div><dt>Reported at</dt><dd>{point}</dd></div>}
  </dl>;
}
