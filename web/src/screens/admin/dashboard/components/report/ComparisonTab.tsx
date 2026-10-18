/**
 * System / Manual comparison, as on the deployed dashboard: what the system recorded
 * next to what the driver reported, for the selected range and for each job.
 *
 * The two sides are never mixed. System values come from the booking, the pricing and
 * the app timestamps; manual values come from the driver's job flow and job summary.
 * A missing submission stays "Not submitted" (never £0.00) and a job is never shown as
 * reconciled while its driver details are missing. Differences are only calculated
 * between values that measure the same thing (hours against hours, the calculated
 * charge against the final charge).
 */
import React, { useMemo } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { DriverReport, DriverReportJob } from "../../driverReport.types";
import { formatDate, formatDateTime, formatMinutes, formatMoney, plural } from "../../utils/format";
import { Action, Badge, ChoiceChips, EmptyState, ErrorState, FilterSelect, LoadingState, Missing, Notice, panel } from "../ds";
import { reconcile, RECON_META, type Reconciliation } from "./reportModel";
import { manualEntryWarning } from "./PaymentsTab";
import type { ReconFilter, ReportTabProps } from "./types";
import { cx } from "../../../../../ui/cx";

export interface ReconSource { jobs: DriverReportJob[]; total: number; loading: boolean; error?: string; retry: () => void; gpsAvailable: boolean }

/** Payment methods in the order the deployed comparison lists them. */
export const MANUAL_METHODS: Array<{ key: string; label: string }> = [
  { key: "Cash", label: "Cash" }, { key: "Card", label: "Card" }, { key: "Link", label: "Link" },
  { key: "Bank Transfer", label: "Bank Transfer" }, { key: "Invoice", label: "Invoice pending" }, { key: "Unknown", label: "Unknown" }
];

const FILTERS: Array<{ value: ReconFilter; label: string; match: (row: Reconciliation) => boolean }> = [
  { value: "all", label: "All statuses", match: () => true },
  { value: "review", label: "Needs review", match: row => row.status === "missing" || row.status === "difference" || row.status === "verify" },
  { value: "missing", label: "Missing submission", match: row => row.status === "missing" },
  { value: "differences", label: "Hours differ", match: row => row.status === "difference" }
];

export interface CompareItem { label: string; value: React.ReactNode; hint?: React.ReactNode }

/** One side of a comparison: labelled rows with subtle dividers and no filler rows. */
export function CompareColumn({ title, source, items, tone }: { title: string; source: string; items: CompareItem[]; tone: "system" | "manual" }) {
  return (
    <section aria-label={title} className="min-w-0">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-admin-line pb-2">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold text-admin-ink">
          <span aria-hidden className={cx("h-2.5 w-2.5 rounded-full", tone === "system" ? "bg-[color:var(--chart-blue)]" : "bg-[color:var(--chart-violet)]")} />
          {title}
        </h2>
        <span className="text-[12.5px] text-admin-ink-2">{source}</span>
      </header>
      <dl className="divide-y divide-admin-line">
        {items.map(item => (
          <div key={item.label} className="flex items-start justify-between gap-4 py-2.5">
            <dt className="text-[14px] text-admin-ink-2">{item.label}{item.hint && <span className="block text-[12.5px] text-admin-muted">{item.hint}</span>}</dt>
            <dd className="text-right text-[14px] font-semibold tabular-nums text-admin-ink">{item.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function hoursDifference(system: number | null | undefined, reported: number | null | undefined): React.ReactNode {
  if (typeof system !== "number" || typeof reported !== "number") return <Missing>Can't compare</Missing>;
  const diff = reported - system;
  return diff === 0 ? "No difference" : `${diff > 0 ? "+" : "−"}${formatMinutes(Math.abs(diff))}`;
}

/** Range totals: system on the left, driver-reported on the right. */
export function ComparisonTotals({ report }: { report: DriverReport }) {
  const s = report.summary, cards = s.paymentCards;
  const reportedComplete = s.manualMinutesUnknownJobs === 0;
  const systemItems: CompareItem[] = [
    { label: "Expected amount", value: formatMoney(cards?.totalChargesPence, "Unknown"), hint: cards?.totalChargeUnknownJobs ? `${plural(cards.totalChargeUnknownJobs, "job")} without a calculated charge` : "Calculated charges" },
    { label: "Scheduled hours", value: s.scheduledMinutesKnown == null ? <Missing>Unavailable</Missing> : formatMinutes(s.scheduledMinutesKnown), hint: s.scheduledMinutesUnknownJobs ? `${s.scheduledMinutesUnknownJobs} unavailable` : "Calendar duration" },
    { label: s.workingMinutesUnknownJobs ? "Working hours (known)" : "Working hours", value: formatMinutes(s.workingMinutesKnown), hint: s.workingMinutesUnknownJobs ? `${plural(s.workingMinutesUnknownJobs, "job")} missing times` : "Arrival to finish" }
  ];
  const manualWarning = manualEntryWarning(cards);
  const manualItems: CompareItem[] = [
    { label: "Driver collected", value: formatMoney(cards?.driverCollectionPence, "Unknown"), hint: "Final charges entered at completion, including invoices" },
    { label: "Manual entries (reported)", value: formatMoney(cards?.manualEntriesKnownPence ?? cards?.manualEntriesPence, "Not submitted"), hint: manualWarning || "Amounts in the driver's job summaries" },
    { label: reportedComplete ? "Reported hours" : "Reported hours (known)", value: formatMinutes(s.manualMinutesKnown), hint: s.manualMinutesUnknownJobs ? `${plural(s.manualMinutesUnknownJobs, "job")} not submitted` : undefined },
    { label: "Helper hours", value: s.helperHoursKnown ? formatMinutes(s.helperHoursKnown * 60) : <Missing>None reported</Missing> },
    ...MANUAL_METHODS.map(method => ({ label: method.label, value: formatMoney(s.systemPaymentsByMethodPence[method.key] ?? 0) }))
  ];
  return (
    <div className="space-y-3">
      <div className={cx(panel, "grid gap-6 p-5 lg:grid-cols-2 lg:gap-0 lg:divide-x lg:divide-admin-line lg:p-0 [&>section]:lg:p-5")}>
        <CompareColumn tone="system" title="System totals · selected range" source="Booking, pricing and app times" items={systemItems} />
        <CompareColumn tone="manual" title="Manual totals · selected range" source="Driver job flow and job summaries" items={manualItems} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <DiffCard label="Working hours vs reported hours" value={reportedComplete ? hoursDifference(s.workingMinutesKnown, s.manualMinutesKnown) : <Missing>Requires review</Missing>}
          detail={reportedComplete ? "Reported minus working time, all jobs submitted" : `${plural(s.manualMinutesUnknownJobs, "missing submission")}, so the totals can't be compared yet`} />
        <DiffCard label="Expected amount vs driver collected" value={cards?.totalChargesPence != null && cards?.driverCollectionPence != null && !cards.totalChargeUnknownJobs && !cards.driverCollectionUnknownJobs
          ? formatMoney(cards.driverCollectionPence - cards.totalChargesPence) : <Missing>Can't compare</Missing>}
          detail={`Final minus calculated charges · ${plural(cards?.adjustmentReasons.length ?? 0, "adjusted job")}`} />
      </div>
    </div>
  );
}

function DiffCard({ label, value, detail }: { label: string; value: React.ReactNode; detail: string }) {
  return (
    <div className={cx(panel, "px-4 py-3")}>
      <p className="text-[12.5px] font-medium text-admin-ink-2">Difference · {label}</p>
      <p className="mt-0.5 text-[18px] font-bold tabular-nums text-admin-ink">{value}</p>
      <p className="text-[12.5px] text-admin-ink-2">{detail}</p>
    </div>
  );
}

/** Submission state in the deployed dashboard's words, kept distinct from zero. */
export function submissionLabel(job: DriverReportJob): { label: string; tone: "success" | "warning" | "neutral" } {
  if (job.manualDetails) return { label: "Submitted", tone: "success" };
  if (/pending/i.test(job.manualStatus)) return { label: "Pending submission", tone: "warning" };
  if (/unavailable/i.test(job.manualStatus)) return { label: "Unavailable", tone: "neutral" };
  return { label: "Not submitted", tone: "warning" };
}

/** One job: System calculation | Driver manual details. */
export function JobComparison({ job, onJob }: { job: DriverReportJob; onJob?: (id: string) => void }) {
  const finance = job.finance, manual = job.manualDetails, submission = submissionLabel(job);
  const methods = finance.systemPayments.byMethod;
  const system: CompareItem[] = [
    { label: "Expected amount", value: formatMoney(finance.systemCalculatedPence, "Unknown") },
    { label: "Scheduled hours", value: formatMinutes(job.duration.bookedMinutes, "Unavailable") },
    { label: "Working hours", value: formatMinutes(job.duration.workingMinutes, "Unavailable") }
  ];
  const driver: CompareItem[] = [
    { label: "Driver collected", value: formatMoney(finance.acceptedPence, "Unknown"), hint: "Final charge entered at completion" },
    { label: "Manual entry (reported)", value: manual ? formatMoney(manual.amountCollectedPence) : <Missing>{submission.label}</Missing> },
    { label: "Reported hours", value: manual ? formatMinutes(job.duration.manualMinutes, "Unavailable") : <Missing>{submission.label}</Missing> },
    { label: "Helper hours", value: manual ? (manual.helperHours ? `${formatMinutes(manual.helperHours * 60)}${manual.helperName ? ` · ${manual.helperName}` : ""}` : "None reported") : <Missing>Not submitted</Missing> },
    ...MANUAL_METHODS.filter(method => method.key !== "Unknown" || (methods.Unknown ?? 0) > 0).map(method => ({ label: method.label, value: formatMoney(methods[method.key] ?? 0) })),
    { label: "Submission", value: manual ? formatDateTime(manual.submittedAt) : <Missing>{submission.label}</Missing> }
  ];
  const known = job.duration.workingMinutes !== null && job.duration.manualMinutes !== null && !!manual;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {onJob ? <Action size="sm" variant="ghost" onClick={() => onJob(job.jobId)} aria-label={`Open job ${job.jobId}`}>{job.jobId}</Action> : <span className="font-medium">{job.jobId}</span>}
        <Badge tone={submission.tone}>{submission.label}</Badge>
      </div>
      <div className="grid gap-5 rounded-xl border border-admin-line bg-surface p-4 md:grid-cols-2 md:gap-0 md:divide-x md:divide-admin-line md:p-0 [&>section]:md:p-4">
        <CompareColumn tone="system" title="System calculation" source="Booking, pricing, app times" items={system} />
        <CompareColumn tone="manual" title="Driver manual details" source="Job flow and job summary" items={driver} />
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-[13px] text-admin-ink-2">
        <span>Hours difference: <strong className="tabular-nums text-admin-ink">{known ? hoursDifference(job.duration.workingMinutes, job.duration.manualMinutes) : "Can't compare until the driver submits"}</strong></span>
        <span>Final minus expected: <strong className="tabular-nums text-admin-ink">{finance.systemCalculatedPence !== null && finance.acceptedPence !== null ? formatMoney(finance.acceptedPence - finance.systemCalculatedPence) : "Can't compare"}</strong></span>
      </div>
      {finance.adjustmentNote && <p className="text-[13px] text-admin-ink-2"><span className="font-semibold text-admin-ink">Adjustment reason:</span> {finance.adjustmentNote}</p>}
    </div>
  );
}

/** The Comparison tab: range totals, then every job in the range with filters. */
export function ComparisonTab({ report, go, onJob, filter, expanded, recon }: ReportTabProps & { filter: ReconFilter; expanded?: string; recon: ReconSource }) {
  const rows = useMemo(() => recon.jobs.map(job => ({ job, recon: reconcile(job, recon.gpsAvailable) })), [recon.jobs, recon.gpsAvailable]);
  const active = FILTERS.find(option => option.value === filter) ?? FILTERS[0];
  const visible = rows.filter(row => active.match(row.recon));
  const coversRange = recon.jobs.length >= recon.total;
  return (
    <div className="space-y-5">
      <ComparisonTotals report={report} />
      <section aria-labelledby="comparison-jobs-title" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="comparison-jobs-title" className="text-[17px] font-bold text-admin-ink">System / Manual comparison</h2>
            <p className="text-[13px] text-admin-ink-2">{coversRange ? `All ${plural(recon.total, "completed job")} in the selected range` : `${recon.jobs.length} of ${recon.total} jobs loaded`}</p>
          </div>
          <div className="flex w-full min-w-0 flex-wrap items-center gap-2 md:w-auto">
            <FilterSelect label="Job" value={expanded ?? ""} onChange={id => go({ expand: id })} allLabel="All jobs" className="w-full sm:w-[240px]"
              options={rows.map(({ job }) => ({ value: job.jobId, label: `${formatDate(job.operationalDate ?? job.bookedStart)} · ${job.customer.name || job.jobId}` }))} />
            <ChoiceChips label="Status" value={active.value} onChange={value => go({ reconFilter: value })}
              options={FILTERS.map(option => ({ value: option.value, label: option.label, count: rows.filter(row => option.match(row.recon)).length }))} />
          </div>
        </div>
        {!coversRange && !recon.loading && <Notice tone="warning">The server returned {recon.jobs.length} of {recon.total} jobs, so this list and its counts cover the loaded jobs only. Narrow the date range to review every job.</Notice>}
        <div className={cx(panel, "overflow-hidden")}>
          {recon.loading ? <LoadingState label="Loading jobs for the selected range" />
            : recon.error ? <ErrorState title="Couldn't load jobs for the comparison" message={recon.error} onRetry={recon.retry} />
            : visible.length === 0 ? <EmptyState kind={active.value === "all" ? "empty" : "no-matches"} title={active.value === "all" ? "No completed jobs in this range" : `No jobs in “${active.label}”`}
              actions={active.value !== "all" ? <Action onClick={() => go({ reconFilter: "all" })}>Show all statuses</Action> : undefined} />
            : (
              <ul className="divide-y divide-admin-line">
                {visible.map(({ job, recon: row }) => {
                  const open = expanded === job.jobId;
                  return (
                    <li key={job.jobId}>
                      <button type="button" onClick={() => go({ expand: open ? "" : job.jobId })} aria-expanded={open} aria-controls={`compare-${job.jobId}`}
                        className="grid w-full grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 text-left transition hover:bg-admin-surface/70 focus-visible:bg-admin-surface/70 focus-visible:outline-none">
                        {open ? <ChevronDown aria-hidden className="h-4 w-4 text-admin-ink-2" /> : <ChevronRight aria-hidden className="h-4 w-4 text-admin-ink-2" />}
                        <span className="min-w-0">
                          <span className="block truncate text-[15px] font-semibold text-admin-ink">{job.customer.name || "Customer not recorded"}</span>
                          <span className="block truncate text-[13px] text-admin-ink-2">{formatDate(job.operationalDate ?? job.bookedStart)} · {job.jobId}</span>
                        </span>
                        <span className="flex flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-3">
                          <Badge tone={row.tone}>{row.label}</Badge>
                          <span className="whitespace-nowrap text-[14px] font-semibold tabular-nums text-admin-ink">
                            {formatMoney(job.finance.acceptedPence, "Unknown")} / {job.manualDetails ? formatMoney(job.manualDetails.amountCollectedPence) : <span className="font-normal text-admin-muted">{submissionLabel(job).label}</span>}
                          </span>
                        </span>
                      </button>
                      {open && <div id={`compare-${job.jobId}`} className="border-t border-admin-line bg-admin-surface/40 px-4 py-4"><JobComparison job={job} onJob={onJob} /><p className="mt-2 text-[12.5px] text-admin-ink-2">{row.reason}</p></div>}
                    </li>
                  );
                })}
              </ul>
            )}
        </div>
        <p className="text-[12.5px] text-admin-ink-2">Amounts per row: final charge / the driver's manual entry. Payment-method amounts are what the driver recorded in the job flow at completion; invoices are billed, not received. To record a decision, open the job and use Manager review under Charges & payment.</p>
      </section>
    </div>
  );
}

export { RECON_META };
