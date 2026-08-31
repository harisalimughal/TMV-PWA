import React from "react";
import { cx } from "../../ui";
import type { Job } from "../../api/jobs";

export type JobBucket = "past" | "today" | "next";

type Signal = "active" | "attention" | "done" | "upcoming" | "cancelled";

interface StatusMeta {
  signal: Signal;
  label: string;
}

/**
 * One place that turns a job (plus its list bucket) into a system state.
 * Consistent everywhere a job appears:
 *
 *   blue  = in progress        amber = needs finishing (past, not done)
 *   green = completed          grey  = scheduled / upcoming
 *   red   = cancelled
 */
export function jobStatusMeta(job: Job, bucket?: JobBucket): StatusMeta {
  if (job.status === "IN_PROGRESS") return { signal: "active", label: "In progress" };
  if (job.status === "COMPLETED") return { signal: "done", label: "Completed" };
  if (job.status === "CANCELLED") return { signal: "cancelled", label: "Cancelled" };
  if (bucket === "past") return { signal: "attention", label: "Needs finishing" };
  if (bucket === "next") return { signal: "upcoming", label: "Upcoming" };
  return { signal: "upcoming", label: "Scheduled" };
}

const MARK: Record<Signal, string> = {
  active: "bg-brand",
  attention: "bg-warning-signal",
  done: "bg-success-signal",
  upcoming: "bg-line-strong",
  cancelled: "bg-danger-signal"
};

const CHIP: Record<Signal, string> = {
  active: "bg-brand-subtle text-brand-subtle-fg",
  attention: "bg-warning-subtle text-warning",
  done: "bg-success-subtle text-success",
  upcoming: "bg-surface-sunken text-fg-muted",
  cancelled: "bg-danger-subtle text-danger"
};

export interface StatusIndicatorProps {
  job: Job;
  bucket?: JobBucket;
  tone?: "default" | "onDark";
  className?: string;
}

/**
 * A compact status chip: a coloured dot + label on a faint tint. Small, muted —
 * a system state, not a decoration.
 */
export function StatusIndicator({ job, bucket, className }: StatusIndicatorProps) {
  const meta = jobStatusMeta(job, bucket);
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-meta font-semibold",
        CHIP[meta.signal],
        className
      )}
    >
      <span className={cx("size-1.5 rounded-full", MARK[meta.signal])} aria-hidden />
      {meta.label}
    </span>
  );
}

/** @deprecated kept for import compatibility — use <StatusIndicator>. */
export const JobStatusChip = StatusIndicator;
export type JobStatusChipProps = StatusIndicatorProps;
