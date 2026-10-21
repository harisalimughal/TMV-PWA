/**
 * Jobs tab: the selected range's totals as on the deployed dashboard (total jobs,
 * charges, driver collected, manual entries, road charges, hours, moving time,
 * overtime, review reports), the trend, then the job history with each job
 * expandable into its full record (./JobRecord).
 *
 * Every figure is the backend summary value. Warnings the old report gave (missing and
 * invalid manual entries, unavailable durations, partial moving time) stay under the
 * figure they qualify.
 */
import React, { Suspense, lazy } from "react";
import { Banknote, Briefcase, CircleDollarSign, Clock3, Gauge, Hourglass, MessageSquareText, ReceiptText, Route, TrafficCone, Waypoints } from "lucide-react";
import { formatMinutes, formatMoney, plural } from "../../utils/format";
import { Action, EmptyState, KpiCard, LoadingState, Notice, Pagination, RadialProgress, CHART } from "../ds";
import { manualEntryWarning } from "./PaymentsTab";
import { summaryCoverage } from "./reportModel";
import { JobRecord } from "./JobRecord";
import type { ReportTabProps } from "./types";

const DriverPerformanceCharts = lazy(() => import("../DriverPerformanceCharts").then(module => ({ default: module.DriverPerformanceCharts })));

const ratio = (part: number, whole: number) => whole > 0 ? part / whole : null;

export function JobsTab({ report, gps, onJob, onPage, go, expanded }: ReportTabProps & { expanded?: string }) {
  const s = report.summary, cards = s.paymentCards, road = s.roadChargeTotals;
  const coverage = summaryCoverage(report, gps);
  const manualWarning = manualEntryWarning(cards);
  const reviews = s.reviewSentJobs + s.reviewNotSentJobs;
  const scheduled = s.completedJobs > 0 && s.scheduledMinutesUnknownJobs === s.completedJobs ? "Unavailable" : formatMinutes(s.scheduledMinutesKnown ?? null);
  const movingUnavailable = s.movingKnownSeconds == null || (s.movingKnownSeconds === 0 && s.completedJobs > 0 && s.movingUnknownJobs >= s.completedJobs);
  const ring = (value: number | null, label: string, color: string, text: React.ReactNode) => (
    <RadialProgress value={value} size={64} stroke={8} color={color} label={label}><span className="text-[12px] font-bold tabular-nums text-admin-ink">{text}</span></RadialProgress>
  );
  const jobs = report.jobs;
  return (
    <div className="space-y-5">
      <section aria-labelledby="range-totals" className="space-y-3">
        <h2 id="range-totals" className="text-[17px] font-bold text-admin-ink">Selected range totals</h2>
        <div role="group" aria-label="Selected range totals" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard label="Total jobs" icon={<Briefcase />} accent="violet" value={s.assignedJobs}
            detail={`${s.completedJobs} completed · ${s.cancelledJobs} cancelled`}
            visual={ring(ratio(s.completedJobs, s.assignedJobs), `${s.completedJobs} of ${s.assignedJobs} jobs completed`, CHART.violet, `${Math.round((ratio(s.completedJobs, s.assignedJobs) ?? 0) * 100)}%`)} />
          <KpiCard label="Total charges (expected)" icon={<ReceiptText />} accent="blue" value={formatMoney(cards?.totalChargesPence, "Unknown")}
            detail={cards?.totalChargeUnknownJobs ? `${plural(cards.totalChargeUnknownJobs, "job")} without a calculated charge` : "Calculated by the system"} />
          <KpiCard label="Driver collected" icon={<CircleDollarSign />} accent="teal" value={formatMoney(cards?.driverCollectionPence, "Unknown")}
            detail={cards?.adjustmentReasons.length ? `${plural(cards.adjustmentReasons.length, "recorded adjustment")} · final charges incl. invoices` : "No recorded adjustments · final charges incl. invoices"} />
          <KpiCard label="Manual entries (reported)" icon={<Banknote />} accent="amber" value={formatMoney(cards?.manualEntriesKnownPence ?? cards?.manualEntriesPence, "Not submitted")}
            tone={manualWarning ? "attention" : "default"} detail={manualWarning || "What the driver reported collecting"} />
          <KpiCard label="Tunnel charges" icon={<Route />} accent="blue" value={formatMoney(road?.tunnelPence, "Unknown")}
            detail={road?.tunnelUnknownJobs ? `${plural(road.tunnelUnknownJobs, "job")} unknown` : "Saved completed-job charges"} onOpen={() => go({ tab: "tunnels" })} openLabel="Tunnel activity" />
          <KpiCard label="Congestion charges" icon={<TrafficCone />} accent="coral" value={formatMoney(road?.congestionPence, "Unknown")}
            detail={road?.congestionUnknownJobs ? `${plural(road.congestionUnknownJobs, "job")} unknown` : "Saved completed-job charges"} onOpen={() => go({ tab: "congestion" })} openLabel="Congestion activity" />
          <KpiCard label="Scheduled hours" icon={<Clock3 />} accent="violet" value={scheduled}
            detail={s.scheduledMinutesUnknownJobs ? `${s.scheduledMinutesUnknownJobs} unavailable calendar duration${s.scheduledMinutesUnknownJobs === 1 ? "" : "s"}` : "Calendar duration"} />
          <KpiCard label="Working hours" icon={<Hourglass />} accent="teal" value={formatMinutes(s.workingMinutesKnown)}
            tone={s.workingMinutesUnknownJobs ? "attention" : "default"}
            detail={s.workingMinutesUnknownJobs ? `${s.workingMinutesUnknownJobs} unavailable duration${s.workingMinutesUnknownJobs === 1 ? "" : "s"}` : "Arrival to finish"}
            visual={s.scheduledMinutesKnown ? ring(ratio(s.workingMinutesKnown, s.scheduledMinutesKnown), "Working hours as a share of scheduled hours", CHART.teal, `${Math.round((ratio(s.workingMinutesKnown, s.scheduledMinutesKnown) ?? 0) * 100)}%`) : undefined} />
          <KpiCard label="Moving time" icon={<Waypoints />} accent="blue" loading={gps.loading}
            value={movingUnavailable ? "Unavailable" : formatMinutes(s.movingKnownSeconds / 60)} tone={s.movingUnknownJobs || s.movingPartialJobs ? "attention" : "default"}
            detail={gps.error ? "Tracker movement could not be loaded" : [s.movingUnknownJobs ? `${s.movingUnknownJobs} unavailable` : "", s.movingPartialJobs ? `${s.movingPartialJobs} partial` : ""].filter(Boolean).join(" · ") || "Tracker, separate from working time"} />
          <KpiCard label="Overtime" icon={<Gauge />} accent="amber" value={formatMinutes(s.overtimeMinutesKnown)}
            detail={s.overtimeMinutesUnknownJobs ? `${s.overtimeMinutesUnknownJobs} jobs missing durations` : "Extra time beyond the allowance"} />
          <KpiCard label="Reviews sent / not sent" icon={<MessageSquareText />} accent="violet" value={`${s.reviewSentJobs} / ${s.reviewNotSentJobs}`}
            detail={reviews ? `${s.reviewNotSentJobs} review request${s.reviewNotSentJobs === 1 ? "" : "s"} not sent` : "No completed jobs"}
            visual={ring(ratio(s.reviewSentJobs, reviews), `${s.reviewSentJobs} of ${reviews} review requests sent`, CHART.violet, `${s.reviewSentJobs}/${reviews}`)} />
        </div>
      </section>

      <Notice tone={coverage.complete ? "success" : "info"} title={coverage.complete ? "Coverage: complete for this range" : "Coverage"}
        action={gps.error && gps.retry ? <Action size="sm" onClick={gps.retry}>Retry details</Action> : undefined}>
        {coverage.complete ? "Every completed job has timings, receipts and a driver submission." : `${coverage.lines.join(" · ")}. Totals above are known values only.`}
      </Notice>

      <Suspense fallback={<LoadingState label="Loading charts" rows={3} />}><DriverPerformanceCharts trends={report.trends} /></Suspense>

      <section aria-labelledby="job-history" className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="job-history" className="text-[17px] font-bold text-admin-ink">Job history</h2>
          <span className="text-[13px] text-admin-ink-2">{plural(jobs.total, "job")} · select a job to see its full record</span>
        </div>
        {jobs.items.length === 0 ? <div className="tmv-panel"><EmptyState compact title="No jobs in this range" /></div> : (
          <ul className="space-y-2">
            {jobs.items.map(job => <JobRecord key={job.jobId} job={job} open={expanded === job.jobId} gpsAvailable={gps.available} gps={gps}
              onToggle={() => go({ expand: expanded === job.jobId ? "" : job.jobId })} onJob={onJob} />)}
          </ul>
        )}
        <div className="tmv-panel overflow-hidden"><Pagination page={jobs.page} pageSize={jobs.pageSize} total={jobs.total} noun="job" onPage={page => onPage("jobs", page)} /></div>
      </section>
    </div>
  );
}
