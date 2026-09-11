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
 * Each row is its own white, shadowed card (see ScheduleRow) with a gap between --
 * there's no enclosing card or divider list here, the rows carry their own.
 */
export function ScheduleSection({ title, meta, tone = "default", children, className }: ScheduleSectionProps) {
  return (
    <section className={className}>
      <div className="flex items-baseline justify-between gap-3 px-1 pb-2.5 pt-1">
        <h2 className={cx("text-heading", tone === "attention" ? "text-warning" : "text-fg")}>{title}</h2>
        {meta != null && <span className="font-mono text-[12.5px] text-fg-subtle">{meta}</span>}
      </div>
      <div className="flex flex-col gap-2.5">{children}</div>
    </section>
  );
}
