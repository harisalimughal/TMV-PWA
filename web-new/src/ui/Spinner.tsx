import { cx } from "./cx";

const SIZES = { sm: "h-3.5 w-3.5", md: "h-4 w-4", lg: "h-5 w-5" } as const;

export interface SpinnerProps {
  size?: keyof typeof SIZES;
  className?: string;
  /** Accessible label when the spinner stands alone (not inside a button). */
  label?: string;
}

/** Indeterminate activity indicator. Inherits `currentColor`. */
export function Spinner({ size = "md", className, label }: SpinnerProps) {
  return (
    <svg
      className={cx("animate-spin shrink-0 text-current", SIZES[size], className)}
      viewBox="0 0 24 24"
      fill="none"
      role={label ? "status" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
