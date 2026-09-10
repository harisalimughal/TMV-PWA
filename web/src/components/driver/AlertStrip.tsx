import React from "react";
import { AlertTriangle } from "lucide-react";
import { cx } from "../../ui";
import { useCountUp } from "../../lib/useCountUp";

export interface AlertStripProps {
  /** Number of past jobs still needing paperwork / photos. */
  count: number;
  /** Optional — when given, the strip is a button that acts on the tap. Without it
   *  the strip is informational only. */
  onClick?: () => void;
  className?: string;
}

/**
 * The single most important operational fact on the Jobs screen: how many earlier
 * jobs are still unfinished. An amber strip.
 */
export function AlertStrip({ count, onClick, className }: AlertStripProps) {
  const rolled = useCountUp(count);

  const inner = (
    <>
      <span className="grid size-9 shrink-0 place-items-center rounded-[11px] bg-warning-signal text-brand-fg">
        <AlertTriangle className="size-[18px]" strokeWidth={2.2} aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14.5px] font-bold text-fg">
          <span className="font-mono tabular-nums">{rolled}</span> {count === 1 ? "job needs" : "jobs need"} finishing
        </span>
        <span className="block text-[12.5px] text-fg-muted">Paperwork or photos still outstanding</span>
      </span>
      <span className="font-mono text-[15px] font-semibold tabular-nums text-warning">{rolled}</span>
    </>
  );

  const base =
    "flex w-full items-center gap-3 rounded-card bg-warning-subtle py-3.5 pl-4 pr-3.5 text-left";

  if (!onClick) {
    return <div className={cx(base, className)}>{inner}</div>;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        base,
        "transition-transform duration-fast active:scale-[0.985]",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
        className
      )}
    >
      {inner}
    </button>
  );
}
