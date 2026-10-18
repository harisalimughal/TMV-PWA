import React from "react";
import { cx } from "./cx";

export type BadgeTone = "neutral" | "brand" | "success" | "warning" | "danger" | "info";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  /** Small leading status dot. */
  dot?: boolean;
}

const TONES: Record<BadgeTone, string> = {
  neutral: "bg-neutral-subtle text-fg-muted",
  brand: "bg-brand-subtle text-brand-subtle-fg",
  success: "bg-success-subtle text-success",
  warning: "bg-warning-subtle text-warning",
  danger: "bg-danger-subtle text-danger",
  info: "bg-info-subtle text-info"
};

const DOT: Record<BadgeTone, string> = {
  neutral: "bg-fg-subtle",
  brand: "bg-brand",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info"
};

/** Compact status label. Deliberately small — not an oversized pill. */
export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
  { tone = "neutral", dot = false, className, children, ...rest },
  ref
) {
  return (
    <span
      ref={ref}
      className={cx(
        "inline-flex items-center gap-1.5 rounded-[6px] px-1.5 h-[22px]",
        "text-[11px] font-semibold leading-none tracking-[0.01em] whitespace-nowrap",
        TONES[tone],
        className
      )}
      {...rest}
    >
      {dot && <span className={cx("size-1.5 rounded-pill shrink-0", DOT[tone])} aria-hidden="true" />}
      {children}
    </span>
  );
});
