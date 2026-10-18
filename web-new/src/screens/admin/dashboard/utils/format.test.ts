import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import { formatAge, formatCalendarDate, formatDate, formatDateTime, formatDelay, formatMinutes, formatMoney, formatRange, knownSubtotal } from "./format";

describe("formatMinutes", () => {
  it("rounds to whole minutes and carries into hours (audit: 3h 43.88m -> 3h 44m)", () => {
    expect(formatMinutes(223.88)).toBe("3h 44m");
    expect(formatMinutes(1.85)).toBe("2 min");
    expect(formatMinutes(59.6)).toBe("1h 0m");
    expect(formatMinutes(150)).toBe("2h 30m");
  });
  it("keeps a measured zero distinct from a missing value", () => {
    expect(formatMinutes(0)).toBe("0 min");
    expect(formatMinutes(null)).toBe("Not recorded");
    expect(formatMinutes(Number.NaN, "Unavailable")).toBe("Unavailable");
  });
});

describe("formatDelay", () => {
  it("says early/late in words instead of '+-3 mins'", () => {
    expect(formatDelay(-3)).toBe("3 min early");
    expect(formatDelay(12)).toBe("12 min late");
    expect(formatDelay(65)).toBe("1h 5m late");
    expect(formatDelay(0.2)).toBe("On time");
  });
  it("does not turn a missing delay into 'On time'", () => {
    expect(formatDelay(undefined)).toBe("Not recorded");
  });
});

describe("formatMoney", () => {
  it("never renders a missing amount as £0.00", () => {
    expect(formatMoney(null)).toBe("Not recorded");
    expect(formatMoney(undefined, "Not submitted")).toBe("Not submitted");
    expect(formatMoney(0)).toBe("£0.00");
    expect(formatMoney(210750)).toBe("£2,107.50");
  });
});

describe("dates", () => {
  it("formats London dates and times with day-month-year and 24-hour clock", () => {
    expect(formatDate("2026-10-13T09:00:00Z")).toBe("13 Oct 2026");
    expect(formatDateTime("2026-10-13T13:05:00Z")).toBe("13 Oct 2026, 14:05");
    expect(formatDateTime("2026-01-13T13:05:00Z")).toBe("13 Jan 2026, 13:05");
    expect(formatDateTime(null)).toBe("Not recorded");
  });
  it("treats London day boundaries correctly across BST", () => {
    expect(formatDate("2026-10-12T23:30:00Z")).toBe("13 Oct 2026");
  });
  it("formats plain calendar dates without a timezone shift", () => {
    expect(formatCalendarDate("2026-10-10")).toBe("10 Oct 2026");
    expect(formatCalendarDate("")).toBe("Not recorded");
  });
  it("labels ranges compactly", () => {
    expect(formatRange("2026-10-12T23:00:00Z", "2026-10-13T22:59:59Z")).toBe("13 Oct 2026");
    expect(formatRange("2026-10-06T23:00:00Z", "2026-10-13T22:59:59Z")).toBe("7–13 Oct 2026");
    expect(formatRange(undefined, undefined)).toBe("All dates");
  });
  it("describes signal age", () => {
    const now = DateTime.fromISO("2026-10-13T12:00:00Z");
    expect(formatAge("2026-10-13T11:57:00Z", now)).toBe("3 min ago");
    expect(formatAge("2026-10-13 09:00:00", now)).toBe("3h ago");
    expect(formatAge(null, now)).toBe("Unknown");
  });
});

describe("knownSubtotal", () => {
  it("sums only known values and reports coverage", () => {
    expect(knownSubtotal([100, null, 250, undefined])).toEqual({ pence: 350, knownCount: 2, totalCount: 4, complete: false });
    expect(knownSubtotal([0, 0]).complete).toBe(true);
  });
});
