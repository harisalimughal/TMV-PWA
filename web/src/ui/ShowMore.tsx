import React, { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cx } from "./cx";

/**
 * Long lists stop at `limit` items and end with a "Show N more" row, instead of
 * growing the page (people scroll past them to reach the next section) or scrolling
 * inside a fixed box (which hides where the list ends). Expanded state is per list.
 */
export function useShowMore<T>(items: T[], limit: number) {
  const [open, setOpen] = useState(false);
  const hidden = Math.max(0, items.length - limit);
  return {
    visible: open || hidden === 0 ? items : items.slice(0, limit),
    hidden,
    open,
    toggle: () => setOpen(o => !o)
  };
}

interface ShowMoreButtonProps {
  hidden: number;
  open: boolean;
  onToggle: () => void;
  className?: string;
}

/** Renders nothing when every item already fits. */
export function ShowMoreButton({ hidden, open, onToggle, className }: ShowMoreButtonProps) {
  if (hidden === 0) return null;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className={cx(
        "flex min-h-[40px] w-full items-center justify-center gap-1.5 rounded-xl text-[13px] font-semibold text-fg-muted transition hover:bg-surface-sunken hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40",
        className
      )}
    >
      {open ? "Show fewer" : `Show ${hidden} more`}
      <ChevronDown className={cx("h-4 w-4 transition-transform", open && "rotate-180")} aria-hidden="true" />
    </button>
  );
}
