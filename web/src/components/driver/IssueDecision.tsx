import React from "react";
import { AlertTriangle, Check } from "lucide-react";
import { cx } from "../../ui";
import { haptics } from "../../lib/haptics";

export interface IssueDecisionProps {
  onNone: () => void;
  onYes: () => void;
  busy?: boolean;
  noneLabel?: string;
  yesLabel?: string;
}

/**
 * The "any issues?" answer as two distinct system choices — never lookalikes.
 * NO ISSUES reads green with a heavy left rule; REPORT IT reads amber. Same
 * weight and size so the layout doesn't push toward a report that isn't needed.
 */
export function IssueDecision({
  onNone,
  onYes,
  busy = false,
  noneLabel = "No issues",
  yesLabel = "Report an issue"
}: IssueDecisionProps) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          haptics.tap();
          onNone();
        }}
        className={cx(
          "flex min-h-control-lg items-center justify-center gap-2 rounded-lg border px-3",
          "border-success-line bg-success-subtle text-button text-success",
          "transition duration-fast active:scale-[0.98] motion-reduce:active:scale-100 disabled:opacity-50",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-success"
        )}
      >
        <Check className="size-[17px] shrink-0 stroke-[2.75]" aria-hidden />
        {noneLabel}
      </button>

      <button
        type="button"
        disabled={busy}
        onClick={() => {
          haptics.warn();
          onYes();
        }}
        className={cx(
          "flex min-h-control-lg items-center justify-center gap-2 rounded-lg border px-3",
          "border-warning-line bg-warning-subtle text-button text-warning",
          "transition duration-fast active:scale-[0.98] motion-reduce:active:scale-100 disabled:opacity-50",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-warning"
        )}
      >
        <AlertTriangle className="size-[17px] shrink-0" aria-hidden />
        {yesLabel}
      </button>
    </div>
  );
}
