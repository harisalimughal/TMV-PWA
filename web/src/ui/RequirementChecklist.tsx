import React from "react";
import { Check, Circle } from "lucide-react";
import { cx } from "./cx";

export interface RequirementItem {
  id: string;
  /** Shown while the requirement is unmet, e.g. "Add 1 arrival photo". */
  label: string;
  /** Shown once met, e.g. "Arrival photo added". Falls back to `label`. */
  doneLabel?: string;
  done: boolean;
}

export interface RequirementChecklistProps {
  items: RequirementItem[];
  /** Heading above the list. */
  title?: React.ReactNode;
  /** Line shown in place of the list once every item is satisfied. */
  completeLabel?: string;
  className?: string;
}

/**
 * "Before you can submit" — a live checklist that turns a blocked submit button
 * from a dead end into a to-do list. Pending items read neutral with a hollow
 * ring; satisfied items go green with a tick. Status is carried by both the icon
 * shape and the colour, never colour alone, and the list announces its own
 * changes for assistive tech.
 */
export function RequirementChecklist({
  items,
  title = "Before you can submit",
  completeLabel = "Everything's ready — you can submit.",
  className
}: RequirementChecklistProps) {
  const allDone = items.length > 0 && items.every(i => i.done);

  if (allDone) {
    return (
      <div
        className={cx(
          "flex items-center gap-2.5 rounded-card border border-success-line bg-success-subtle px-4 py-3",
          className
        )}
        role="status"
      >
        <span className="grid size-5 shrink-0 place-items-center rounded-pill bg-success-signal text-surface">
          <Check className="size-3.5 stroke-[3]" aria-hidden />
        </span>
        <p className="text-[13px] font-semibold text-success">{completeLabel}</p>
      </div>
    );
  }

  return (
    <div className={cx("rounded-card border border-line bg-surface px-4 py-3.5", className)}>
      <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">{title}</p>
      <ul className="flex flex-col gap-2" aria-live="polite">
        {items.map(item => (
          <li key={item.id} className="flex items-center gap-2.5 text-[13.5px]">
            {item.done ? (
              <span className="grid size-[18px] shrink-0 place-items-center rounded-pill bg-success-signal text-surface">
                <Check className="size-3 stroke-[3]" aria-hidden />
              </span>
            ) : (
              <Circle className="size-[18px] shrink-0 text-fg-subtle" aria-hidden />
            )}
            <span className={item.done ? "font-medium text-fg" : "text-fg-muted"}>
              {item.done ? item.doneLabel ?? item.label : item.label}
            </span>
            <span className="sr-only">{item.done ? " — done" : " — still needed"}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
