/**
 * Presentation helpers for the driver's job ticket (FeaturedJobCard / UpcomingJobCard).
 * Everything is London time, because bookings are, wherever the phone thinks it is.
 */
import type { Job } from "../api/jobs";
import { addDaysToKey, londonDateKey, todayKey } from "./jobDates";
import { scheduledDurationMinutes } from "./jobTime";

const LONDON = "Europe/London";

function validDate(iso: string | undefined | null): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "08:30", or null when the timestamp is missing/unparseable. */
export function londonTime(iso: string | undefined | null): string | null {
  const d = validDate(iso);
  return d ? d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: LONDON }) : null;
}

/** "08:30–11:30", "08:30" when there's no finish, "Time TBC" when there's no start. */
export function timeWindow(job: Pick<Job, "bookedStart" | "bookedFinish">): string {
  const start = londonTime(job.bookedStart);
  if (!start) return "Time TBC";
  const end = londonTime(job.bookedFinish);
  return end && end !== start ? `${start}–${end}` : start;
}

/** "Today", "Tomorrow", or "Wed 16 Oct" -- plus the date after "Today"/"Tomorrow"
 *  for clarity ("Today · Wed 14 Oct"). Empty string when there's no date. */
export function dayLabel(iso: string | undefined | null, now: Date = new Date()): string {
  const d = validDate(iso);
  if (!d) return "";
  const date = d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: LONDON });
  const key = londonDateKey(d);
  const today = todayKey(now);
  if (key === today) return `Today · ${date}`;
  if (key === addDaysToKey(today, 1)) return `Tomorrow · ${date}`;
  return date;
}

/** "3h", "1h 30m", "45m" -- null when the booking has no usable window. */
export function durationShort(job: Pick<Job, "bookedStart" | "bookedFinish" | "timeBilling">): string | null {
  const minutes = scheduledDurationMinutes(job);
  if (minutes === null || !Number.isFinite(minutes) || minutes <= 0) return null;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** "2 crew" / "1 person" -- null when unknown (0 or missing). */
export function crewLabel(crewSize: number | undefined | null): string | null {
  if (!crewSize || crewSize < 1) return null;
  return crewSize === 1 ? "1 person" : `${crewSize} crew`;
}

/** "£285" / "£285.50" -- null when there's no price. */
export function priceLabel(amount: number | undefined | null): string | null {
  if (!amount || !Number.isFinite(amount) || amount <= 0) return null;
  return Number.isInteger(amount) ? `£${amount}` : `£${amount.toFixed(2)}`;
}

const UK_POSTCODE = /\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/i;

/** The town/area of an address for a one-line route summary: "22 Bridge Road,
 *  St Albans AL1 3RX" -> "St Albans". Falls back to the postcode, then the first
 *  line, so it never returns an empty string for a non-empty address. */
export function townOf(address: string | undefined | null): string {
  const parts = (address ?? "").split(",").map(s => s.trim()).filter(Boolean);
  if (parts.length === 0) return "";
  for (let i = parts.length - 1; i >= 1; i--) {
    const withoutPostcode = parts[i].replace(UK_POSTCODE, "").trim();
    if (withoutPostcode && !/^(uk|united kingdom|england)$/i.test(withoutPostcode)) return withoutPostcode;
  }
  const postcode = (address ?? "").match(UK_POSTCODE)?.[0];
  return postcode ? postcode.toUpperCase() : parts[0];
}

/** "London → St Albans", or just one side when the other is missing. */
export function routeSummary(job: Pick<Job, "pickup" | "dropoff">): string {
  const from = townOf(job.pickup);
  const to = townOf(job.dropoff);
  if (from && to) return from === to ? `Within ${from}` : `${from} → ${to}`;
  return from || to || "Addresses TBC";
}

/** Whether a not-yet-started job is past its booked start by more than `graceMin`. */
export function isRunningLate(
  job: Pick<Job, "status" | "bookedStart">,
  now: Date = new Date(),
  graceMin = 15
): boolean {
  if (job.status !== "READY") return false;
  const start = validDate(job.bookedStart);
  return Boolean(start && now.getTime() - start.getTime() > graceMin * 60_000);
}

/** The free-text extra request, unless it's one of the "nothing needed" boilerplates
 *  the booking form fills in -- those are noise on a ticket. */
export function meaningfulRequest(text: string | undefined | null): string | null {
  const t = (text ?? "").trim();
  if (!t) return null;
  if (/^(none|n\/a|no|nothing|i don'?t need any extras?\.?)$/i.test(t)) return null;
  return t;
}
