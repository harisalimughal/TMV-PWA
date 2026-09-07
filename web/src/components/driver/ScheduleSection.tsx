import React from "react";
import { cx } from "../../ui";

export interface ScheduleSectionProps {
  title: string;
  /** Right-aligned count / note, e.g. "3 total". Set in the mono face. */
  meta?: React.ReactNode;
  /** Amber accent for "Needs finishing". */
  tone?: "default" | "attention";
  children: React.ReactNode;
  className?: string;
}

/**
 * A block of the schedule: a section label, an optional mono count, then rows.
 * The rows carry their own dividers, so there is no card or heavy rule here — the
 * section IS the structure.
 */
export function ScheduleSection({ title, meta, tone = "default", children, className }: ScheduleSectionProps) {
  return (
    <section className={className}>
      <div className="flex items-baseline justify-between gap-3 px-5 pb-2.5 pt-1">
        <h2 className={cx("text-heading", tone === "attention" ? "text-warning" : "text-fg")}>{title}</h2>
        {meta != null && <span className="font-mono text-[12.5px] text-fg-subtle">{meta}</span>}
      </div>
      <div>{children}</div>
    </section>
  );
}
