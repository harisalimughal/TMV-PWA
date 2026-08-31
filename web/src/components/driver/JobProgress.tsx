import React from "react";
import { cx } from "../../ui";

export interface JobProgressProps {
  /** 1-based position on the happy path. */
  current: number;
  total?: number;
  className?: string;
}

/**
 * Workflow progress: "Step 2 of 13" over a slim two-tone bar.
 */
export function JobProgress({ current, total = 13, className }: JobProgressProps) {
  const clamped = Math.min(Math.max(current, 1), total);
  const pct = (clamped / total) * 100;
  return (
    <div
      className={cx("flex flex-col gap-1.5", className)}
      role="progressbar"
      aria-valuemin={1}
      aria-valuemax={total}
      aria-valuenow={clamped}
      aria-label={`Step ${clamped} of ${total}`}
    >
      <span className="text-meta text-fg-muted">Step {clamped} of {total}</span>
      <div className="h-1 w-full overflow-hidden rounded-full bg-line-strong">
        <div className="h-full rounded-full bg-brand transition-[width] duration-fast" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
