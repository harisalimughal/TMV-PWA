/**
 * Live Operations: what is happening today, from today's jobs (refreshed every
 * minute). Everything is a fact about a job's current status or scheduled time:
 * nothing is predicted. The panel states when its data was last refreshed and
 * flags it as stale if the refresh has stopped, so it never reads as live when it
 * is not.
 */
import React from "react";
import { DateTime } from "luxon";
import { ArrowRight, Radio } from "lucide-react";
import type { NormalizedJob } from "../../types";
import { Action, EmptyState, ErrorState, LoadingState, focusRing } from "../ds";
import { cx } from "../../../../../ui/cx";
import { JobStatusBadge } from "../StatusBadge";
import { isUnassigned } from "../../hooks/useAttention";
import { openJob } from "../../navigation";
import { formatTime } from "../../utils/format";

const NEUTRAL_BAR = "bg-admin-line-strong";

const STALE_AFTER_MS = 4 * 60_000;

function until(iso: string, now: DateTime): string {
  const minutes = Math.round(DateTime.fromISO(iso).diff(now, "minutes").minutes);
  if (minutes <= 0) return "now";
  if (minutes < 60) return `in ${minutes} min`;
  return `in ${Math.floor(minutes / 60)} h ${minutes % 60 ? `${minutes % 60} min` : ""}`.trim();
}

function JobRow({ job, trailing }: { job: NormalizedJob; trailing: React.ReactNode }) {
  return (
    <li>
      <button type="button" onClick={() => openJob(job.jobId)} aria-label={`Open job ${job.jobId}, ${job.customerName || "customer not recorded"}`}
        className={cx("flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition hover:bg-admin-surface", focusRing)}>
        <span className="w-12 shrink-0 text-[13px] font-bold tabular-nums text-admin-ink">{formatTime(job.bookedStart, "—")}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-semibold text-admin-ink">{job.customerName || "Customer not recorded"}</span>
          <span className="block truncate text-[12px] text-admin-ink-2">{isUnassigned(job) ? "No driver assigned" : job.driverName} · {job.pickup || "Pickup not recorded"}</span>
        </span>
        <span className="shrink-0 text-right text-[12px] font-semibold text-admin-ink-2">{trailing}</span>
      </button>
    </li>
  );
}

function Column({ title, count, tone, children, empty }: { title: string; count: number; tone: string; children: React.ReactNode; empty: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-admin-line bg-surface/70 p-2">
      <div className="flex items-center justify-between px-2.5 pb-1 pt-1.5">
        <h3 className="text-[13.5px] font-bold text-admin-ink">{title}</h3>
        <span className={cx("rounded-full px-2 text-[12px] font-bold tabular-nums leading-5", tone)}>{count}</span>
      </div>
      {count === 0 ? <p className="px-2.5 py-4 text-[13px] text-admin-ink-2">{empty}</p> : <ul>{children}</ul>}
    </div>
  );
}

export function LiveOperations({ jobs, loading, error, onRetry, truncated, total, updatedAt, onOpenJobs }: {
  jobs: NormalizedJob[]; loading: boolean; error?: string; onRetry: () => void; truncated: boolean; total?: number; updatedAt: number | null; onOpenJobs: () => void;
}) {
  const now = DateTime.now();
  const active = jobs.filter(job => job.status === "IN_PROGRESS");
  const scheduled = jobs.filter(job => job.status === "READY");
  const upcoming = scheduled.filter(job => DateTime.fromISO(job.bookedStart) >= now).sort((a, b) => a.bookedStart.localeCompare(b.bookedStart));
  const pastStart = scheduled.filter(job => DateTime.fromISO(job.bookedStart) < now);
  const needsDriver = [...active, ...scheduled].filter(isUnassigned).sort((a, b) => a.bookedStart.localeCompare(b.bookedStart));
  const drivers = new Set(active.filter(job => !isUnassigned(job)).map(job => job.driverInitials));
  const freshness = updatedAt ? DateTime.fromMillis(updatedAt).setZone("Europe/London") : null;
  const stale = updatedAt !== null && Date.now() - updatedAt > STALE_AFTER_MS;

  const tiles = [
    // Colour carries meaning: brand for live work, and red / amber only while there is
    // something to act on. A zero count keeps the neutral bar, so it never reads as an alert.
    { label: "Active jobs", value: active.length, accent: "bg-[color:var(--chart-violet)]" },
    { label: "Drivers on jobs", value: drivers.size, accent: NEUTRAL_BAR },
    { label: "Upcoming pickups", value: upcoming.length, accent: NEUTRAL_BAR },
    { label: "Awaiting assignment", value: needsDriver.length, accent: needsDriver.length > 0 ? "bg-[color:var(--chart-coral)]" : NEUTRAL_BAR },
    { label: "Past start time", value: pastStart.length, accent: pastStart.length > 0 ? "bg-[color:var(--chart-amber)]" : NEUTRAL_BAR }
  ];

  return (
    <section aria-labelledby="live-ops-title" className="tmv-panel min-w-0">
      <header className="flex flex-wrap items-start justify-between gap-3 px-6 pt-5">
        <div className="flex items-start gap-3">
          <span aria-hidden className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-admin-brand-soft text-admin-brand"><Radio className="h-[18px] w-[18px]" /></span>
          <div>
            <h2 id="live-ops-title" className="flex items-center gap-2 text-[17px] font-bold leading-6 tracking-tight text-admin-ink">
              Today's jobs
              {freshness && !stale && !error && <span className="inline-flex items-center gap-1.5 rounded-full bg-admin-status-green-bg px-2 py-0.5 text-[12px] font-bold text-admin-status-green"><span aria-hidden className="tmv-live-dot h-1.5 w-1.5 rounded-full bg-admin-status-green" />Live</span>}
              {stale && <span className="rounded-full bg-admin-status-amber-bg px-2 py-0.5 text-[12px] font-bold text-admin-status-amber">Stale</span>}
            </h2>
            <p className="text-[13px] text-admin-ink-2">
              {freshness ? `Refreshed ${freshness.toFormat("HH:mm:ss")} · ` : ""}{stale ? "updates have stopped, refresh the page" : "refreshes every minute"}
            </p>
          </div>
        </div>
        <Action size="sm" onClick={onOpenJobs}>All of today's jobs<ArrowRight aria-hidden className="h-3.5 w-3.5" /></Action>
      </header>

      <div className="px-6 pb-5 pt-4">
        {loading ? <LoadingState label="Loading today's operations" rows={3} />
          : error ? <ErrorState compact title="Couldn't load today's jobs" message={error} onRetry={onRetry} />
          : jobs.length === 0 ? <EmptyState compact title="No jobs scheduled today" message="Bookings appear here when they sync from the Calendar." />
          : (
            <div className="space-y-4">
              <div role="group" aria-label="Today at a glance">
              <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                {tiles.map(tile => (
                  <div key={tile.label} className="relative flex flex-col-reverse overflow-hidden rounded-2xl border border-admin-line bg-surface/70 px-3.5 py-3">
                    <span aria-hidden data-accent={tile.accent === NEUTRAL_BAR ? "neutral" : "signal"} className={cx("absolute inset-x-0 top-0 h-1", tile.accent)} />
                    {/* dt before dd in the markup (valid list); shown value-first. */}
                    <dt className="text-[12.5px] font-semibold text-admin-ink-2">{tile.label}</dt>
                    <dd className="text-[26px] font-extrabold leading-8 tabular-nums tracking-tight text-admin-ink">{tile.value}</dd>
                  </div>
                ))}
              </dl>
              </div>
              {truncated && <p className="text-[12.5px] text-admin-status-amber">Showing the first {jobs.length} of {total} jobs today; figures cover only these. Open Jobs for the full list.</p>}
              <div className="grid gap-3 lg:grid-cols-3">
                <Column title="In progress now" count={active.length} tone="bg-admin-brand-soft text-admin-brand-dark" empty="No jobs in progress.">
                  {active.slice(0, 4).map(job => <JobRow key={job.jobId} job={job} trailing={<JobStatusBadge status={job.status} />} />)}
                </Column>
                <Column title="Next pickups" count={upcoming.length} tone="bg-admin-status-green-bg text-admin-status-green" empty="No more pickups scheduled today.">
                  {upcoming.slice(0, 4).map(job => <JobRow key={job.jobId} job={job} trailing={until(job.bookedStart, now)} />)}
                </Column>
                <Column title="Needs a driver" count={needsDriver.length} tone="bg-admin-status-red-bg text-admin-status-red" empty="Every active job has a driver.">
                  {needsDriver.slice(0, 4).map(job => <JobRow key={job.jobId} job={job} trailing={<JobStatusBadge status={job.status} />} />)}
                </Column>
              </div>
            </div>
          )}
      </div>
    </section>
  );
}
