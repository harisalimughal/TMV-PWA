/** Badges and the route / driver / schedule / charges summary at the top of a job. */
import React from "react";
import { UserX } from "lucide-react";
import type { NormalizedJob } from "../../types";
import { cx } from "../../../../../ui/cx";
import { formatDate, formatMoney, formatTime } from "../../utils/format";
import { isUnassigned } from "../../hooks/useAttention";
import { Badge, Missing, type Tone } from "../ds";
import { DriverViewedBadge, JobStatusBadge, JobRescheduleWarning, ReviewBadge, evidenceState, paymentState } from "../StatusBadge";
import { lifecycleOf } from "./model";
import { openJob } from "../../navigation";

function StateBadge({ label, tone, prefix }: { label: string; tone: Tone; prefix: string }) {
  return <span title={prefix}><Badge tone={tone}>{label}</Badge></span>;
}

/** Job status first and largest; payment, evidence and driver-viewed are secondary. */
export function JobBadges({ job }: { job: NormalizedJob }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <span className="scale-105 origin-left"><JobStatusBadge status={job.status} activity={job.activity} /></span>
      <JobRescheduleWarning notice={job.rescheduleNotice} />
      {job.rescheduledFromJobId && <button type="button" onClick={() => openJob(job.rescheduledFromJobId!)} className="text-[12.5px] font-semibold text-admin-brand hover:underline">Previous attempt: {job.rescheduledFromJobId}</button>}
      {job.rescheduledToJobId && <button type="button" onClick={() => openJob(job.rescheduledToJobId!)} className="text-[12.5px] font-semibold text-admin-brand hover:underline">Replacement attempt: {job.rescheduledToJobId}</button>}
      <span aria-hidden className="hidden h-4 w-px bg-admin-line sm:block" />
      <div className="flex flex-wrap gap-1.5" aria-label="Payment, evidence and driver status">
        <StateBadge {...paymentState(job)} prefix="Payment" />
        <StateBadge {...evidenceState(job)} prefix="Evidence" />
        <DriverViewedBadge viewedAt={job.driverViewedAt} />
        {job.status === "COMPLETED" && <ReviewBadge status={job.managerReviewStatus} />}
      </div>
    </div>
  );
}

/** "Not yet charged" and "Calculated £409" are different facts and are never merged. */
export function chargeHeadline(job: NormalizedJob): { amount: string; label: string; muted: boolean } {
  const calculated = job.totalCharges ?? job.calculatedTotalCharges;
  const stage = lifecycleOf(job);
  if (stage === "completed") return { amount: formatMoney(job.amountCharged), label: `Final charge · calculated ${formatMoney(calculated)}`, muted: false };
  if (stage === "cancelled") return { amount: "—", label: `Cancelled · calculated ${formatMoney(calculated)}`, muted: true };
  return { amount: "Not yet charged", label: `Calculated ${formatMoney(calculated)}`, muted: true };
}

export function JobSummary({ job }: { job: NormalizedJob }) {
  const headline = chargeHeadline(job);
  const unassigned = isUnassigned(job);
  const hours = job.bookedMinutes ? `${Math.round(job.bookedMinutes / 60 * 10) / 10} h booked` : "";
  return (
    <div className="grid grid-cols-2 gap-2.5 text-[14px] lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
      <ol aria-label="Route" className="tmv-job-route col-span-2 space-y-2 lg:col-span-1 rounded-xl border border-admin-line bg-admin-surface/60 px-3 py-2.5">
        {([["Pickup", job.pickup], ["Drop-off", job.dropoff]] as const).map(([kind, address]) => (
          <li key={kind} className="relative pl-6">
            <span aria-hidden className={cx("absolute left-0 top-[5px] h-[11px] w-[11px] rounded-full border-2 border-admin-brand", kind === "Pickup" ? "bg-surface" : "bg-admin-brand")} />
            <span className="mr-2 text-[11.5px] font-semibold uppercase tracking-wide text-admin-muted">{kind}</span>
            <span className="break-words text-admin-ink">{address || <Missing>Not recorded</Missing>}</span>
          </li>
        ))}
      </ol>
      <div className="flex min-w-0 items-center gap-3 rounded-xl border border-admin-line px-3 py-2.5">
        {unassigned
          ? <span className="inline-flex items-center gap-2 font-semibold text-admin-status-amber"><UserX aria-hidden className="h-4 w-4" />No driver assigned</span>
          : <>
              <span aria-hidden className="tmv-avatar grid h-9 w-9 shrink-0 place-items-center rounded-xl text-[12px] font-bold">{job.driverInitials || "?"}</span>
              <span className="min-w-0"><span className="block truncate font-semibold text-admin-ink">{job.driverName || job.driverInitials}</span>
                <span className="block text-[12.5px] text-admin-ink-2">{[job.driverInitials, job.crewSize ? `Crew ${job.crewSize}` : ""].filter(Boolean).join(" · ")}</span></span>
            </>}
      </div>
      <div className="rounded-xl border border-admin-line px-3 py-2.5">
        <p className="text-[12px] font-semibold uppercase tracking-wide text-admin-muted">Schedule</p>
        {job.bookedStart
          ? <>
              <p className="font-semibold tabular-nums text-admin-ink">{formatDate(job.bookedStart)}</p>
              <p className="font-semibold tabular-nums text-admin-ink">{formatTime(job.bookedStart)}{job.bookedFinish ? `–${formatTime(job.bookedFinish)}` : ""}</p>
            </>
          : <p className="font-medium italic text-admin-ink-2">Not scheduled</p>}
        <p className="text-[12.5px] text-admin-ink-2">{hours ? `${hours} · London time` : "London time"}</p>
      </div>
      <div className="col-span-2 rounded-xl border border-admin-line px-3 py-2.5 text-right lg:col-span-1">
        <p className={cx("text-[17px] font-bold leading-6 tabular-nums", headline.muted ? "text-admin-ink-2" : "text-admin-ink")}>{headline.amount}</p>
        <p className="text-[12.5px] text-admin-ink-2">{headline.label}</p>
      </div>
    </div>
  );
}
