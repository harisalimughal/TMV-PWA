import { cx } from "./cx";

export interface ProgressBarProps {
  /** 0–1. */
  value: number;
  "aria-label"?: string;
  className?: string;
}

/** Determinate progress (e.g. an upload). For indeterminate activity use <Spinner>. */
export function ProgressBar({ value, className, ...aria }: ProgressBarProps) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-label={aria["aria-label"]}
      className={cx("h-1.5 w-full overflow-hidden rounded-pill bg-line", className)}
    >
      <div
        className="h-full rounded-pill bg-brand transition-[width] duration-fast ease-out"
        style={{ width: `${Math.max(4, pct)}%` }}
      />
    </div>
  );
}
