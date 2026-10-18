/**
 * Jobs / Cards: one card per job, read top to bottom the way an operator scans it.
 *
 *   header       checkbox, driver (initials, name) and scheduled time, status badge, actions
 *   body         customer name (the card's main link) with the job amount on the same row,
 *                then the booking's own description line
 *   attention    the first issue, if any, with its severity
 *   footer       the job reference (shown once, here only) and the total, labelled by what it is
 *
 * The status colour is a thin edge and the status badge's text; the card body stays
 * neutral so a page of cards reads as one surface. The whole card opens the job; the
 * checkbox and the action menu are separate controls that never open it.
 */
import React from "react";
import { AlertTriangle, ArrowUpRight, Check, Clock, Copy, MoreHorizontal, Trash2, UserPlus, UserX } from "lucide-react";
import type { NormalizedJob } from "../../types";
import { openJob } from "../../navigation";
import { formatDate, formatMoney, formatTime } from "../../utils/format";
import { resolveDriver } from "../../utils/drivers";
import { isUnassigned } from "../../hooks/useAttention";
import { Badge, focusRing } from "../ds";
import { Menu } from "../../../../../ui/Menu";
import { cx } from "../../../../../ui/cx";
import { attentionOf, crewLine, jobAccent, rowCharge } from "./jobView";
import { JobRescheduleWarning } from "../StatusBadge";

/** The footer total, named for what it is so a calculated amount is never read as the final charge. */
const TOTAL_LABEL = { Final: "Total · final charge", Calculated: "Total · calculated", "Not charged": "Total · cancelled, not charged" } as const;

export interface JobCardActions {
  onToggle: (id: string) => void;
  onReassign: (id: string) => void;
  onDelete: (id: string) => void;
}

export function JobCard({ job, selected, actions }: { job: NormalizedJob; selected: boolean; actions: JobCardActions }) {
  const accent = jobAccent(job);
  const charge = rowCharge(job);
  const attention = attentionOf(job);
  const unassigned = isUnassigned(job);
  const driver = unassigned ? null : resolveDriver(job.driverName, job.driverInitials);
  const crew = crewLine(job);
  const customer = job.customerName || "Customer not recorded";
  const [copied, setCopied] = React.useState(false);
  const booked = typeof job.basePrice === "number" && job.basePrice > 0 ? formatMoney(job.basePrice) : null;
  const description = (job.rawTitle || "").trim() || crew;
  const noCharge = charge.label === "Not charged";
  const when = job.bookedStart ? `${formatDate(job.bookedStart)} · ${formatTime(job.bookedStart)}` : "Not scheduled";
  const chips = attention.items.slice(0, 2);
  const copy = () => { void navigator.clipboard?.writeText(job.jobId); setCopied(true); window.setTimeout(() => setCopied(false), 1500); };
  return (
    <article aria-label={`${customer}, ${job.jobId}`} data-selected={selected || undefined}
      className={cx("tmv-job-card group relative flex flex-col", `tmv-job-${accent.accent}`, selected && "tmv-job-selected")}>
      <header className="px-4 pt-4">
        <div className="flex items-center gap-3">
          <input type="checkbox" aria-label={`Select job ${job.jobId}`} checked={selected} onChange={() => actions.onToggle(job.jobId)}
            className="relative z-10 h-4 w-4 shrink-0 cursor-pointer accent-admin-brand" />
          {driver ? (
            <span aria-hidden className="tmv-avatar grid h-10 w-10 shrink-0 place-items-center rounded-xl text-[12.5px] font-bold">{job.driverInitials || driver.code || "?"}</span>
          ) : (
            <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-dashed border-admin-status-amber/50 bg-admin-status-amber-bg text-admin-status-amber"><UserX className="h-4 w-4" /></span>
          )}
          <p title={driver ? driver.name : undefined} className={cx("min-w-0 flex-1 truncate text-[15px] font-semibold leading-5", driver ? "text-admin-ink" : "text-admin-status-amber")}>{driver ? driver.name : "No driver assigned"}</p>
          <div className="relative z-10 -mr-1.5">
            <Menu align="end" items={[
              { id: "open", label: "Open job", icon: <ArrowUpRight className="h-4 w-4" />, onSelect: () => openJob(job.jobId) },
              { id: "reassign", label: unassigned ? "Assign driver…" : "Reassign driver…", icon: <UserPlus className="h-4 w-4" />, onSelect: () => actions.onReassign(job.jobId), disabled: job.status === "CANCELLED" || job.status === "COMPLETED" },
              { id: "copy", label: "Copy job reference", icon: <Copy className="h-4 w-4" />, onSelect: () => copy() },
              { id: "delete", label: "Delete job…", icon: <Trash2 className="h-4 w-4" />, tone: "danger", separatorBefore: true, onSelect: () => actions.onDelete(job.jobId) }
            ]} trigger={props => (
              <button type="button" {...props} aria-label={`Actions for job ${job.jobId}`}
                className={cx("grid h-9 w-9 place-items-center rounded-lg text-admin-ink-2 hover:bg-admin-surface hover:text-admin-ink", focusRing)}>
                <MoreHorizontal aria-hidden className="h-[18px] w-[18px]" />
              </button>
            )} />
          </div>
        </div>
        <div className="mt-2.5 flex items-center justify-between gap-3 pl-[28px]">
          <p className="flex min-w-0 items-center gap-1.5 text-[13px] font-medium tabular-nums text-admin-ink-2">
            <Clock aria-hidden className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate" title={when}>{when}</span>
          </p>
          <Badge tone={accent.tone} className="shrink-0">{accent.label}</Badge>
        </div>
      </header>

      <div className="px-4 pb-3 pt-4">
        <JobRescheduleWarning notice={job.rescheduleNotice} />
        <div className="flex items-start justify-between gap-4">
          <h2 className="min-w-0 break-words text-[19px] font-bold leading-6 tracking-tight text-admin-ink">
            <button type="button" onClick={() => openJob(job.jobId)} title={customer}
              className={cx("line-clamp-2 max-w-full text-left after:absolute after:inset-0 after:rounded-[inherit] after:content-['']", focusRing, !job.customerName && "text-[15px] font-semibold italic text-admin-ink-2")}>{customer}</button>
          </h2>
          <span className="shrink-0 text-right" title="The price the booking was made at. The total below is what the job came to.">
            {booked
              ? <span className="block text-[16px] font-bold tabular-nums leading-6 text-admin-ink">{booked}</span>
              : <span className="block text-[13px] font-medium italic leading-6 text-admin-ink-2">Not recorded</span>}
            <span className="block text-[11.5px] font-medium text-admin-ink-2">Booked price</span>
          </span>
        </div>
        {description && <p className="mt-1.5 line-clamp-2 break-words text-[13.5px] leading-5 text-admin-ink-2" title={description}>{description}</p>}
      </div>

      {chips.length > 0 && (
        <ul aria-label="Needs attention" className="mx-4 mb-3 mt-auto flex flex-wrap gap-1.5">
          {chips.map(item => (
            <li key={item.id} title={item.detail || item.title}
              className={cx("inline-flex max-w-full items-center gap-1.5 rounded-lg border px-2 py-1 text-[12.5px] font-semibold",
                item.severity === "high" ? "border-admin-status-red/30 bg-admin-status-red-bg text-admin-status-red" : item.severity === "medium" ? "border-admin-status-amber/30 bg-admin-status-amber-bg text-admin-status-amber" : "border-admin-line bg-admin-surface text-admin-ink-2")}>
              <AlertTriangle aria-hidden className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{item.title}</span>
            </li>
          ))}
          {attention.items.length > chips.length && <li className="inline-flex items-center rounded-lg border border-admin-line bg-admin-surface px-2 py-1 text-[12.5px] font-semibold text-admin-ink-2" title={attention.items.slice(chips.length).map(item => item.title).join("; ")}>+{attention.items.length - chips.length}</li>}
        </ul>
      )}

      <footer className={cx("flex items-end justify-between gap-3 border-t border-admin-line px-4 py-3", !chips.length && "mt-auto")}>
        <span className="relative z-10 flex min-w-0 items-center gap-1">
          <span title={job.jobId} className="truncate font-mono text-[12.5px] font-semibold tracking-wide text-admin-ink-2">{job.jobId}</span>
          <button type="button" aria-label={`Copy job reference ${job.jobId}`} onClick={event => { event.stopPropagation(); copy(); }}
            className={cx("grid h-7 w-7 shrink-0 place-items-center rounded-md text-admin-muted hover:bg-admin-surface hover:text-admin-ink", focusRing)}>
            {copied ? <Check aria-hidden className="h-3.5 w-3.5 text-admin-status-green" /> : <Copy aria-hidden className="h-3.5 w-3.5" />}
          </button>
          <span role="status" className="sr-only">{copied ? "Job reference copied" : ""}</span>
        </span>
        <span className="shrink-0 text-right">
          <span className={cx("block text-[18px] font-bold leading-6 tabular-nums tracking-tight", noCharge ? "text-admin-ink-2" : "text-admin-ink")}>
            {noCharge ? "—" : formatMoney(charge.pence, charge.label === "Calculated" ? "Not priced" : "Not recorded")}
          </span>
          <span className="block text-[11.5px] font-medium text-admin-ink-2">{TOTAL_LABEL[charge.label]}</span>
        </span>
      </footer>
    </article>
  );
}

export function JobCardSkeleton() {
  return (
    <div aria-hidden className="tmv-job-card tmv-job-neutral space-y-3 p-4">
      <div className="tmv-shimmer h-4 w-2/5 rounded" />
      <div className="tmv-shimmer h-5 w-3/5 rounded" />
      <div className="tmv-shimmer h-[88px] rounded-xl" />
      <div className="flex gap-3"><div className="tmv-shimmer h-9 w-9 rounded-xl" /><div className="tmv-shimmer h-9 flex-1 rounded" /></div>
    </div>
  );
}

/** Responsive to the content column, not the viewport: as many 320 px columns as fit. */
export function JobCardGrid({ children, label = "Jobs" }: { children: React.ReactNode; label?: string }) {
  return <ul aria-label={label} className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(min(100%,340px),1fr))]">{children}</ul>;
}
