import React from "react";
import { cx } from "./cx";

export interface BottomActionBarProps {
  /** The primary action, or a small cluster of actions. */
  children: React.ReactNode;
  /**
   * One short line shown above the actions — e.g. "2 things still needed". Kept
   * quiet: it explains, it doesn't scold.
   */
  note?: React.ReactNode;
  noteTone?: "muted" | "warning" | "success";
  className?: string;
}

const NOTE_TONE = {
  muted: "text-fg-muted",
  warning: "text-warning",
  success: "text-success"
} as const;

/**
 * The single sticky bottom action bar for every flow screen.
 *
 * Consolidates the two that existed before — one hard-coded `bg-white` (which broke
 * in dark mode), one token-based. This is the only one now. It sits above the
 * home-indicator safe area, carries a hairline top divider plus a soft upward
 * shadow so content scrolling under it stays legible, and never covers content:
 * the scroll area pairs it with a `.scroll-pb-dock` spacer.
 */
export function BottomActionBar({ children, note, noteTone = "muted", className }: BottomActionBarProps) {
  return (
    <div
      className={cx(
        "shrink-0 border-t border-line bg-surface/95 px-4 pt-3 shadow-dock backdrop-blur",
        "pb-[calc(env(safe-area-inset-bottom)+12px)]",
        className
      )}
    >
      {note != null && (
        <p className={cx("mb-2 text-center text-meta", NOTE_TONE[noteTone])}>
          {note}
        </p>
      )}
      {children}
    </div>
  );
}
