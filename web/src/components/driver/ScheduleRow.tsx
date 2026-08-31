import React from "react";
import { ChevronRight } from "lucide-react";
import { cx } from "../../ui";
import type { Job } from "../../api/jobs";
import { JobRoute } from "./JobRoute";
import { JobTime } from "./JobTime";
import { StatusIndicator, type JobBucket } from "./JobStatusChip";

function gbp(v: number): string {
  return `£${(v ?? 0).toFixed(0)}`;
}

export interface ScheduleRowProps {
  job: Job;
  bucket?: JobBucket;
  onOpen: () => void;
}

/**
 * One line of the schedule: a time column, a light divider, then the job. Reads
 * top-to-bottom like a timetable; a hover highlight and one tap open it.
 */
export function ScheduleRow({ job, bucket, onOpen }: ScheduleRowProps) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cx(
        "group -mx-2 grid w-[calc(100%+1rem)] grid-cols-[60px_1fr_18px] items-start gap-x-3.5 rounded-lg px-2 py-3.5 text-left",
        "border-b border-line last:border-b-0",
        "transition-colors duration-fast hover:bg-surface-sunken",
        "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand"
      )}
    >
      <div className="border-r border-line pr-3.5">
        <JobTime iso={job.bookedStart} variant="column" />
      </div>

      <div className="min-w-0">
        <h3 className="truncate text-card text-fg">
          {job.customerName || "Unnamed customer"}
        </h3>
        <StatusIndicator job={job} bucket={bucket} className="mt-1" />
        <JobRoute pickup={job.pickup} dropoff={job.dropoff} density="compact" className="mt-2.5" />
        <div className="mt-2.5 flex items-center gap-3 text-meta text-fg-subtle">
          <span>{job.crewSize || "?"} crew</span>
          {job.basePrice > 0 && (
            <>
              <span className="text-line-strong">·</span>
              <span className="font-medium text-fg-muted">{gbp(job.basePrice)}</span>
            </>
          )}
        </div>
      </div>

      <ChevronRight
        className="mt-0.5 size-[18px] text-fg-subtle transition-transform duration-fast group-hover:translate-x-0.5"
        aria-hidden
      />
    </button>
  );
}

/** Structured loading placeholder shaped like a row. */
export function ScheduleRowSkeleton() {
  return (
    <div className="grid grid-cols-[60px_1fr_18px] gap-x-3.5 border-b border-line py-3.5">
      <div className="border-r border-line pr-3.5">
        <div className="skeleton h-4 w-12 rounded" />
        <div className="skeleton mt-1.5 h-2.5 w-12 rounded" />
      </div>
      <div className="min-w-0 space-y-2">
        <div className="skeleton h-4 w-36 rounded" />
        <div className="skeleton h-2.5 w-24 rounded" />
        <div className="skeleton h-3 w-11/12 rounded" />
        <div className="skeleton h-3 w-4/5 rounded" />
      </div>
      <div />
    </div>
  );
}
