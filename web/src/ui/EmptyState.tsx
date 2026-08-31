import React from "react";
import { cx } from "./cx";

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: React.ReactNode;
  /** One or two sentences: what this is, why it's empty, what to do next. */
  description?: React.ReactNode;
  /** Primary call to action. */
  action?: React.ReactNode;
  /** Lower-priority link/action under the primary one. */
  secondaryAction?: React.ReactNode;
  className?: string;
}

/** Every empty list/table renders one of these — never a bare "No data". */
export function EmptyState({
  icon,
  title,
  description,
  action,
  secondaryAction,
  className
}: EmptyStateProps) {
  return (
    <div
      className={cx(
        "flex flex-col items-center text-center px-6 py-10 rounded-card border border-dashed border-line",
        className
      )}
    >
      {icon && (
        <div className="mb-3 flex size-11 items-center justify-center rounded-card bg-surface-sunken text-fg-subtle [&_svg]:size-5">
          {icon}
        </div>
      )}
      <p className="text-heading text-fg">{title}</p>
      {description && (
        <p className="mt-1 max-w-[40ch] text-body text-fg-muted">{description}</p>
      )}
      {(action || secondaryAction) && (
        <div className="mt-4 flex flex-col items-center gap-2">
          {action}
          {secondaryAction}
        </div>
      )}
    </div>
  );
}
