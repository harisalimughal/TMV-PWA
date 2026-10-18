import { cx } from "../cx";

export interface MeterProps {
  /** 0–1. */
  value: number;
  label: string;
  tone?: "brand" | "success" | "warning" | "danger";
  className?: string;
}

const FILL = {
  brand: ["bg-viz-1", "bg-viz-1/15"],
  success: ["bg-success-signal", "bg-success-signal/15"],
  warning: ["bg-warning-signal", "bg-warning-signal/15"],
  danger: ["bg-danger-signal", "bg-danger-signal/15"]
} as const;

/** A ratio against a limit. The track is a lighter step of the fill so state reads across the bar. */
export function Meter({ value, label, tone = "brand", className }: MeterProps) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  const [fill, track] = FILL[tone];
  return (
    <div
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-label={label}
      className={cx("h-2 w-full overflow-hidden rounded-full", track, className)}
    >
      <div className={cx("h-full rounded-full transition-[width] duration-slow ease-out", fill)} style={{ width: `${pct}%` }} />
    </div>
  );
}
