import React from "react";
import { cx } from "../../ui";

export interface ScheduleSectionProps {
  title: string;
  /** Right-aligned count / note, e.g. "3 JOBS". */
  meta?: React.ReactNode;
  /** Amber accent for "NEEDS FINISHING". */
  tone?: "default" | "attention";
  children: React.ReactNode;
  className?: string;
}

/**
 * A block of the schedule. An operational label, an optional count, a heavy rule
 * beneath — then rows. No card, no rounded container: the section IS the
 * structure.
 */
export function ScheduleSection({ title, meta, tone = "default", children, className }: ScheduleSectionProps) {
  return (
    <section className={className}>
      <div className="flex items-baseline justify-between gap-3 border-b border-line pb-2">
        <h2 className={cx("text-heading", tone === "attention" ? "text-warning" : "text-fg")}>
          {title}
        </h2>
        {meta != null && <span className="text-meta text-fg-subtle">{meta}</span>}
      </div>
      <div>{children}</div>
    </section>
  );
}
