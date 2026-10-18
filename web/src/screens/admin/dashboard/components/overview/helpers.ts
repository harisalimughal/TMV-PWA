/**
 * Small shared helpers for the overview widgets: status colours, axis ticks, period
 * naming and comparison text. Kept free of React so the page and its widgets can
 * import them without a cycle.
 */
import { DateTime } from "luxon";
import { CHART, type Comparison } from "../ds";
import { change, type StatusKey } from "../../utils/overviewData";

/** Completed = turquoise, in progress = blue, scheduled = violet, cancelled = slate. */
export const STATUS_COLOR: Record<StatusKey, string> = { completed: CHART.teal, inProgress: CHART.blue, scheduled: CHART.violet, cancelled: CHART.slate };
export const STATUS_ORDER: StatusKey[] = ["completed", "inProgress", "scheduled", "cancelled"];

/** Round axis ticks (0, 500, 1,000 …) instead of whatever the data maximum divides into. */
export function niceTicks(max: number, count = 4): number[] {
  if (!(max > 0)) return [0];
  const raw = max / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map(m => m * magnitude).find(candidate => candidate >= raw) ?? raw;
  return Array.from({ length: Math.ceil(max / step) + 1 }, (_, index) => index * step);
}

export const compactGBP = (value: number) => `£${new Intl.NumberFormat("en-GB", { notation: "compact", maximumFractionDigits: 1 }).format(value)}`;

/** "previous 7 days" / "yesterday" -- the comparison period named in plain words. */
export function periodName(from: string, to: string): string {
  const days = Math.round(DateTime.fromISO(to).diff(DateTime.fromISO(from), "days").days);
  return days <= 1 ? "the previous day" : `the previous ${days} days`;
}

/** Comparison for a count; `goodWhenUp` only where more is clearly better. */
export function compareCounts(current: number, previous: number | null, period: string, goodWhenUp: boolean | null): Comparison | null {
  const diff = change(current, previous);
  if (!diff) return null;
  const direction = diff.delta > 0 ? "up" : diff.delta < 0 ? "down" : "flat";
  const meaning = goodWhenUp === null || direction === "flat" ? "neutral" : (direction === "up") === goodWhenUp ? "good" : "bad";
  const pct = diff.pct === null ? "" : ` (${diff.pct > 0 ? "+" : ""}${Math.round(diff.pct * 100)}%)`;
  return { direction, meaning, text: `${diff.delta > 0 ? "+" : ""}${diff.delta}${pct} vs ${period}` };
}

export const percent = (part: number, whole: number): number | null => (whole > 0 ? part / whole : null);
export const percentText = (fraction: number | null): string => (fraction === null ? "—" : `${Math.round(fraction * 100)}%`);

/** London wall-clock "HH:mm" for an ISO timestamp, or null. */
export function londonTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const at = DateTime.fromISO(iso).setZone("Europe/London");
  return at.isValid ? at.toFormat("HH:mm") : null;
}
