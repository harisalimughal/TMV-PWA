import React from "react";
import { cx } from "../../ui";

export interface AnimatedSuccessTickProps {
  className?: string;
}

/**
 * The big "you're done" moment: a 96px circle that springs in, an expanding ring
 * fading out behind it, and a checkmark that draws itself on. Shared by every
 * completion screen (a submitted issue report, a finished job) so they all read as
 * the same milestone. Honors `prefers-reduced-motion`. Purely decorative — callers
 * still own the heading/copy around it.
 */
export function AnimatedSuccessTick({ className }: AnimatedSuccessTickProps) {
  return (
    <div className={cx("relative grid place-items-center", className)}>
      <span className="successTickRing absolute size-24 rounded-full bg-success-subtle" aria-hidden />
      <span className="successTickPop relative grid size-24 place-items-center rounded-full border-4 border-success-line bg-success-subtle text-success-signal">
        <svg
          viewBox="0 0 24 24"
          className="size-12"
          fill="none"
          stroke="currentColor"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path className="successTickCheck" d="M4 12.5l5 5 11-11" />
        </svg>
      </span>

      <style>{`
        .successTickPop { animation: successTickPop 520ms cubic-bezier(0.22, 1.2, 0.36, 1) both; }
        .successTickRing { animation: successTickRing 900ms ease-out forwards; }
        .successTickCheck { stroke-dasharray: 30; stroke-dashoffset: 30; animation: successTickCheck 460ms 250ms ease-out forwards; }
        @keyframes successTickPop { 0% { transform: scale(0.5); opacity: 0; } 60% { transform: scale(1.08); } 100% { transform: scale(1); opacity: 1; } }
        @keyframes successTickRing { 0% { transform: scale(0.6); opacity: 0.55; } 100% { transform: scale(1.9); opacity: 0; } }
        @keyframes successTickCheck { to { stroke-dashoffset: 0; } }
        @media (prefers-reduced-motion: reduce) {
          .successTickPop, .successTickRing, .successTickCheck { animation: none; }
          .successTickCheck { stroke-dashoffset: 0; }
          .successTickRing { display: none; }
        }
      `}</style>
    </div>
  );
}
