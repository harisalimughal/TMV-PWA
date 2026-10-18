import React, { useEffect, useId, useRef, useState } from "react";
import { Info } from "lucide-react";
import { cx } from "./cx";

export interface InfoTipProps {
  /** The explanation. Keep it to a sentence or two. */
  children: React.ReactNode;
  /** Accessible name of the trigger, e.g. "About this page". */
  label?: string;
  align?: "start" | "end";
  className?: string;
}

/**
 * A small (i) for context people rarely need: what a page covers, why two numbers
 * differ, which date range applies. Opens on hover or focus (desktop) and on tap
 * (touch); Escape or a click elsewhere closes it. Never put anything here that a
 * person needs to finish a task.
 */
export function InfoTip({ children, label = "More information", align = "start", className }: InfoTipProps) {
  const [open, setOpen] = useState(false);
  const pinned = useRef(false);
  const root = useRef<HTMLSpanElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { pinned.current = false; setOpen(false); } };
    const onDown = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) { pinned.current = false; setOpen(false); }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("pointerdown", onDown); };
  }, [open]);

  return (
    <span
      ref={root}
      className={cx("relative inline-flex align-middle", className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => { if (!pinned.current) setOpen(false); }}
    >
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => { pinned.current = !pinned.current || !open; setOpen(pinned.current); }}
        onFocus={() => setOpen(true)}
        onBlur={() => { if (!pinned.current) setOpen(false); }}
        className="-m-1.5 inline-flex h-8 w-8 items-center justify-center rounded-full text-fg-subtle transition-colors hover:bg-surface-sunken hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
      >
        <Info className="h-[17px] w-[17px]" strokeWidth={2} aria-hidden="true" />
      </button>
      <span
        id={id}
        role="note"
        hidden={!open}
        className={cx(
          "absolute top-full z-50 mt-2 w-max max-w-[min(300px,calc(100vw-32px))] rounded-xl border border-line bg-surface px-3.5 py-2.5 text-left text-[13px] font-normal leading-[19px] tracking-normal text-fg-muted shadow-md",
          align === "end" ? "right-0" : "-left-2"
        )}
      >
        {children}
      </span>
    </span>
  );
}
