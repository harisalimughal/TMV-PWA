/** Ported verbatim from TMV-Chat-bot's dashboard/server/normalize/timezone.ts. */
import { DateTime } from "luxon";
import { DelayBand } from "./types";
import { env } from "../../config/env";

export const LONDON_TIMEZONE = env.timezone || "Europe/London";

/**
 * Checks whether an ISO timestamp has a London-compatible offset (+00:00, +01:00, or Z).
 * An offset like +05:00 corrupts timing and must be flagged untrustworthy.
 */
export function isTimingTrustworthy(isoString?: string): boolean {
  if (!isoString) return true;
  const match = isoString.match(/(Z|[+-]\d{2}:\d{2})$/i);
  if (!match) return true;
  const offset = match[1].toUpperCase();
  if (offset === "Z" || offset === "+00:00" || offset === "+01:00") return true;
  return false;
}

/** Normalizes any date/time string to ISO UTC format. */
export function toUtcIso(dateStr?: string): string {
  if (!dateStr) return "";
  const dt = DateTime.fromISO(dateStr, { zone: LONDON_TIMEZONE });
  if (!dt.isValid) {
    const jsDate = new Date(dateStr);
    if (!isNaN(jsDate.getTime())) {
      return jsDate.toISOString();
    }
    return dateStr;
  }
  return dt.toUTC().toISO() || dateStr;
}

/** Formats an ISO UTC date string into London local time for display. */
export function formatLondonDate(isoString?: string, formatStr = "dd LLL yyyy, HH:mm"): string {
  if (!isoString) return "—";
  const dt = DateTime.fromISO(isoString).setZone(LONDON_TIMEZONE);
  if (!dt.isValid) return isoString;
  return dt.toFormat(formatStr);
}

/** Calculates duration in minutes between two timestamps. */
export function calculateMinutes(startIso?: string, finishIso?: string): number {
  if (!startIso || !finishIso) return 0;
  const s = DateTime.fromISO(startIso);
  const f = DateTime.fromISO(finishIso);
  if (!s.isValid || !f.isValid) return 0;
  return Math.max(0, Math.round(f.diff(s, "minutes").minutes));
}

/** Calculates delay in minutes: actualStart - bookedStart. Positive = late. */
export function calculateDelayMinutes(bookedStartIso?: string, actualStartIso?: string): number {
  if (!bookedStartIso || !actualStartIso) return 0;
  const booked = DateTime.fromISO(bookedStartIso);
  const actual = DateTime.fromISO(actualStartIso);
  if (!booked.isValid || !actual.isValid) return 0;
  return Math.round(actual.diff(booked, "minutes").minutes);
}

/** Categorizes delay minutes into a discrete status band. */
export function getDelayBand(delayMinutes: number): DelayBand {
  if (delayMinutes < 0) return "EARLY";
  if (delayMinutes === 0) return "ON_TIME";
  if (delayMinutes <= 15) return "LATE_5_15";
  if (delayMinutes <= 30) return "LATE_15_30";
  return "LATE_OVER_30";
}
