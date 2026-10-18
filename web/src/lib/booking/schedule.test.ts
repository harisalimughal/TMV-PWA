import { describe, expect, it } from "vitest";
import { addMinutes, assignLanes, fromLondon, londonDay, londonDayBounds, londonTime, minutesBetween, overlapConflicts, overlaps, type Occupied } from "./schedule";

describe("London time", () => {
  it("reads instants as London wall clock, in summer and winter", () => {
    expect(londonTime("2026-07-01T09:00:00.000Z")).toBe("10:00");
    expect(londonTime("2026-12-01T09:00:00.000Z")).toBe("09:00");
    expect(londonDay("2026-07-01T23:30:00.000Z")).toBe("2026-07-02");
  });
  it("builds an instant from a London date and time, and refuses a time the clocks skip", () => {
    expect(fromLondon("2026-07-01", "10:00")).toBe("2026-07-01T09:00:00.000Z");
    expect(fromLondon("2026-12-01", "10:00")).toBe("2026-12-01T10:00:00.000Z");
    expect(fromLondon("2027-03-28", "01:30")).toBeNull();          // spring forward: 01:00 to 02:00 does not exist
    expect(fromLondon("2026-10-25", "01:30")).not.toBeNull();       // autumn: exists (twice); the first is used
    expect(fromLondon("nonsense", "10:00")).toBeNull();
  });
  it("gives a 23, 24 or 25 hour day around the clock changes", () => {
    const hours = (day: string) => { const b = londonDayBounds(day); return minutesBetween(b.start, b.end) / 60; };
    expect(hours("2026-10-24")).toBe(24);
    expect(hours("2026-10-25")).toBe(25);
    expect(hours("2027-03-28")).toBe(23);
  });
  it("adds minutes across a clock change using instants, not wall clock", () => {
    expect(addMinutes("2027-03-28T00:30:00.000Z", 60)).toBe("2027-03-28T01:30:00.000Z");
  });
});

describe("overlap", () => {
  const a = { start: "2026-10-20T09:00:00.000Z", end: "2026-10-20T11:00:00.000Z" };
  it("treats end and start at the same instant as not overlapping", () => {
    expect(overlaps(a, { start: "2026-10-20T11:00:00.000Z", end: "2026-10-20T12:00:00.000Z" })).toBe(false);
    expect(overlaps(a, { start: "2026-10-20T10:59:00.000Z", end: "2026-10-20T12:00:00.000Z" })).toBe(true);
  });
  it("applies a travel buffer only when one is given", () => {
    const next = { start: "2026-10-20T11:20:00.000Z", end: "2026-10-20T12:00:00.000Z" };
    expect(overlaps(a, next)).toBe(false);
    expect(overlaps(a, next, 30)).toBe(true);
  });
});

describe("overlap conflicts", () => {
  const occupied: Occupied[] = [{ bookingId: "B1", resourceId: "KA", kind: "driver", start: "2026-10-20T09:00:00.000Z", end: "2026-10-20T11:00:00.000Z" }];
  const candidate = (start: string, end: string) => ({ bookingId: "B2", start, end });
  it("blocks a driver double booking and names the other booking", () => {
    const found = overlapConflicts(candidate("2026-10-20T10:00:00.000Z", "2026-10-20T12:00:00.000Z"), occupied, "KA", "driver", null);
    expect(found).toEqual([expect.objectContaining({ kind: "driver_overlap", severity: "blocking", withBookingId: "B1" })]);
  });
  it("ignores other drivers, other kinds and the booking itself", () => {
    expect(overlapConflicts(candidate("2026-10-20T10:00:00.000Z", "2026-10-20T12:00:00.000Z"), occupied, "RF", "driver", null)).toEqual([]);
    expect(overlapConflicts(candidate("2026-10-20T10:00:00.000Z", "2026-10-20T12:00:00.000Z"), occupied, "KA", "vehicle", null)).toEqual([]);
    expect(overlapConflicts({ bookingId: "B1", start: "2026-10-20T10:00:00.000Z", end: "2026-10-20T12:00:00.000Z" }, occupied, "KA", "driver", null)).toEqual([]);
  });
  it("warns about a tight turnaround only when a buffer is known", () => {
    const tight = candidate("2026-10-20T11:15:00.000Z", "2026-10-20T12:00:00.000Z");
    expect(overlapConflicts(tight, occupied, "KA", "driver", null)).toEqual([]);
    expect(overlapConflicts(tight, occupied, "KA", "driver", 30)).toEqual([expect.objectContaining({ kind: "travel_buffer", severity: "warning" })]);
  });
});

describe("lanes", () => {
  it("uses one lane for back to back jobs and a second for an overlap", () => {
    const lanes = assignLanes([
      { start: "2026-10-20T09:00:00.000Z", end: "2026-10-20T10:00:00.000Z", id: 1 },
      { start: "2026-10-20T10:00:00.000Z", end: "2026-10-20T11:00:00.000Z", id: 2 },
      { start: "2026-10-20T10:30:00.000Z", end: "2026-10-20T12:00:00.000Z", id: 3 }
    ]);
    expect(lanes.map(item => [item.id, item.lane])).toEqual([[1, 0], [2, 0], [3, 1]]);
  });
});
