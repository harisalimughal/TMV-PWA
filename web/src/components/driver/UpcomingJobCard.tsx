import React from "react";
import { cx } from "../../ui";
import type { Job } from "../../api/jobs";
import { BookingWindowHeader } from "./BookingWindowHeader";
import { CustomerIdentity } from "./CustomerIdentity";
import { JobDetailsPanel } from "./JobDetailsPanel";

export interface UpcomingJobCardProps {
  job: Job;
  expanded: boolean;
  onToggle: () => void;
  /** Position in its list — drives the staggered entry animation. */
  index?: number;
}

/**
 * An Upcoming-tab job, styled the same as <FeaturedJobCard> (Today's card) rather
 * than the old compact three-column row: the booking-window header is always
 * visible collapsed, and tapping it reveals the exact same <CustomerIdentity> +
 * <JobDetailsPanel> content Today's card shows, just with no Start Job footer --
 * an Upcoming job isn't actionable yet, only readable.
 */
export function UpcomingJobCard({ job, expanded, onToggle, index }: UpcomingJobCardProps) {
  return (
    <div
      style={index !== undefined ? { animationDelay: `${Math.min(index, 12) * 28}ms` } : undefined}
      className={cx(
        "w-full rounded-panel border border-line-strong bg-surface p-4 text-left",
        "shadow-[0_1px_3px_rgb(15_23_42/0.08),0_12px_28px_-10px_rgb(15_23_42/0.22)]",
        index !== undefined && "row-stagger"
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="block w-full rounded-card focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2"
      >
        <BookingWindowHeader job={job} />
      </button>

      {expanded && (
        <>
          <CustomerIdentity customerName={job.customerName} customerPhone={job.customerPhone} className="mt-4" />
          <JobDetailsPanel job={job} className="mt-4" />
        </>
      )}
    </div>
  );
}

/** Structured loading placeholder shaped like the collapsed card. */
export function UpcomingJobCardSkeleton() {
  return (
    <div className="w-full rounded-panel border border-line-strong bg-surface p-4">
      <div className="rounded-card border border-line/40 bg-surface px-4 py-3">
        <div className="flex items-center justify-center gap-2">
          <div className="skeleton h-6 w-20 rounded" />
          <div className="skeleton h-6 w-24 rounded" />
        </div>
        <div className="skeleton mx-auto mt-2 h-4 w-28 rounded" />
      </div>
    </div>
  );
}
