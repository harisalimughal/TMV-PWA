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
        "flex flex-col items-center text-center px-6 py-12 rounded-[20px] border border-dashed border-line-strong",
        className
      )}
    >
      {icon && (
        <div className="relative mb-4 grid size-16 place-items-center">
          <span className="absolute inset-0 rounded-full bg-brand-subtle" aria-hidden />
          <span className="absolute inset-[6px] rounded-full bg-brand/10" aria-hidden />
          <span className="relative text-brand [&_svg]:size-7 [&_svg]:stroke-[1.75]">{icon}</span>
        </div>
      )}
      <p className="text-[16px] font-bold text-fg">{title}</p>
      {description && (
        <p className="mt-1.5 max-w-[40ch] text-body text-fg-muted">{description}</p>
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
