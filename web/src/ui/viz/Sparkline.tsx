import { cx } from "../cx";

export interface SparklineProps {
  values: number[];
  /** Accessible summary, e.g. "Revenue over the last 7 days". */
  label: string;
  className?: string;
  height?: number;
}

/** Tiny trend line: muted line, accent end dot. Not interactive; the card carries the number. */
export function Sparkline({ values, label, className, height = 36 }: SparklineProps) {
  if (values.length < 2) return null;
  const w = 120;
  const pad = 5;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => [
    (i / (values.length - 1)) * w,
    pad + (1 - (v - min) / span) * (height - pad * 2)
  ]);
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${d} L${w},${height} L0,${height} Z`;
  const endY = pts[pts.length - 1][1];
  return (
    <div role="img" aria-label={label} className={cx("relative w-full", className)} style={{ height }}>
      {/* Stretched to the card width; the end dot is HTML so it stays round. */}
      <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden>
        <path d={area} fill="rgb(var(--viz-1) / 0.08)" />
        <path d={d} fill="none" stroke="rgb(var(--viz-1) / 0.55)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <span
        aria-hidden
        className="absolute right-0 h-2.5 w-2.5 -translate-y-1/2 translate-x-1/2 rounded-full bg-viz-1 ring-2 ring-surface"
        style={{ top: endY }}
      />
    </div>
  );
}
