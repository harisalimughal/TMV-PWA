import React from "react";
import { ArrowRight } from "lucide-react";
import { cx } from "../../ui";
import { haptics } from "../../lib/haptics";
import type { Job } from "../../api/jobs";
import { JobRoute } from "./JobRoute";
import { JobTime } from "./JobTime";
import { StatusIndicator } from "./JobStatusChip";

function gbp(v: number): string {
  return `£${(v ?? 0).toFixed(0)}`;
}

export interface FeaturedJobCardProps {
  job: Job;
  onOpen: () => void;
}

/**
 * The next / active job — a white panel with a thin accent edge and a labelled
 * header strip. Emphasis comes from placement and the accent rule, not colour or
 * a dark fill.
 */
export function FeaturedJobCard({ job, onOpen }: FeaturedJobCardProps) {
  const inProgress = job.status === "IN_PROGRESS";
  return (
    <button
      type="button"
      onClick={() => {
        haptics.tap();
        onOpen();
      }}
      className={cx(
        "block w-full overflow-hidden rounded-lg border border-line border-l-2 border-l-brand bg-surface text-left shadow-xs",
        "transition-colors duration-fast hover:bg-surface-sunken/40",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      )}
    >
      <div className="flex items-center justify-between gap-3 border-b border-line bg-surface-sunken/60 px-4 py-2">
        <span className="text-eyebrow uppercase text-fg-subtle">Next job</span>
        {inProgress && <StatusIndicator job={job} />}
      </div>

      <div className="flex items-start justify-between gap-3 px-4 pt-3.5">
        <JobTime iso={job.bookedStart} variant="display" />
        <span className="pt-1 text-right text-meta text-fg-subtle">
          {job.crewSize || "?"} crew{job.basePrice > 0 && ` · ${gbp(job.basePrice)}`}
        </span>
      </div>

      <h2 className="mt-2 px-4 text-heading text-fg">
        {job.customerName || "Unnamed customer"}
      </h2>

      <div className="mt-3.5 border-t border-line px-4 py-3.5">
        <JobRoute pickup={job.pickup} dropoff={job.dropoff} density="full" />
      </div>

      <div className="flex items-center justify-between border-t border-line px-4 py-3 text-label font-semibold text-brand">
        Open job
        <ArrowRight className="size-4" aria-hidden />
      </div>
    </button>
  );
}
