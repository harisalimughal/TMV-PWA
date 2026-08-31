import React from "react";
import { cx } from "./cx";

export interface KeyValueRow {
  label: React.ReactNode;
  value: React.ReactNode;
  /** Right-align + tabular figures — for money, counts, dates, IDs. */
  numeric?: boolean;
}

export interface KeyValueProps {
  rows: KeyValueRow[];
  className?: string;
}

/** Aligned label → value rows for detail panels and summaries. */
export function KeyValue({ rows, className }: KeyValueProps) {
  return (
    <dl className={cx("divide-y divide-line", className)}>
      {rows.map((row, i) => (
        <div key={i} className="flex items-baseline justify-between gap-4 py-2.5">
          <dt className="text-[12px] font-medium text-fg-subtle">{row.label}</dt>
          <dd
            className={cx(
              "text-[14px] text-fg text-right min-w-0 truncate",
              row.numeric && "tabular-nums font-medium"
            )}
          >
            {row.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
