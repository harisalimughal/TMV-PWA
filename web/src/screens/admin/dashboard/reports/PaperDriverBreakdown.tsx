/**
 * Driver Breakdown PDF, redesigned. Same sections and data coverage as the server's
 * export (Performance & Timings, Payments, Jobs, Comparison, Tunnel Charges, Congestion
 * Charges), laid out as a formal document: A4 landscape, TMV header, a summary band,
 * one section per page group with repeated table headers, rows that never split, and
 * page numbers in the page margin.
 *
 * Every value comes from the backend report (./driverBreakdown); nothing is
 * recalculated except column sums that the report itself defines as sums (the
 * recorded payment methods). Missing values print as "Not recorded" / "Not submitted",
 * never as £0.00. Printed through PrintPortal, always on a white page.
 */
import React from "react";
import { DateTime } from "luxon";
import type { DriverReportJob, ReportRoadAlert } from "../driverReport.types";
import { formatMinutes, formatMoney, formatRange } from "../utils/format";
import { roadZoneLabel } from "../utils/roadZone";
import { manualRoadFee } from "../components/ManualRoadChargeCard";
import { milestones } from "../components/report/milestones";
import { submissionLabel } from "../components/report/ComparisonTab";
import { manualEntryWarning } from "../components/report/PaymentsTab";
import type { DriverBreakdown, SchemeActivity } from "./driverBreakdown";

const ZONE = "Europe/London";
const METHODS = [["Cash", "Cash"], ["Card", "Card"], ["Link", "Link"], ["Bank Transfer", "Bank Transfer"], ["Invoice", "Invoice"], ["Unknown", "Unknown"]] as const;

const css = (footer: string) => `
  @page { size: A4 landscape; margin: 13mm 12mm 15mm;
    @bottom-left { content: ${JSON.stringify(footer)}; font: 8px Arial, sans-serif; color: #6b7480; }
    @bottom-right { content: "Page " counter(page) " of " counter(pages); font: 8px Arial, sans-serif; color: #6b7480; } }
  .report-breakdown { font-family: var(--font-sans), Arial, sans-serif; color: #17191d; background: #fff; font-variant-numeric: tabular-nums; font-size: 9px; line-height: 1.4; }
  .report-breakdown .rb-cover { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; padding: 0 0 12px; border-bottom: 2px solid #17191d; }
  .report-breakdown .rb-brand { display: flex; gap: 12px; align-items: center; }
  .report-breakdown .rb-brand img { width: 40px; height: 40px; object-fit: contain; }
  .report-breakdown .rb-company { margin: 0; font-size: 8.5px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: #5f6672; }
  .report-breakdown h1 { margin: 1px 0 0; font-size: 22px; font-weight: 800; letter-spacing: -.01em; }
  .report-breakdown .rb-driver { margin: 2px 0 0; font-size: 12px; font-weight: 600; }
  .report-breakdown .rb-meta { display: grid; grid-template-columns: auto auto; gap: 2px 14px; margin: 0; font-size: 9px; text-align: right; }
  .report-breakdown .rb-meta dt { color: #6b7480; }
  .report-breakdown .rb-meta dd { margin: 0; font-weight: 600; text-align: left; }
  .report-breakdown .rb-kpis { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 6px; margin: 12px 0 4px; }
  .report-breakdown .rb-kpi { border: 1px solid #e3e6eb; border-radius: 6px; padding: 6px 8px; background: #f8f9fb; break-inside: avoid; }
  .report-breakdown .rb-kpi span { display: block; font-size: 7.5px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: #6b7480; }
  .report-breakdown .rb-kpi strong { display: block; margin-top: 2px; font-size: 13px; font-weight: 800; }
  .report-breakdown .rb-kpi em { display: block; font-style: normal; font-size: 7.5px; color: #6b7480; }
  .report-breakdown .rb-kpi em.rb-warn { color: #8f5200; }
  .report-breakdown .rb-section { break-before: page; page-break-before: always; }
  .report-breakdown .rb-section.rb-first { break-before: auto; page-break-before: auto; margin-top: 14px; }
  .report-breakdown .rb-section-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin: 0 0 8px; padding-bottom: 6px; border-bottom: 1px solid #d6dbe1; }
  .report-breakdown h2 { margin: 0; font-size: 16px; font-weight: 800; }
  .report-breakdown h2 small { margin-right: 8px; color: #6d28d9; font-size: 11px; font-weight: 800; }
  .report-breakdown .rb-section-head p { margin: 0; color: #5f6672; font-size: 9px; }
  .report-breakdown h3 { margin: 12px 0 5px; font-size: 11px; font-weight: 700; break-after: avoid; page-break-after: avoid; }
  .report-breakdown table { width: 100%; border-collapse: collapse; table-layout: fixed; margin: 0 0 4px; }
  .report-breakdown thead { display: table-header-group; }
  .report-breakdown tr { break-inside: avoid; page-break-inside: avoid; }
  .report-breakdown th { padding: 4px 6px; background: #eef0f4; border-bottom: 1px solid #cfd5dc; text-align: left; font-size: 7.5px; font-weight: 700; letter-spacing: .02em; color: #3d434c; vertical-align: bottom; }
  .report-breakdown td { padding: 4px 6px; border-bottom: 1px solid #edf0f3; vertical-align: top; overflow-wrap: break-word; }
  .report-breakdown tbody tr:nth-child(even) td { background: #fafbfc; }
  .report-breakdown .num { text-align: right; }
  .report-breakdown .id { white-space: nowrap; font-weight: 600; font-size: 8px; }
  .report-breakdown .muted { color: #8a919c; }
  .report-breakdown .warn { color: #8f5200; }
  .report-breakdown .rb-total td { background: #eef0f4 !important; font-weight: 700; border-top: 1px solid #cfd5dc; }
  .report-breakdown .rb-pair { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .report-breakdown .rb-note { margin: 3px 0 0; font-size: 8px; color: #5f6672; }
  .report-breakdown .rb-warnings { margin: 6px 0 0; padding: 6px 8px; border-left: 3px solid #c77b0a; background: #fff8eb; font-size: 8.5px; }
  .report-breakdown .rb-times { display: flex; gap: 18px; margin: 4px 0 6px; font-size: 8.5px; }
  .report-breakdown .rb-times b { margin-right: 4px; }
  .report-breakdown .rb-closing { display: grid; grid-template-columns: 1.3fr 1fr 1fr; gap: 10px; margin-top: 16px; break-inside: avoid; }
  .report-breakdown .rb-closing > div { border: 1px solid #e3e6eb; border-radius: 6px; padding: 8px 10px; }
  .report-breakdown .rb-closing .rb-paid { border-color: #0f7a4b; background: #f1faf5; }
  .report-breakdown .rb-closing span { display: block; font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: #5f6672; }
  .report-breakdown .rb-closing strong { display: block; font-size: 18px; font-weight: 800; }
  .report-breakdown .rb-closing .rb-paid strong { color: #0f5e3b; font-size: 22px; }
  .report-breakdown .rb-closing em { display: block; font-style: normal; font-size: 8px; color: #5f6672; }
`;

const londonTime = (iso: string | null | undefined) => {
  if (!iso) return null;
  const at = DateTime.fromISO(iso, { zone: "utc" }).setZone(ZONE);
  return at.isValid ? at : null;
};
const dayTime = (iso: string | null | undefined) => londonTime(iso)?.toFormat("dd LLL, HH:mm") ?? null;
const day = (job: DriverReportJob) => londonTime(job.operationalDate ?? job.bookedStart)?.toFormat("dd LLL yyyy") ?? null;

function V({ value, missing = "Not recorded" }: { value: React.ReactNode; missing?: string }) {
  return value === null || value === undefined || value === "" ? <span className="muted">{missing}</span> : <>{value}</>;
}
const money = (pence: number | null | undefined, missing = "Not recorded") => <V value={typeof pence === "number" ? formatMoney(pence) : null} missing={missing} />;
const mins = (minutes: number | null | undefined, missing = "Not recorded") => <V value={typeof minutes === "number" ? formatMinutes(minutes) : null} missing={missing} />;

function Head({ n, title, who }: { n: number; title: string; who: string }) {
  return <div className="rb-section-head"><h2><small>{String(n).padStart(2, "0")}</small>{title}</h2><p>{who}</p></div>;
}

function Kpi({ label, value, note, warn }: { label: string; value: React.ReactNode; note?: string; warn?: boolean }) {
  return <div className="rb-kpi"><span>{label}</span><strong>{value}</strong>{note && <em className={warn ? "rb-warn" : undefined}>{note}</em>}</div>;
}

function Totals({ rows }: { rows: Array<[string, React.ReactNode, string?]> }) {
  return (
    <table>
      <colgroup><col style={{ width: "45%" }} /><col style={{ width: "25%" }} /><col /></colgroup>
      <thead><tr><th>Item</th><th className="num">Total</th><th>Notes</th></tr></thead>
      <tbody>{rows.map(([label, value, note]) => <tr key={label}><td>{label}</td><td className="num">{value}</td><td className="muted">{note ?? ""}</td></tr>)}</tbody>
    </table>
  );
}

function Activity({ n, title, who, data, scheme, jobs }: { n: number; title: string; who: string; data: SchemeActivity; scheme: "tunnel" | "congestion"; jobs: DriverReportJob[] }) {
  const reported = jobs.filter(job => job.manualDetails).map(job => manualRoadFee(job.manualDetails, scheme));
  const missing = jobs.filter(job => !job.manualDetails).length;
  const reportedKnown = reported.reduce<number>((sum, value) => sum + (value ?? 0), 0);
  const times = scheme === "tunnel" ? [["Monday – Sunday", "6:00 AM – 10:00 PM"]] : [["Monday – Friday", "7:00 AM – 6:00 PM"], ["Saturday – Sunday", "12:00 PM – 6:00 PM"]];
  const status = (row: ReportRoadAlert) => !row.jobId ? "Needs job match" : row.inChargeableHours === false ? "Outside hours" : row.chargeable ? "Chargeable" : "Not chargeable";
  const basis = (row: ReportRoadAlert) => /current pricing settings/i.test(row.rateBasis) ? "Current Pricing Settings (estimate)" : /snapshot|saved/i.test(row.rateBasis) ? "Job pricing snapshot" : row.rateBasis || "Not recorded";
  return (
    <section className="rb-section">
      <Head n={n} title={title} who={who} />
      <h3>Activity totals</h3>
      {data.available ? (
        <div className="rb-kpis" style={{ gridTemplateColumns: "repeat(5, minmax(0, 1fr))" }}>
          <Kpi label="Zone entries" value={data.entries ?? "—"} note="Recorded by the tracker" />
          <Kpi label={scheme === "tunnel" ? "Chargeable passages" : "Chargeable jobs"} value={data.chargeable ?? "—"} note="Inside charging hours" />
          <Kpi label="Expected" value={formatMoney(data.expectedKnownPence)} note={data.unpriced ? `${data.unpriced} without a calculable fee` : "Calculated per event"} />
          <Kpi label="Manual entry (reported)" value={jobs.some(job => job.manualDetails) ? formatMoney(reportedKnown) : "Not submitted"} note={missing ? `${missing} missing ${missing === 1 ? "entry" : "entries"}` : "From driver job summaries"} warn={missing > 0} />
          <Kpi label="Entries without a fee" value={data.unpriced} />
        </div>
      ) : <p className="rb-warnings">Tracker history was not returned for this range, so zone entries can't be confirmed or ruled out.</p>}
      <div className="rb-times"><span><b>Chargeable times</b>(London time)</span>{times.map(([days, hours]) => <span key={days}>{days}: <b>{hours}</b></span>)}</div>
      <h3>Zone activity</h3>
      {data.rows.length === 0 ? <p className="rb-note">No {scheme} zone entries recorded for this range.</p> : (
        <table>
          <colgroup><col style={{ width: "13%" }} /><col style={{ width: "22%" }} /><col style={{ width: "10%" }} /><col style={{ width: "10%" }} /><col style={{ width: "9%" }} /><col style={{ width: "11%" }} /><col style={{ width: "8%" }} /><col /></colgroup>
          <thead><tr><th>Job ID</th><th>Zone</th><th>Entered</th><th>Exited</th><th>Time inside</th><th>Charging hours</th><th className="num">Fee</th><th>Rate source</th></tr></thead>
          <tbody>{data.rows.map(row => (
            <tr key={row.id}>
              <td className="id"><V value={row.jobId} missing="No job linked" /></td>
              <td>{roadZoneLabel(row)}</td>
              <td><V value={dayTime(row.enteredAt)} /></td>
              <td><V value={dayTime(row.exitedAt)} /></td>
              <td>{row.durationSeconds === null ? <span className="muted">Not recorded</span> : formatMinutes(row.durationSeconds / 60)}</td>
              <td>{status(row)}</td>
              <td className="num">{money(row.estimatedPence, "Not calculated")}</td>
              <td>{basis(row)}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
      <p className="rb-note">Saved job fees are already part of each job's total. Tracker activity is evidence for them and is not added again.</p>
    </section>
  );
}

export function PaperDriverBreakdown({ data }: { data: DriverBreakdown }) {
  const { report, jobs } = data, s = report.summary, cards = s.paymentCards;
  const name = `${report.driver.name} (${report.driver.initials})`;
  const range = formatRange(data.from, data.to);
  const who = `${name} · ${range}`;
  const generated = DateTime.fromISO(data.generatedAt).setZone(ZONE).toFormat("d LLL yyyy, HH:mm");
  const methods = s.systemPaymentsByMethodPence ?? {};
  const recordedTotal = METHODS.reduce((sum, [key]) => sum + (methods[key] ?? 0), 0);
  const manualWarning = manualEntryWarning(cards);
  const scheduled = s.completedJobs > 0 && s.scheduledMinutesUnknownJobs === s.completedJobs ? null : s.scheduledMinutesKnown ?? null;
  const moving = s.movingKnownSeconds == null || (s.movingKnownSeconds === 0 && s.movingUnknownJobs >= s.completedJobs && s.completedJobs > 0) ? null : s.movingKnownSeconds / 60;
  const labels = jobs[0] ? milestones(jobs[0]).map(item => item.label) : [];
  const jobTotal = (job: DriverReportJob) => Object.values(job.finance.systemPayments.byMethod).reduce((sum, amount) => sum + amount, 0);
  return (
    <article className="report-document report-breakdown" aria-label={`Driver Breakdown, ${who}`}>
      <style>{css(`The Man Van · Driver Breakdown · ${name} · ${range}`)}</style>
      <div className="rb-cover">
        <div className="rb-brand">
          <img src="/tmv-logo.png" alt="" />
          <div><p className="rb-company">The Man Van</p><h1>Driver Breakdown</h1><p className="rb-driver">{name}{report.driver.email ? ` · ${report.driver.email}` : ""}</p></div>
        </div>
        <dl className="rb-meta">
          <dt>Selected dates</dt><dd>{range}</dd>
          <dt>Time zone</dt><dd>London time</dd>
          <dt>Generated</dt><dd>{generated}</dd>
          <dt>Jobs listed</dt><dd>{jobs.length} of {data.jobsTotal}</dd>
        </dl>
      </div>

      <div className="rb-kpis">
        <Kpi label="Total jobs" value={s.assignedJobs} note={`${s.completedJobs} completed · ${s.cancelledJobs} cancelled`} />
        <Kpi label="Total charges (expected)" value={formatMoney(cards?.totalChargesPence, "Unknown")} note="Calculated by the system" />
        <Kpi label="Driver collected" value={formatMoney(cards?.driverCollectionPence, "Unknown")} note="Final charges, invoices included" />
        <Kpi label="Manual entries (reported)" value={formatMoney(cards?.manualEntriesKnownPence ?? cards?.manualEntriesPence, "Not submitted")} note={manualWarning || "Reported by the driver"} warn={!!manualWarning} />
        <Kpi label="Saved tunnel / congestion" value={`${formatMoney(s.roadChargeTotals?.tunnelPence, "—")} / ${formatMoney(s.roadChargeTotals?.congestionPence, "—")}`} note="Included in job totals" />
        <Kpi label="Reviews sent / not sent" value={`${s.reviewSentJobs} / ${s.reviewNotSentJobs}`} />
        <Kpi label="Scheduled hours" value={scheduled === null ? "Unavailable" : formatMinutes(scheduled)} note="Calendar duration" />
        <Kpi label="Working hours" value={formatMinutes(s.workingMinutesKnown)} note={s.workingMinutesUnknownJobs ? `${s.workingMinutesUnknownJobs} unavailable` : "Arrival to finish"} warn={!!s.workingMinutesUnknownJobs} />
        <Kpi label="Moving time" value={moving === null ? "Unavailable" : formatMinutes(moving)} note={[s.movingUnknownJobs ? `${s.movingUnknownJobs} unavailable` : "", s.movingPartialJobs ? `${s.movingPartialJobs} partial` : ""].filter(Boolean).join(" · ") || "Tracker"} warn={!!(s.movingUnknownJobs || s.movingPartialJobs)} />
        <Kpi label="Overtime" value={formatMinutes(s.overtimeMinutesKnown)} />
        <Kpi label="Arrival delays" value={formatMinutes(s.arrivalDelayMinutesKnown)} note="Sum of verified late minutes" />
        <Kpi label="Helper hours" value={s.helperHoursKnown ? formatMinutes(s.helperHoursKnown * 60) : "None reported"} note="Driver-reported" />
      </div>
      {data.warnings.length > 0 && <div className="rb-warnings">{data.warnings.map(text => <div key={text}>{text}</div>)}</div>}

      {/* 1. Performance & Timings: continues on the first page, under the summary. */}
      <section className="rb-section rb-first">
        <Head n={1} title="Performance & Timings" who={who} />
        <h3>Job timings</h3>
        <table>
          <colgroup><col style={{ width: "12%" }} /><col style={{ width: "8%" }} />{labels.map(label => <col key={label} />)}</colgroup>
          <thead><tr><th>Job ID</th><th>Date</th>{labels.map(label => <th key={label}>{label}</th>)}</tr></thead>
          <tbody>{jobs.map(job => (
            <tr key={job.jobId}>
              <td className="id">{job.jobId}</td><td><V value={londonTime(job.operationalDate ?? job.bookedStart)?.toFormat("dd LLL")} /></td>
              {milestones(job).map(item => <td key={item.key}>{item.display ?? <span className="muted">{item.missing}</span>}</td>)}
            </tr>
          ))}</tbody>
        </table>
        <p className="rb-note">Times are London time on the job's date. A tracker event that was not recorded shows the tracker's reason; it is not evidence about the driver.</p>
        <h3>Job performance</h3>
        <table>
          <colgroup><col style={{ width: "14%" }} /></colgroup>
          <thead><tr><th>Job ID</th><th className="num">Scheduled</th><th className="num">Allocated</th><th className="num">Working</th><th className="num">Moving</th><th className="num">Overtime</th><th className="num">Arrival delay</th><th>Review</th><th className="num">Reported hours</th><th className="num">Helper hours</th></tr></thead>
          <tbody>{jobs.map(job => {
            const d = job.duration, sub = submissionLabel(job).label;
            return (
              <tr key={job.jobId}>
                <td className="id">{job.jobId}</td>
                <td className="num">{mins(d.bookedMinutes)}</td><td className="num">{mins(d.allocatedMinutes)}</td><td className="num">{mins(d.workingMinutes)}</td>
                <td className="num">{mins(job.movement?.onJob.movingSeconds == null ? null : job.movement.onJob.movingSeconds / 60)}</td>
                <td className="num">{mins(d.overtimeMinutes)}</td><td className="num">{mins(d.arrivalDelayMinutes == null ? null : Math.max(0, d.arrivalDelayMinutes))}</td>
                <td className={job.reviewSent ? undefined : "warn"}>{job.reviewSent ? "Sent" : "Not sent"}</td>
                <td className="num">{job.manualDetails ? mins(d.manualMinutes) : <span className="muted">{sub}</span>}</td>
                <td className="num">{job.manualDetails ? mins(job.manualDetails.helperHours * 60) : <span className="muted">{sub}</span>}</td>
              </tr>
            );
          })}</tbody>
        </table>
      </section>

      {/* 2. Payments */}
      <section className="rb-section">
        <Head n={2} title="Payments" who={who} />
        <div className="rb-pair">
          <div>
            <h3>Financial totals</h3>
            <Totals rows={[
              ["Total charges (expected)", money(cards?.totalChargesPence, "Unknown"), cards?.totalChargeUnknownJobs ? `${cards.totalChargeUnknownJobs} jobs unknown` : "Calculated charges"],
              ["Driver collected", money(cards?.driverCollectionPence, "Unknown"), "Final charges, invoices included"],
              ["Manual entries (reported)", money(cards?.manualEntriesKnownPence ?? cards?.manualEntriesPence, "Not submitted"), manualWarning || "Driver job summaries"],
              ["Outstanding", money(cards?.outstandingPence, "Unknown"), "Driver collected minus manual entries"],
              ["Overtime charges", money(s.overtimeChargesPence), undefined],
              ["Scheduled hours", scheduled === null ? <span className="muted">Unavailable</span> : formatMinutes(scheduled), "Calendar duration"]
            ]} />
          </div>
          <div>
            <h3>Financial breakdown</h3>
            <table>
              <colgroup><col style={{ width: "38%" }} /><col style={{ width: "24%" }} /><col /></colgroup>
              <thead><tr><th>Detail</th><th className="num">Recorded amount</th><th>Basis</th></tr></thead>
              <tbody>
                <tr><td>Base price</td><td className="num">{money(s.financialBreakdown?.basePence, "Unknown")}</td><td>Booking</td></tr>
                <tr><td>Overtime</td><td className="num">{money(s.overtimeChargesPence)}</td><td>Included in job total</td></tr>
                {(s.financialBreakdown?.extraCharges ?? []).map(charge => <tr key={charge.label}><td>{charge.label}</td><td className="num">{money(charge.amountPence)}</td><td>{charge.basis}</td></tr>)}
                {METHODS.map(([key, label]) => <tr key={key}><td>{label}</td><td className="num">{formatMoney(methods[key] ?? 0)}</td><td>{key === "Invoice" ? "Invoice job (billed, not received)" : key === "Unknown" ? "Needs verification" : "Job-flow receipt"}</td></tr>)}
                <tr className="rb-total"><td>Total</td><td className="num">{formatMoney(recordedTotal)}</td><td>Payment methods including invoices</td></tr>
              </tbody>
            </table>
          </div>
        </div>
        <h3>Job-wise payment breakdown</h3>
        <table>
          <colgroup><col style={{ width: "14%" }} /></colgroup>
          <thead><tr><th>Job ID</th>{METHODS.filter(([key]) => key !== "Unknown").map(([key, label]) => <th key={key} className="num">{label}</th>)}<th className="num">Total</th></tr></thead>
          <tbody>{jobs.map(job => (
            <tr key={job.jobId}><td className="id">{job.jobId}</td>
              {METHODS.filter(([key]) => key !== "Unknown").map(([key]) => <td key={key} className="num">{key === "Invoice" && !(job.finance.invoiceJob || job.finance.systemPayments.invoicePence) ? <span className="muted">—</span> : formatMoney(job.finance.systemPayments.byMethod[key] ?? 0)}</td>)}
              <td className="num">{formatMoney(jobTotal(job))}</td></tr>
          ))}</tbody>
        </table>
      </section>

      {/* 3. Jobs */}
      <section className="rb-section">
        <Head n={3} title="Jobs" who={who} />
        <h3>Job history</h3>
        <table>
          <colgroup><col style={{ width: "13%" }} /><col style={{ width: "17%" }} /><col style={{ width: "15%" }} /><col style={{ width: "15%" }} /><col style={{ width: "14%" }} /><col /><col style={{ width: "9%" }} /></colgroup>
          <thead><tr><th>Job ID</th><th>Customer</th><th>Scheduled start / finish</th><th>Actual start / finish</th><th>Calendar / allocated</th><th>Route</th><th>Status</th></tr></thead>
          <tbody>{jobs.map(job => (
            <tr key={job.jobId}>
              <td className="id">{job.jobId}</td><td><V value={job.customer.name && job.customer.name !== "Not recorded" ? job.customer.name : null} /></td>
              <td>{dayTime(job.bookedStart)}<br />{dayTime(job.bookedFinish)}</td>
              <td><V value={dayTime(job.actualStart)} /><br /><V value={dayTime(job.actualFinish)} /></td>
              <td>{mins(job.duration.bookedMinutes)} / {mins(job.duration.allocatedMinutes)}</td>
              <td>{job.pickup || <span className="muted">Not recorded</span>} → {job.dropoff || <span className="muted">Not recorded</span>}</td>
              <td>{job.status.charAt(0) + job.status.slice(1).toLowerCase().replace(/_/g, " ")}</td>
            </tr>
          ))}</tbody>
        </table>
        <h3>Job charges</h3>
        <table>
          <colgroup><col style={{ width: "14%" }} /></colgroup>
          <thead><tr><th>Job ID</th><th className="num">Base</th><th className="num">Overtime charge</th><th className="num">Saved congestion fee</th><th className="num">Saved tunnel fee</th><th className="num">Total charges</th><th className="num">Driver collected</th></tr></thead>
          <tbody>{jobs.map(job => (
            <tr key={job.jobId}><td className="id">{job.jobId}</td><td className="num">{money(job.finance.basePence, "Unknown")}</td><td className="num">{money(job.finance.overtimePence, "Unknown")}</td>
              <td className="num">{money(job.finance.congestionPence, "Unknown")}</td><td className="num">{money(job.finance.tunnelPence, "Unknown")}</td>
              <td className="num">{money(job.finance.systemCalculatedPence, "Unknown")}</td><td className="num">{money(job.finance.acceptedPence, "Unknown")}</td></tr>
          ))}</tbody>
        </table>
        <p className="rb-note">Saved job fees are already part of job totals; tracker activity is listed separately and not added again.</p>
      </section>

      {/* 4. Comparison */}
      <section className="rb-section">
        <Head n={4} title="Comparison" who={who} />
        <div className="rb-pair">
          <div><h3>System totals · selected range</h3><Totals rows={[
            ["Expected amount", money(cards?.totalChargesPence, "Unknown"), "Calculated charges"],
            ["Scheduled hours", scheduled === null ? <span className="muted">Unavailable</span> : formatMinutes(scheduled), "Calendar duration"],
            ["Working hours", formatMinutes(s.workingMinutesKnown), s.workingMinutesUnknownJobs ? `${s.workingMinutesUnknownJobs} unavailable` : "Arrival to finish"]
          ]} /></div>
          <div><h3>Manual totals · selected range</h3><Totals rows={[
            ["Driver collected", money(cards?.driverCollectionPence, "Unknown"), "Final charges entered at completion"],
            ["Reported hours", formatMinutes(s.manualMinutesKnown), s.manualMinutesUnknownJobs ? `${s.manualMinutesUnknownJobs} not submitted` : undefined],
            ["Helper hours", s.helperHoursKnown ? formatMinutes(s.helperHoursKnown * 60) : <span className="muted">None reported</span>, undefined],
            ...METHODS.map(([key, label]) => [key === "Invoice" ? "Invoice pending" : label, formatMoney(methods[key] ?? 0), undefined] as [string, React.ReactNode, undefined])
          ]} /></div>
        </div>
        <h3>System and manual details</h3>
        <table>
          <colgroup><col style={{ width: "14%" }} /></colgroup>
          <thead><tr><th>Job ID</th><th className="num">Expected amount</th><th className="num">Driver collected</th><th className="num">Manual entry</th><th className="num">Scheduled</th><th className="num">Working</th><th className="num">Reported</th><th className="num">Helper hours</th><th>Submission</th></tr></thead>
          <tbody>{jobs.map(job => {
            const sub = submissionLabel(job).label, m = job.manualDetails;
            return (
              <tr key={job.jobId}><td className="id">{job.jobId}</td>
                <td className="num">{money(job.finance.systemCalculatedPence, "Unknown")}</td><td className="num">{money(job.finance.acceptedPence, "Unknown")}</td>
                <td className="num">{m ? formatMoney(m.amountCollectedPence) : <span className="muted">{sub}</span>}</td>
                <td className="num">{mins(job.duration.bookedMinutes)}</td><td className="num">{mins(job.duration.workingMinutes)}</td>
                <td className="num">{m ? mins(job.duration.manualMinutes) : <span className="muted">{sub}</span>}</td>
                <td className="num">{m ? mins(m.helperHours * 60) : <span className="muted">{sub}</span>}</td>
                <td className={m ? undefined : "warn"}>{sub}</td></tr>
            );
          })}</tbody>
        </table>
        <h3>Driver payment entries</h3>
        <table>
          <colgroup><col style={{ width: "14%" }} /></colgroup>
          <thead><tr><th>Job ID</th>{METHODS.filter(([key]) => key !== "Unknown").map(([key, label]) => <th key={key} className="num">{label}</th>)}<th style={{ width: "28%" }}>Adjustment reason</th></tr></thead>
          <tbody>{jobs.map(job => (
            <tr key={job.jobId}><td className="id">{job.jobId}</td>
              {METHODS.filter(([key]) => key !== "Unknown").map(([key]) => <td key={key} className="num">{formatMoney(job.finance.systemPayments.byMethod[key] ?? 0)}</td>)}
              <td><V value={job.finance.adjustmentNote} missing="—" /></td></tr>
          ))}</tbody>
        </table>
        <p className="rb-note">Payment-method amounts are what the driver recorded in the job flow at completion. A missing submission is shown as such, never as £0.00.</p>
      </section>

      <Activity n={5} title="Tunnel Charges" who={who} data={data.tunnel} scheme="tunnel" jobs={jobs} />
      <Activity n={6} title="Congestion Charges" who={who} data={data.congestion} scheme="congestion" jobs={jobs} />

      <div className="rb-closing">
        <div className="rb-paid"><span>Total recorded payments</span><strong>{formatMoney(recordedTotal)}</strong>
          <em>All recorded payment methods including invoices.{cards?.jobFlowUnknownJobs ? ` Recorded subtotal: ${cards.jobFlowUnknownJobs} job payment record${cards.jobFlowUnknownJobs === 1 ? "" : "s"} need verification.` : ""}</em></div>
        <div><span>Driver collected</span><strong>{formatMoney(cards?.driverCollectionPence, "Unknown")}</strong><em>Final charges entered at completion</em></div>
        <div><span>Total charges (expected)</span><strong>{formatMoney(cards?.totalChargesPence, "Unknown")}</strong><em>Calculated by the system</em></div>
      </div>
      <p className="rb-note">These three totals measure different things and are not expected to match: invoices are billed, not received; final charges can differ from calculated charges when a job is adjusted.</p>
    </article>
  );
}
