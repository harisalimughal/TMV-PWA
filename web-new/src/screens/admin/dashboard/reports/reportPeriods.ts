/**
 * Report periods, as London calendar days. A range is two instants: the start of the
 * first London day and the end of the last, the same shape every dashboard date filter
 * uses (`DateRangePicker`), so the backend sees identical boundaries. Luxon does the
 * London conversion, so a range across a clock change keeps whole local days.
 */
import { DateTime } from "luxon";

export type ReportPeriod = "today" | "yesterday" | "thisWeek" | "lastWeek" | "7d" | "thisMonth" | "lastMonth" | "custom";

export const PERIOD_LABELS: Record<ReportPeriod, string> = {
  today: "Today", yesterday: "Yesterday", thisWeek: "This week", lastWeek: "Last week", "7d": "Last 7 days",
  thisMonth: "This month", lastMonth: "Last month", custom: "Custom range"
};

/** Longest range one report may cover; larger periods go through the server exports. */
export const MAX_REPORT_DAYS = 93;

const ZONE = "Europe/London";
const span = (first: DateTime, last: DateTime) => ({ from: first.startOf("day").toUTC().toISO()!, to: last.endOf("day").toUTC().toISO()! });

/** Weeks run Monday to Sunday (ISO weeks, as UK payroll weeks do). "Last 7 days" is
 *  today and the six days before it, matching the dashboard's existing "7 days" filter. */
export function periodRange(period: Exclude<ReportPeriod, "custom">, now: DateTime = DateTime.now()): { from: string; to: string } {
  const today = now.setZone(ZONE).startOf("day");
  switch (period) {
    case "today": return span(today, today);
    case "yesterday": return span(today.minus({ days: 1 }), today.minus({ days: 1 }));
    case "thisWeek": return span(today.startOf("week"), today.endOf("week"));
    case "lastWeek": { const start = today.startOf("week").minus({ weeks: 1 }); return span(start, start.endOf("week")); }
    case "7d": return span(today.minus({ days: 6 }), today);
    case "thisMonth": return span(today.startOf("month"), today.endOf("month"));
    case "lastMonth": { const start = today.startOf("month").minus({ months: 1 }); return span(start, start.endOf("month")); }
  }
}

/** Custom range from two date inputs (YYYY-MM-DD, London days). Returns an error message
 *  instead of a range when the dates cannot make a report. */
export function customRange(fromDate: string, toDate: string): { from: string; to: string } | { error: string } {
  const first = DateTime.fromISO(fromDate, { zone: ZONE }), last = DateTime.fromISO(toDate, { zone: ZONE });
  const hasFrom = !!fromDate && first.isValid, hasTo = !!toDate && last.isValid;
  if (!hasFrom && !hasTo) return { error: "Choose a start and an end date." };
  if (!hasFrom) return { error: "Choose a start date." };
  if (!hasTo) return { error: "Choose an end date." };
  if (last < first) return { error: "The end date is before the start date." };
  if (exceedsMaxDays(fromDate, toDate)) return { error: `The selected dates cover ${dayCount(fromDate, toDate)} days. Choose ${MAX_REPORT_DAYS} days or fewer, or use the Jobs CSV export for longer periods.` };
  return span(first, last);
}

/** Whole London days from `fromDate` to `toDate`, both included. */
export function dayCount(fromDate: string, toDate: string): number {
  return Math.round(DateTime.fromISO(toDate, { zone: ZONE }).diff(DateTime.fromISO(fromDate, { zone: ZONE }), "days").days) + 1;
}
export function exceedsMaxDays(fromDate: string, toDate: string): boolean {
  const first = DateTime.fromISO(fromDate, { zone: ZONE }), last = DateTime.fromISO(toDate, { zone: ZONE });
  return first.isValid && last.isValid && last >= first && dayCount(fromDate, toDate) > MAX_REPORT_DAYS;
}
/** The first date of the longest allowed period ending on `toDate`. */
export function latestAllowedStart(toDate: string): string {
  return DateTime.fromISO(toDate, { zone: ZONE }).minus({ days: MAX_REPORT_DAYS - 1 }).toISODate()!;
}

/** A London calendar day (YYYY-MM-DD) from a date or an instant. A bare date is already
 *  a London day and is kept as written; an instant is converted to London. "" if unusable. */
export function londonDay(value: string | undefined | null): string {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return DateTime.fromISO(value, { zone: ZONE }).isValid ? value : "";
  const parsed = DateTime.fromISO(value).setZone(ZONE);
  return parsed.isValid ? parsed.toISODate()! : "";
}

/** How the dialog starts from the caller's range. Both dates: used as given (a preset
 *  when it is exactly one). Neither: the documented default, Last week. Only one: the
 *  known boundary is kept and the other is left for the user, never replaced by Last week. */
export function prefillPeriod(initial?: { from?: string; to?: string }, now: DateTime = DateTime.now()): { period: ReportPeriod; from: string; to: string } {
  const from = londonDay(initial?.from), to = londonDay(initial?.to);
  if (!from && !to) return { period: "lastWeek", from: "", to: "" };
  if (from && to && initial?.from && initial?.to) {
    const presets = (Object.keys(PERIOD_LABELS) as ReportPeriod[]).filter((period): period is Exclude<ReportPeriod, "custom"> => period !== "custom");
    const match = presets.find(period => { const range = periodRange(period, now); return rangeDates(range).first === from && rangeDates(range).last === to; });
    if (match) return { period: match, from: "", to: "" };
  }
  return { period: "custom", from, to };
}

/** London calendar dates of a range, for labels and file names. */
export function rangeDates(range: { from: string; to: string }): { first: string; last: string } {
  return { first: londonDay(range.from), last: londonDay(range.to) };
}

export function rangeLabel(range: { from: string; to: string }): string {
  const { first, last } = rangeDates(range);
  const fmt = (iso: string) => DateTime.fromISO(iso, { zone: ZONE }).toFormat("d LLL yyyy");
  return first === last ? fmt(first) : `${fmt(first)} to ${fmt(last)}`;
}
