import React, { useId, useRef, useState } from "react";
import { cx } from "./cx";

export interface TooltipProps {
  label: React.ReactNode;
  /** Must be a single focusable element. */
  children: React.ReactElement;
  side?: "top" | "bottom";
  className?: string;
}

const OPEN_DELAY = 300;

/**
 * Hover/focus tooltip for genuinely ambiguous icon-only controls. Never the sole
 * carrier of meaning — the trigger still needs an accessible name.
 */
export function Tooltip({ label, children, side = "top", className }: TooltipProps) {
  const [open, setOpen] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const id = useId();

  const show = () => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(true), OPEN_DELAY);
  };
  const hide = () => {
    window.clearTimeout(timer.current);
    setOpen(false);
  };

  const trigger = React.cloneElement(children, {
    "aria-describedby": open ? id : undefined,
    onMouseEnter: show,
    onMouseLeave: hide,
    onFocus: show,
    onBlur: hide
  });

  return (
    <span className="relative inline-flex">
      {trigger}
      {open && (
        <span
          role="tooltip"
          id={id}
          className={cx(
            "pointer-events-none absolute left-1/2 z-50 -translate-x-1/2 whitespace-nowrap",
            "rounded-[6px] bg-fg px-2 py-1 text-[12px] font-medium text-bg shadow-md",
            "animate-in fade-in",
            side === "top" ? "bottom-full mb-1.5" : "top-full mt-1.5",
            className
          )}
        >
          {label}
        </span>
      )}
    </span>
  );
}
