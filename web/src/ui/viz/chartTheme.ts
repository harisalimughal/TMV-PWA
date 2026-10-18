/**
 * Shared Recharts styling so every chart reads as one system: hairline solid grid
 * (horizontal only), muted tabular ticks, thin marks. Colours are CSS tokens, so
 * charts follow the theme without per-chart hex.
 */
export const vizColor = {
  1: "rgb(var(--viz-1))",
  2: "rgb(var(--viz-2))",
  3: "rgb(var(--viz-3))",
  4: "rgb(var(--viz-4))",
  5: "rgb(var(--viz-5))",
  grid: "rgb(var(--viz-grid))",
  axis: "rgb(var(--viz-axis))",
  ink: "rgb(var(--fg))",
  muted: "rgb(var(--fg-subtle))",
  surface: "rgb(var(--surface))",
  success: "rgb(var(--success-signal))",
  warning: "rgb(var(--warning-signal))",
  danger: "rgb(var(--danger-signal))"
} as const;

const tick = { fontSize: 12, fill: vizColor.muted, fontVariantNumeric: "tabular-nums" } as const;

export const gridProps = { vertical: false, stroke: vizColor.grid, strokeWidth: 1 } as const;
export const xAxisProps = { tick, axisLine: { stroke: vizColor.axis }, tickLine: false, tickMargin: 8 } as const;
export const yAxisProps = { tick, axisLine: false, tickLine: false, tickMargin: 6, width: 52 } as const;
/** Bars: thin, 4px rounded data-end, square at the baseline. */
export const BAR_SIZE = 22;
export const barRadiusV: [number, number, number, number] = [4, 4, 0, 0];
export const barRadiusH: [number, number, number, number] = [0, 4, 4, 0];
export const lineProps = { strokeWidth: 2, strokeLinejoin: "round", strokeLinecap: "round", isAnimationActive: false } as const;
export const cursorLine = { stroke: vizColor.axis, strokeWidth: 1 } as const;

/** £1,240 → "£1.2K"; under 1,000 stays exact. */
export function compactGbp(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `£${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (abs >= 1_000) return `£${(value / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return `£${Math.round(value)}`;
}

export function gbp(value: number): string {
  return `£${value.toLocaleString("en-GB", { maximumFractionDigits: 0 })}`;
}
