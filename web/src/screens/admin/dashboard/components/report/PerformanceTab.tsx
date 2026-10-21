/**
 * Performance & Timings: range timing facts, the eight-milestone timing matrix the
 * deployed dashboard showed for every job (with a Job filter), each job's durations,
 * and driver-reported helpers.
 *
 * Working time (driver/app boundaries), moving time (tracker) and reported hours
 * (driver) are separate measures and never mixed. A milestone the tracker did not
 * record shows the tracker's own reason ("distance not recorded", "signal stale"),
 * never a made-up time and never a verdict on the driver.
 */
import React from "react";
import type { DriverReportJob } from "../../driverReport.types";
import { formatDate, formatMinutes } from "../../utils/format";
import { Action, EmptyState, FilterSelect, Missing, Notice, Pagination, panel } from "../ds";
import { arrival } from "./reportModel";
import { milestones } from "./milestones";
import { submissionLabel } from "./ComparisonTab";
import type { GpsState, ReportTabProps } from "./types";
import { TrackerLoading } from "./TrackerLoading";
import { cx } from "../../../../../ui/cx";

function Fact({ label, value, hint }: { label: string; value: React.ReactNode; hint?: React.ReactNode }) {
  return <div className="min-w-0"><p className="text-[12.5px] font-medium text-admin-ink-2">{label}</p><p className="mt-0.5 text-[18px] font-bold tabular-nums text-admin-ink">{value}</p>{hint && <p className="text-[12.5px] text-admin-ink-2">{hint}</p>}</div>;
}

/** Scheduled vs working, as two labelled bars on one scale. */
function HoursCompare({ scheduled, working }: { scheduled: number | null; working: number | null }) {
  const max = Math.max(scheduled ?? 0, working ?? 0, 1);
  const bar = (label: string, value: number | null, color: string) => (
    <div className="grid grid-cols-[90px_minmax(0,1fr)_72px] items-center gap-3 text-[13px]">
      <span className="text-admin-ink-2">{label}</span>
      <span className="h-2.5 overflow-hidden rounded-full bg-admin-surface"><span className="block h-full rounded-full" style={{ width: `${((value ?? 0) / max) * 100}%`, background: color }} /></span>
      <span className="text-right font-semibold tabular-nums">{formatMinutes(value, "Unavailable")}</span>
    </div>
  );
  return <div className="space-y-2" role="group" aria-label="Scheduled hours compared with working hours">{bar("Scheduled", scheduled, "var(--chart-violet)")}{bar("Working", working, "var(--chart-teal)")}</div>;
}

function MilestoneCell({ job, index, gps }: { job: DriverReportJob; index: number; gps: GpsState }) {
  const item = milestones(job)[index];
  if (!item.display && item.source === "Tracker" && gps.loading) return <TrackerLoading />;
  return item.display ? <span className="tabular-nums">{item.display}</span> : <span className="block"><span className="text-admin-muted">Not recorded</span>{item.missing !== "Not recorded" && <span className="mt-0.5 block text-[12px] leading-4 text-admin-status-amber">{item.missing}</span>}</span>;
}

export function PerformanceTab({ report, gps, onJob, onPage, go, expanded }: ReportTabProps & { expanded?: string }) {
  const s = report.summary;
  const all = report.jobs.items;
  const jobs = expanded ? all.filter(job => job.jobId === expanded) : all;
  const counts = all.reduce((acc, job) => { acc[arrival(job).status]++; return acc; }, { "on-time": 0, late: 0, unverified: 0 } as Record<string, number>);
  const movingUnavailable = gps.loading ? null : s.movingKnownSeconds == null || (s.movingKnownSeconds === 0 && s.completedJobs > 0 && s.movingUnknownJobs >= s.completedJobs);
  const labels = all[0] ? milestones(all[0]).map(item => item.label) : [];
  return (
    <div className="space-y-5">
      <div className={cx(panel, "grid gap-5 p-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]")}>
        <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
          <Fact label="Completed jobs" value={s.completedJobs} hint={`${s.cancelledJobs} cancelled`} />
          <Fact label="Overtime" value={formatMinutes(s.overtimeMinutesKnown)} hint={s.overtimeMinutesUnknownJobs ? `${s.overtimeMinutesUnknownJobs} jobs missing durations` : "Beyond the allowance"} />
          <Fact label="Arrival delays (total)" value={formatMinutes(s.arrivalDelayMinutesKnown)} hint="Verified arrivals only; not an average" />
          <Fact label="Arrivals on this page" value={`${counts["on-time"]} / ${counts.late} / ${counts.unverified}`} hint="On time / late / unverified" />
          <Fact label="Moving time (tracker)" value={gps.loading ? "Loading…" : movingUnavailable ? <Missing>Unavailable</Missing> : formatMinutes(s.movingKnownSeconds / 60)}
            hint={gps.error ? "Could not be loaded" : s.movingUnknownJobs || s.movingPartialJobs ? `${s.movingUnknownJobs} unavailable · ${s.movingPartialJobs} partial` : "Separate from working time"} />
          <Fact label="Reviews sent / not sent" value={`${s.reviewSentJobs} / ${s.reviewNotSentJobs}`} />
          <Fact label="Reported hours" value={formatMinutes(s.manualMinutesKnown)} hint={s.manualMinutesUnknownJobs ? `${s.manualMinutesUnknownJobs} not submitted` : "Driver-reported"} />
          <Fact label="Helper hours" value={s.helperHoursKnown ? formatMinutes(s.helperHoursKnown * 60) : <Missing>None reported</Missing>} hint="Driver-reported" />
        </div>
        <div className="space-y-2 lg:border-l lg:border-admin-line lg:pl-5">
          <p className="text-[13px] font-semibold text-admin-ink">Scheduled vs working hours</p>
          <HoursCompare scheduled={s.scheduledMinutesKnown ?? null} working={s.workingMinutesKnown} />
          <p className="text-[12.5px] text-admin-ink-2">{s.workingMinutesUnknownJobs ? `${s.workingMinutesUnknownJobs} job${s.workingMinutesUnknownJobs === 1 ? "" : "s"} without working times are not included.` : "All completed jobs timed."}</p>
        </div>
      </div>
      {gps.error && <Notice tone="warning" title="Movement data unavailable" action={gps.retry ? <Action size="sm" onClick={gps.retry}>Retry</Action> : undefined}>Tracker movement couldn't be loaded ({gps.error}). Times from the driver app are still shown.</Notice>}

      <section aria-labelledby="job-timings" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="job-timings" className="text-[17px] font-bold text-admin-ink">Job timings</h2>
          <FilterSelect label="Job" value={expanded ?? ""} onChange={id => go({ expand: id })} allLabel="All jobs on this page" className="w-full sm:w-[260px]"
            options={all.map(job => ({ value: job.jobId, label: `${formatDate(job.operationalDate ?? job.bookedStart)} · ${job.customer.name || job.jobId}` }))} />
        </div>
        <div className={cx(panel, "overflow-hidden")}>
          {jobs.length === 0 ? <EmptyState compact title="No jobs in this range" /> : (
            <>
              <div className="relative hidden overflow-x-auto md:block">
                <table className="w-full min-w-[1100px] text-[13.5px]">
                  <caption className="sr-only">Timing milestones for each job, London time</caption>
                  <thead><tr className="border-b border-admin-line bg-admin-surface/60 text-left align-bottom text-[12.5px] text-admin-ink-2">
                    {["Job", "Date", "Customer", ...labels].map(label => <th key={label} scope="col" className="px-3 py-2.5 font-semibold">{label}</th>)}
                  </tr></thead>
                  <tbody className="divide-y divide-admin-line">
                    {jobs.map(job => (
                      <tr key={job.jobId} className="align-top hover:bg-admin-surface/50">
                        <th scope="row" className="px-3 py-2.5 text-left font-normal"><button type="button" onClick={() => onJob(job.jobId)} className="inline-flex min-h-6 items-center whitespace-nowrap font-semibold text-admin-brand hover:underline" aria-label={`Open job ${job.jobId}`}>{job.jobId}</button></th>
                        <td className="whitespace-nowrap px-3 py-2.5 tabular-nums">{formatDate(job.operationalDate ?? job.bookedStart)}</td>
                        <td className="max-w-[180px] break-words px-3 py-2.5">{job.customer.name || <Missing />}</td>
                        {labels.map((_, index) => <td key={index} className="max-w-[150px] px-3 py-2.5"><MilestoneCell job={job} index={index} gps={gps} /></td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ul className="divide-y divide-admin-line md:hidden">
                {jobs.map(job => (
                  <li key={job.jobId} className="space-y-2 px-4 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0"><p className="truncate font-semibold">{job.customer.name || "Customer not recorded"}</p><p className="text-[12.5px] text-admin-ink-2">{formatDate(job.operationalDate ?? job.bookedStart)} · {job.jobId}</p></div>
                      <Action size="sm" onClick={() => onJob(job.jobId)} aria-label={`Open job ${job.jobId}`}>Open</Action>
                    </div>
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[13px]">
                      {milestones(job).map((item, index) => <div key={item.key} className="min-w-0"><dt className="text-[12px] text-admin-ink-2">{item.label}</dt><dd><MilestoneCell job={job} index={index} gps={gps} /></dd></div>)}
                    </dl>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </section>

      <section aria-labelledby="job-performance" className="space-y-3">
        <h2 id="job-performance" className="text-[17px] font-bold text-admin-ink">Job performance</h2>
        <div className={cx(panel, "overflow-hidden")}>
          <div className="relative overflow-x-auto" tabIndex={0} role="region" aria-label="Job durations table, scrolls sideways">
            <table className="w-full min-w-[900px] text-[13.5px]">
              <caption className="sr-only">Durations for each job</caption>
              <thead><tr className="border-b border-admin-line bg-admin-surface/60 text-left text-[12.5px] text-admin-ink-2">
                {["Job", "Scheduled", "Allocated", "Working", "Moving", "Overtime", "Arrival", "Reported", "Review"].map(label => <th key={label} scope="col" className={cx("px-3 py-2.5 font-semibold", label !== "Job" && label !== "Arrival" && label !== "Review" && "text-right")}>{label}</th>)}
              </tr></thead>
              <tbody className="divide-y divide-admin-line">
                {jobs.map(job => {
                  const d = job.duration, arrive = arrival(job), moving = job.movement?.onJob.movingSeconds;
                  return (
                    <tr key={job.jobId}>
                      <th scope="row" className="px-3 py-2.5 text-left font-normal"><span className="block font-medium">{job.customer.name || job.jobId}</span><span className="text-[12px] text-admin-ink-2">{job.jobId}</span></th>
                      <td className="px-3 py-2.5 text-right tabular-nums">{formatMinutes(d.bookedMinutes, "Unavailable")}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{formatMinutes(d.allocatedMinutes, "Unavailable")}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{formatMinutes(d.workingMinutes, "Unavailable")}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{moving == null ? gps.loading ? <TrackerLoading /> : <Missing>Unavailable</Missing> : formatMinutes(moving / 60)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{formatMinutes(d.overtimeMinutes, "Unavailable")}</td>
                      <td className="px-3 py-2.5">{arrive.status === "unverified" ? <Missing>Unverified</Missing> : arrive.status === "late" ? <span className="text-admin-status-amber">{formatMinutes(arrive.minutes)} late</span> : "On time"}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{job.manualDetails ? formatMinutes(d.manualMinutes, "Unavailable") : <Missing>{submissionLabel(job).label}</Missing>}</td>
                      <td className="px-3 py-2.5">{job.reviewSent ? "Sent" : <span className="text-admin-status-amber">Not sent</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination page={report.jobs.page} pageSize={report.jobs.pageSize} total={report.jobs.total} noun="job" onPage={page => onPage("jobs", page)} />
        </div>
      </section>

      {s.helpers.length > 0 && (
        <section aria-labelledby="helpers" className={cx(panel, "px-5 py-4")}>
          <h2 id="helpers" className="text-[15px] font-semibold">Driver-reported helpers</h2>
          <table className="mt-2 w-full max-w-lg text-[13.5px]">
            <thead><tr className="text-left text-admin-ink-2"><th className="py-1 font-medium">Helper</th><th className="py-1 text-right font-medium">Reported hours</th><th className="py-1 text-right font-medium">Jobs</th></tr></thead>
            <tbody className="divide-y divide-admin-line">{s.helpers.map(helper => <tr key={helper.name}><td className="py-1.5">{helper.name}</td><td className="py-1.5 text-right tabular-nums">{formatMinutes(helper.hours * 60)}</td><td className="py-1.5 text-right tabular-nums">{helper.jobs}</td></tr>)}</tbody>
          </table>
        </section>
      )}
    </div>
  );
}
