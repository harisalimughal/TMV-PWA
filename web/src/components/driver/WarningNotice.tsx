import React from "react";
import { cx } from "../../ui";

export interface WarningNoticeProps {
  /** Short eyebrow, e.g. "Check the date". */
  title?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

/**
 * The one operational warning — a thick amber left rule and a tinted ground, not
 * a rounded badge-card. Emphasise a key value inside with <strong>.
 */
export function WarningNotice({ title, children, className }: WarningNoticeProps) {
  return (
    <div
      role="status"
      className={cx(
        "rounded-lg border border-warning-line bg-warning-subtle px-4 py-3 border-l-[3px] border-l-warning-signal",
        className
      )}
    >
      {title && <p className="mb-0.5 text-label text-warning">{title}</p>}
      <p className="text-body text-fg [&_strong]:font-semibold [&_strong]:text-fg">{children}</p>
    </div>
  );
}
