import React from "react";
import { cx } from "../cx";

export interface SplitSegment {
  key: string;
  label: string;
  value: number;
  /** Any CSS colour; use viz or status tokens, e.g. "rgb(var(--viz-1))". */
  color: string;
  /** Shown in the legend instead of the raw value (e.g. "£420"). */
  display?: string;
}

export interface SplitBarProps {
  segments: SplitSegment[];
  /** Accessible name for the whole bar. */
  label: string;
  /** Hide zero-value segments from the legend too. */
  hideEmpty?: boolean;
  legend?: boolean;
  size?: "sm" | "md";
  className?: string;
  onSegmentClick?: (key: string) => void;
}

/**
 * Part-to-whole in one horizontal bar: segments separated by a 2px surface gap,
 * a legend row underneath so identity is never colour-alone, and a native title
 * per segment for hover/focus.
 */
export function SplitBar({ segments, label, hideEmpty = true, legend = true, size = "md", className, onSegmentClick }: SplitBarProps) {
  const shown = hideEmpty ? segments.filter(s => s.value > 0) : segments;
  const total = shown.reduce((sum, s) => sum + s.value, 0);
  const summary = shown.map(s => `${s.label} ${s.display ?? s.value}`).join(", ");
  return (
    <div className={cx("min-w-0", className)}>
      <div
        role="img"
        aria-label={`${label}: ${summary || "none"}`}
        className={cx("flex w-full gap-[2px] overflow-hidden rounded-full", size === "sm" ? "h-1.5" : "h-2.5", total === 0 && "bg-surface-sunken")}
      >
        {total > 0 && shown.map(s => {
          const pct = (s.value / total) * 100;
          const common = {
            title: `${s.label}: ${s.display ?? s.value} (${Math.round(pct)}%)`,
            style: { width: `${pct}%`, background: s.color, minWidth: s.value > 0 ? 4 : 0 }
          };
          return onSegmentClick ? (
            <button key={s.key} type="button" {...common} onClick={() => onSegmentClick(s.key)} className="h-full transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40" aria-label={common.title} />
          ) : (
            <span key={s.key} {...common} className="h-full" />
          );
        })}
      </div>
      {legend && shown.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
          {shown.map(s => (
            <li key={s.key} className="flex items-center gap-1.5 text-[12px] text-fg-muted">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: s.color }} aria-hidden />
              <span>{s.label}</span>
              <span className="font-semibold tabular-nums text-fg">{s.display ?? s.value}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
