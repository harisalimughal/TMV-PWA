import React, { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cx } from "../../ui";
import { haptics } from "../../lib/haptics";
import { htmlToPlainText } from "../../lib/htmlText";
import { RawBookingText } from "./RawBookingText";

export interface JobDetailsToggleProps {
  /** The job's verbatim Calendar description (HTML). Renders nothing when absent --
   *  a standalone form with no job attached has nothing to show here. */
  rawDescription?: string;
  className?: string;
}

/**
 * Collapsed by default, shown right under the screen's main heading, on every
 * workflow step and every scenario form (Check In/Out, Parking Liability, Liability
 * Report) -- the driver only needs the full booking text (address, van size,
 * inventory, ...) occasionally, not as a permanent fixture competing with the
 * screen's own content. Expands to the same raw-text block shown on the Home card.
 */
export function JobDetailsToggle({ rawDescription, className }: JobDetailsToggleProps) {
  const [open, setOpen] = useState(false);
  if (!rawDescription) return null;
  const description = htmlToPlainText(rawDescription);
  if (!description) return null;

  return (
    <div className={cx("rounded-card border border-line bg-surface-sunken/40", className)}>
      <button
        type="button"
        onClick={() => {
          haptics.tap();
          setOpen(v => !v);
        }}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
      >
        <span className="text-card font-semibold text-fg">Job details</span>
        {open ? (
          <ChevronUp className="size-4 shrink-0 text-fg-subtle" aria-hidden />
        ) : (
          <ChevronDown className="size-4 shrink-0 text-fg-subtle" aria-hidden />
        )}
      </button>
      {open && (
        <div className="border-t border-line px-4 py-3">
          <RawBookingText text={description} />
        </div>
      )}
    </div>
  );
}
