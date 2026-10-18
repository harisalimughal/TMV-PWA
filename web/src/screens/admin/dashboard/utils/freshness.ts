/**
 * Tracker signal freshness policy -- the one place the dashboard decides whether a
 * GPS position is current. Previously a hard-coded 30-minute constant inside
 * LiveFleetMap that also silently turned a van "Parked"; now freshness and motion
 * are separate facts and every screen reads this same rule.
 *
 * Threshold: the existing 30 minutes. A parked van's tracker sleeps and reports less
 * often, so an older position is normal for a parked van -- but it is still only the
 * *last known* position and cannot establish current motion or availability.
 */
import { DateTime } from "luxon";

export const TRACKER_STALE_AFTER_MINUTES = 30;

export type Freshness = "current" | "stale" | "unknown";

/** GPSLive timestamps arrive as SQL-style UTC ("2026-10-13 14:05:09"); ISO also accepted. */
export function parseTrackerTime(value: string | null | undefined): DateTime | null {
  if (!value) return null;
  let at = DateTime.fromSQL(value, { zone: "utc" });
  if (!at.isValid) at = DateTime.fromISO(value, { zone: "utc" });
  return at.isValid ? at : null;
}

export function signalAgeMinutes(value: string | null | undefined, now: DateTime = DateTime.utc()): number | null {
  const at = parseTrackerTime(value);
  return at ? Math.max(0, now.diff(at, "minutes").minutes) : null;
}

export function signalFreshness(value: string | null | undefined, now: DateTime = DateTime.utc()): Freshness {
  const age = signalAgeMinutes(value, now);
  if (age === null) return "unknown";
  return age > TRACKER_STALE_AFTER_MINUTES ? "stale" : "current";
}

/** Motion as last reported. Only "Moving"/"Stopped" when the signal is current;
 *  otherwise the label says it is the last known state. */
export function motionLabel(speedMph: number, freshness: Freshness): string {
  const moving = speedMph > 2;
  if (freshness === "current") return moving ? "Moving" : "Stopped";
  return moving ? "Last known: moving" : "Last known: stopped";
}
