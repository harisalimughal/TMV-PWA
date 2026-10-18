/**
 * One vocabulary for numbers, dates and missing values across the dashboard.
 *
 * The audit's content rules (p.25) in code form: a missing value is never rendered
 * as zero, durations are rounded to whole minutes ("3h 44m", never "3h 43.88m"),
 * delays say what they mean in words ("3 min early"), and every date/time is London
 * time with a day-month-year date ("13 Oct 2026, 14:05").
 */
import { DateTime } from "luxon";

export const LONDON = "Europe/London";

/** What a missing value is called. Pick the one that says *why* it is missing ("Not recorded", "Not submitted", "Not calculated"...). */
export type MissingLabel = string;

const GBP = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });

/** Pence -> "£1,234.50". `null`/`undefined`/non-finite is missing, never £0.00. */
export function formatMoney(pence: number | null | undefined, missing: MissingLabel = "Not recorded"): string {
  return typeof pence === "number" && Number.isFinite(pence) ? GBP.format(pence / 100) : missing;
}

/** Pounds (the summary APIs' unit) -> "£1,234.50". */
export function formatPounds(pounds: number | null | undefined, missing: MissingLabel = "Not recorded"): string {
  return typeof pounds === "number" && Number.isFinite(pounds) ? GBP.format(pounds) : missing;
}

/**
 * Minutes -> "3h 44m" / "45 min" / "0 min". Always whole minutes, rounded once from
 * the raw value so the hour carries correctly (59.6 -> "1h 0m", never "60 min").
 */
export function formatMinutes(minutes: number | null | undefined, missing: MissingLabel = "Not recorded"): string {
  if (typeof minutes !== "number" || !Number.isFinite(minutes)) return missing;
  const sign = minutes < 0 ? "-" : "";
  const total = Math.round(Math.abs(minutes));
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  if (hours === 0) return `${sign}${mins} min`;
  return `${sign}${hours}h ${mins}m`;
}

/**
 * Signed arrival delay in words: "3 min early", "On time", "1h 5m late". Negative =
 * early. Callers decide separately whether the delay's source is trustworthy enough
 * to show at all -- an unverified arrival is "Unverified", never "On time".
 */
export function formatDelay(minutes: number | null | undefined, missing: MissingLabel = "Not recorded"): string {
  if (typeof minutes !== "number" || !Number.isFinite(minutes)) return missing;
  const rounded = Math.round(minutes);
  if (rounded === 0) return "On time";
  const amount = formatMinutes(Math.abs(rounded));
  return rounded < 0 ? `${amount} early` : `${amount} late`;
}

function toLondon(iso: string | null | undefined): DateTime | null {
  if (!iso) return null;
  let at = DateTime.fromISO(iso, { zone: "utc" });
  if (!at.isValid) at = DateTime.fromSQL(iso, { zone: "utc" });
  if (!at.isValid) {
    const parsed = new Date(iso);
    if (Number.isNaN(parsed.getTime())) return null;
    at = DateTime.fromJSDate(parsed);
  }
  return at.setZone(LONDON);
}

/** "13 Oct 2026" */
export function formatDate(iso: string | null | undefined, missing: MissingLabel = "Not recorded"): string {
  return toLondon(iso)?.toFormat("d LLL yyyy") ?? missing;
}

/** "13 Oct 2026, 14:05" */
export function formatDateTime(iso: string | null | undefined, missing: MissingLabel = "Not recorded"): string {
  return toLondon(iso)?.toFormat("d LLL yyyy, HH:mm") ?? missing;
}

/** "14:05" */
export function formatTime(iso: string | null | undefined, missing: MissingLabel = "Not recorded"): string {
  return toLondon(iso)?.toFormat("HH:mm") ?? missing;
}

/** "Mon 13 Oct, 14:05" -- compact form for dense lists where the year is implied. */
export function formatShortDateTime(iso: string | null | undefined, missing: MissingLabel = "Not recorded"): string {
  return toLondon(iso)?.toFormat("ccc d LLL, HH:mm") ?? missing;
}

/** A calendar date stored as "YYYY-MM-DD" (no time, no zone) -> "13 Oct 2026". */
export function formatCalendarDate(value: string | null | undefined, missing: MissingLabel = "Not recorded"): string {
  const match = value ? /^(\d{4})-(\d{2})-(\d{2})/.exec(value) : null;
  if (!match) return missing;
  return DateTime.fromObject({ year: +match[1], month: +match[2], day: +match[3] }).toFormat("d LLL yyyy");
}

/**
 * Human label for a [from, to] range as London calendar days:
 * "13 Oct 2026", "7–13 Oct 2026", "28 Sep – 4 Oct 2026", "All dates".
 */
export function formatRange(from: string | null | undefined, to: string | null | undefined): string {
  const start = toLondon(from), end = toLondon(to);
  if (!start && !end) return "All dates";
  if (!start) return `Up to ${end!.toFormat("d LLL yyyy")}`;
  if (!end) return `From ${start.toFormat("d LLL yyyy")}`;
  if (start.hasSame(end, "day")) return start.toFormat("d LLL yyyy");
  if (start.hasSame(end, "month")) return `${start.toFormat("d")}–${end.toFormat("d LLL yyyy")}`;
  if (start.hasSame(end, "year")) return `${start.toFormat("d LLL")} – ${end.toFormat("d LLL yyyy")}`;
  return `${start.toFormat("d LLL yyyy")} – ${end.toFormat("d LLL yyyy")}`;
}

/** "just now" / "3 min ago" / "2h ago" / "4 days ago" from an instant. */
export function formatAge(iso: string | null | undefined, now: DateTime = DateTime.utc(), missing: MissingLabel = "Unknown"): string {
  const at = toLondon(iso);
  if (!at) return missing;
  const minutes = now.diff(at, "minutes").minutes;
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${Math.floor(minutes)} min ago`;
  const hours = minutes / 60;
  if (hours < 24) return `${Math.floor(hours)}h ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

/** "1 job" / "3 jobs" */
export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

/**
 * A total built from some known and some unknown parts. The UI must never present a
 * partial sum as the whole: callers render `label` (e.g. "Known subtotal") whenever
 * `complete` is false, plus the coverage line.
 */
export interface Subtotal {
  pence: number;
  knownCount: number;
  totalCount: number;
  complete: boolean;
}

export function knownSubtotal(values: Array<number | null | undefined>): Subtotal {
  let pence = 0, knownCount = 0;
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      pence += value;
      knownCount++;
    }
  }
  return { pence, knownCount, totalCount: values.length, complete: knownCount === values.length };
}

/** "12 of 14 jobs" */
export function coverageLabel(known: number, total: number, noun = "job"): string {
  return `${known} of ${plural(total, noun)}`;
}
