/**
 * Scheduling helpers: Europe/London days and times, interval overlap and conflict detection. Pure functions, used by
 * the preview server and by the calendar to preview a move. The server is the authority; this never replaces it.
 */
import { DateTime } from "luxon";
import type { Conflict } from "./types";

export const LONDON = "Europe/London";

export const london = (iso: string) => DateTime.fromISO(iso, { zone: "utc" }).setZone(LONDON);
export const londonDay = (iso: string) => london(iso).toISODate()!;
export const londonTime = (iso: string) => london(iso).toFormat("HH:mm");

/** A London wall-clock date and time to a UTC instant. Invalid input (or a time skipped by the clock change) gives null. */
export function fromLondon(date: string, time: string): string | null {
  const value = DateTime.fromISO(`${date}T${time}`, { zone: LONDON });
  if (!value.isValid) return null;
  // A time skipped on the spring clock change is moved forward by luxon; treat that as invalid instead of guessing.
  if (value.toFormat("HH:mm") !== time.slice(0, 5)) return null;
  return value.toUTC().toISO();
}

export function minutesBetween(startIso: string, endIso: string): number {
  return Math.round((Date.parse(endIso) - Date.parse(startIso)) / 60000);
}
export const addMinutes = (iso: string, minutes: number) => new Date(Date.parse(iso) + minutes * 60000).toISOString();

/** Start of the London day and the next London midnight, as UTC instants (a day is 23, 24 or 25 hours). */
export function londonDayBounds(day: string): { start: string; end: string } {
  const start = DateTime.fromISO(day, { zone: LONDON }).startOf("day");
  return { start: start.toUTC().toISO()!, end: start.plus({ days: 1 }).toUTC().toISO()! };
}

export interface Span { start: string; end: string }
/** Half open: a job ending at 10:00 does not overlap one starting at 10:00. */
export const overlaps = (a: Span, b: Span, bufferMinutes = 0) => Date.parse(a.start) < Date.parse(b.end) + bufferMinutes * 60000 && Date.parse(b.start) < Date.parse(a.end) + bufferMinutes * 60000;

export interface Occupied extends Span { bookingId: string; resourceId: string; kind: "driver" | "vehicle" }

/** Overlaps between a candidate and what the resource is already doing. `bufferMinutes` is only applied when travel data is known. */
export function overlapConflicts(candidate: Span & { bookingId: string }, occupied: Occupied[], resourceId: string, kind: "driver" | "vehicle", bufferMinutes: number | null): Conflict[] {
  const out: Conflict[] = [];
  for (const other of occupied) {
    if (other.resourceId !== resourceId || other.kind !== kind || other.bookingId === candidate.bookingId) continue;
    if (overlaps(candidate, other)) {
      out.push({ kind: kind === "driver" ? "driver_overlap" : "vehicle_overlap", severity: "blocking", message: `${kind === "driver" ? "Driver" : "Vehicle"} ${resourceId} is already booked for this time.`, withBookingId: other.bookingId, resourceId });
    } else if (bufferMinutes && overlaps(candidate, other, bufferMinutes)) {
      out.push({ kind: "travel_buffer", severity: "warning", message: `Less than ${bufferMinutes} minutes between this and another job for ${resourceId}.`, withBookingId: other.bookingId, resourceId });
    }
  }
  return out;
}

/** Lays overlapping spans onto the fewest lanes so they can be drawn without covering each other. */
export function assignLanes<T extends Span>(items: T[]): Array<T & { lane: number }> {
  const sorted = [...items].sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  const laneEnds: number[] = [];
  return sorted.map(item => {
    const start = Date.parse(item.start);
    let lane = laneEnds.findIndex(end => end <= start);
    if (lane < 0) { lane = laneEnds.length; laneEnds.push(0); }
    laneEnds[lane] = Date.parse(item.end);
    return { ...item, lane };
  });
}
