/**
 * One job in the driver report's job history: a compact row that expands in place
 * into the full operational record the deployed dashboard showed -- customer and
 * schedule, performance and the eight timing milestones, payments, the financial
 * breakdown (with its Basis column), tunnel and congestion activity, the system /
 * manual comparison and the job's own data-quality notes. Everything comes from the
 * job's report record; missing values stay missing.
 */
import React from "react";
import { ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
import type { DriverReportJob, ReportRoadAlert } from "../../driverReport.types";
import { formatDate, formatDateTime, formatMinutes, formatMoney, formatTime } from "../../utils/format";
import { roadZoneLabel } from "../../utils/roadZone";
import { manualRoadFee } from "../ManualRoadChargeCard";
import { JobStatusBadge } from "../StatusBadge";
import { Action, Missing } from "../ds";
import { JobFinancialBreakdown } from "./FinancialBreakdown";
import { JobComparison, submissionLabel } from "./ComparisonTab";
import { arrival } from "./reportModel";
import { milestones } from "./milestones";
import { eventStatus, rateBasisLabel } from "./RoadChargesTab";
import { cx } from "../../../../../ui/cx";

function RecordSection({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cx("min-w-0 rounded-xl border border-admin-line bg-surface", className)} aria-label={title}>
      <h4 className="border-b border-admin-line px-4 py-2.5 text-[14px] font-semibold text-admin-ink">{title}</h4>
      <div className="px-4 py-3">{children}</div>
    </section>
  );
}

/** Label / value rows with dividers; the value column is right-aligned and tabular. */
function Rows({ rows }: { rows: Array<[string, React.ReactNode, React.ReactNode?]> }) {
  return (
    <dl className="divide-y divide-admin-line">
      {rows.map(([label, value, hint]) => (
        <div key={label} className="flex items-start justify-between gap-4 py-2">
          <dt className="text-[13.5px] text-admin-ink-2">{label}</dt>
          <dd className="text-right text-[13.5px] font-medium tabular-nums text-admin-ink">{value}{hint && <span className="block text-[12px] font-normal text-admin-muted">{hint}</span>}</dd>
        </div>
      ))}
    </dl>
  );
}

function RoadActivity({ job, type, gpsAvailable }: { job: DriverReportJob; type: "tunnel" | "congestion"; gpsAvailable: boolean }) {
  const rows = (job.roadAlerts ?? []).filter((row: ReportRoadAlert) => row.type === type);
  const saved = type === "tunnel" ? job.finance.tunnelPence : job.finance.congestionPence;
  const reported = job.manualDetails ? manualRoadFee(job.manualDetails, type) : undefined;
  return (
    <div className="space-y-2">
      <Rows rows={[
        ["Saved on the job", formatMoney(saved, "Not recorded"), "Job pricing snapshot, included in the job total"],
        ["Manual entry (reported)", reported === undefined ? <Missing>{submissionLabel(job).label}</Missing> : formatMoney(reported, "Not reported")]
      ]} />
      {!gpsAvailable ? <p className="text-[12.5px] text-admin-ink-2">Tracker zone activity is still loading or unavailable for this range.</p>
        : rows.length === 0 ? <p className="text-[12.5px] text-admin-ink-2">No {type} zone entries linked to this job. Tracker coverage limits apply, so this is not proof of no entry.</p>
        : (
          <ul className="divide-y divide-admin-line rounded-lg border border-admin-line">
            {rows.map(row => (
              <li key={row.id} className="flex flex-wrap items-start justify-between gap-2 px-3 py-2 text-[13px]">
                <span className="min-w-0"><span className="block font-medium">{roadZoneLabel(row)}</span><span className="text-admin-ink-2">{formatDateTime(row.enteredAt)} · {eventStatus(row).label}</span></span>
                <span className="text-right tabular-nums">{formatMoney(row.estimatedPence, "Not calculated")}<span className="block text-[12px] text-admin-muted">{rateBasisLabel(row)}</span></span>
              </li>
            ))}
          </ul>
        )}
      <p className="text-[12px] text-admin-muted">GPS activity is evidence for the saved charge, not an extra amount on top of it.</p>
    </div>
  );
}

export function JobRecord({ job, open, onToggle, onJob, gpsAvailable }: { job: DriverReportJob; open: boolean; onToggle: () => void; onJob: (id: string) => void; gpsAvailable: boolean }) {
  const panelId = `job-record-${job.jobId}`;
  const finance = job.finance, manual = job.manualDetails, d = job.duration;
  const arrive = arrival(job);
  const moving = job.movement?.onJob.movingSeconds;
  const submission = submissionLabel(job);
  return (
    <li className={cx("overflow-hidden rounded-2xl border bg-surface transition", open ? "border-admin-brand/40 shadow-[var(--admin-shadow)]" : "border-admin-line hover:border-admin-line-strong")}>
      <button type="button" onClick={onToggle} aria-expanded={open} aria-controls={panelId}
        className="grid w-full grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 text-left focus-visible:bg-admin-surface/70 focus-visible:outline-none">
        {open ? <ChevronDown aria-hidden className="h-4 w-4 text-admin-brand" /> : <ChevronRight aria-hidden className="h-4 w-4 text-admin-ink-2" />}
        <span className="min-w-0">
          <span className="block truncate text-[15px] font-semibold text-admin-ink">{job.customer.name || "Customer not recorded"}</span>
          <span className="block truncate text-[13px] text-admin-ink-2">{formatDate(job.operationalDate ?? job.bookedStart)} · {job.jobId}</span>
        </span>
        <span className="flex flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-3">
          <JobStatusBadge status={job.status} />
          <span className="text-[15px] font-semibold tabular-nums text-admin-ink">{formatMoney(finance.acceptedPence, "Unknown")}</span>
        </span>
      </button>
      {open && (
        <div id={panelId} className="space-y-3 border-t border-admin-line bg-admin-surface/40 p-3 sm:p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <p className="min-w-0 text-[13.5px] text-admin-ink">{job.pickup || <Missing>Pick-up not recorded</Missing>} <span aria-hidden className="text-admin-ink-2">→</span><span className="sr-only">to</span> {job.dropoff || <Missing>Drop-off not recorded</Missing>}</p>
            <Action size="sm" onClick={() => onJob(job.jobId)} aria-label={`Open job ${job.jobId}`}>Open job<ExternalLink aria-hidden className="h-3.5 w-3.5" /></Action>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <RecordSection title="Customer & schedule">
              <Rows rows={[
                ["Customer", job.customer.name || <Missing />],
                ["Phone", job.customer.phone && /\d{5,}/.test(job.customer.phone.replace(/\s/g, "")) ? <a className="text-admin-brand hover:underline" href={`tel:${job.customer.phone.replace(/\s/g, "")}`}>{job.customer.phone}</a> : <Missing>{job.customer.phone || "Not recorded"}</Missing>],
                ["Email", job.customer.email ? <a className="break-all text-admin-brand hover:underline" href={`mailto:${job.customer.email}`}>{job.customer.email}</a> : <Missing />]
              ]} />
              <table className="mt-2 w-full text-[13.5px]">
                <caption className="sr-only">Scheduled and actual times</caption>
                <thead><tr className="text-left text-[12.5px] text-admin-ink-2"><th className="py-1.5 font-medium">Timing</th><th className="py-1.5 font-medium">Scheduled</th><th className="py-1.5 font-medium">Actual</th></tr></thead>
                <tbody className="divide-y divide-admin-line">
                  <tr><th scope="row" className="py-1.5 text-left font-normal">Start</th><td className="py-1.5 tabular-nums">{formatDateTime(job.bookedStart)}</td><td className="py-1.5 tabular-nums">{job.actualStart ? formatDateTime(job.actualStart) : <Missing />}</td></tr>
                  <tr><th scope="row" className="py-1.5 text-left font-normal">Finish</th><td className="py-1.5 tabular-nums">{formatDateTime(job.bookedFinish)}</td><td className="py-1.5 tabular-nums">{job.actualFinish ? formatDateTime(job.actualFinish) : <Missing />}</td></tr>
                </tbody>
              </table>
            </RecordSection>

            <RecordSection title="Timeline">
              <ol className="relative space-y-0">
                {milestones(job).map((item, index, all) => (
                  <li key={item.key} className="grid grid-cols-[16px_minmax(0,1fr)_auto] gap-3 py-1.5">
                    <span aria-hidden className="relative flex justify-center">
                      <span className={cx("mt-1 h-2.5 w-2.5 rounded-full ring-2 ring-surface", item.at ? "bg-admin-brand" : "border border-admin-line-strong bg-surface")} />
                      {index < all.length - 1 && <span className="absolute top-4 h-[calc(100%+4px)] w-px bg-admin-line" />}
                    </span>
                    <span className="min-w-0 text-[13.5px]"><span className="text-admin-ink">{item.label}</span><span className="block text-[12px] text-admin-muted">{item.source}</span></span>
                    <span className="text-right text-[13.5px] font-medium tabular-nums">{item.display ?? <Missing>{item.missing}</Missing>}</span>
                  </li>
                ))}
              </ol>
            </RecordSection>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <RecordSection title="Performance & timings">
              <Rows rows={[
                ["Date", formatDate(job.operationalDate ?? job.bookedStart)],
                ["Scheduled hours", formatMinutes(d.bookedMinutes, "Unavailable"), "Calendar duration"],
                ["Allocated time", formatMinutes(d.allocatedMinutes, "Unavailable"), "Allowance before extra time"],
                ["Working hours", formatMinutes(d.workingMinutes, "Unavailable"), "Recorded arrival to finish"],
                ["Moving hours", moving == null ? <Missing>Unavailable</Missing> : formatMinutes(moving / 60), job.movement ? `Tracker coverage: ${job.movement.onJob.coverage}` : "Tracker"],
                ["Overtime", formatMinutes(d.overtimeMinutes, "Unavailable")],
                ["Arrival delay", arrive.status === "unverified" ? <Missing>Unverified</Missing> : formatMinutes(Math.max(0, d.arrivalDelayMinutes ?? 0)), arrive.status === "unverified" ? arrive.reason : d.arrivalSource],
                ["Review report", job.reviewSent ? "Sent" : "Not sent"],
                ["Helper", manual ? (manual.helperName || "None reported") : <Missing>{submission.label}</Missing>],
                ["Manual helper hours", manual ? formatMinutes(manual.helperHours * 60) : <Missing>{submission.label}</Missing>],
                ["Reported hours", manual ? formatMinutes(d.manualMinutes, "Unavailable") : <Missing>{submission.label}</Missing>]
              ]} />
            </RecordSection>

            <RecordSection title="Payments">
              <Rows rows={[
                ["Scheduled hours", formatMinutes(d.bookedMinutes, "Unavailable")],
                ["Total charges", formatMoney(finance.systemCalculatedPence, "Unknown"), "Calculated by the system"],
                ["Driver collected", formatMoney(finance.acceptedPence, "Unknown"), "Final charge entered at completion"],
                ["Adjustment reason", finance.adjustmentNote || <Missing>No recorded adjustments</Missing>],
                ["Manual entries", manual ? formatMoney(manual.amountCollectedPence) : <Missing>{submission.label}</Missing>, manual ? "Reported by the driver" : "Missing entry"],
                ["Outstanding", finance.outstandingPence == null ? <Missing>Unknown</Missing> : formatMoney(finance.outstandingPence), "Driver collected minus manual entries"],
                ["Base price", formatMoney(finance.basePence, "Unknown")],
                ["Extra time charges", formatMoney(finance.overtimePence, "Unknown")],
                ["Saved congestion fee", formatMoney(finance.congestionPence, "Unknown")],
                ["Saved tunnel fee", formatMoney(finance.tunnelPence, "Unknown")]
              ]} />
            </RecordSection>
          </div>

          <RecordSection title="Financial breakdown" className="[&>div]:px-0 [&>div]:py-0"><JobFinancialBreakdown job={job} /></RecordSection>

          <div className="grid gap-3 lg:grid-cols-2">
            <RecordSection title="Tunnel charges"><RoadActivity job={job} type="tunnel" gpsAvailable={gpsAvailable} /></RecordSection>
            <RecordSection title="Congestion charges"><RoadActivity job={job} type="congestion" gpsAvailable={gpsAvailable} /></RecordSection>
          </div>

          <RecordSection title="System / Manual comparison"><JobComparison job={job} /></RecordSection>

          {job.issues.length > 0 && (
            <RecordSection title="Notes and data quality">
              <ul className="list-disc space-y-1 pl-5 text-[13.5px] text-admin-ink">{job.issues.map((issue, index) => <li key={index}>{issue}</li>)}</ul>
            </RecordSection>
          )}
          <p className="text-[12px] text-admin-muted">Times are London time. Scheduled start {formatTime(job.bookedStart)}.</p>
        </div>
      )}
    </li>
  );
}
