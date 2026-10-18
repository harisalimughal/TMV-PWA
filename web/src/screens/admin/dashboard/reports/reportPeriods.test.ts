import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";
import { dateRangeForPreset } from "../components/DateRangePicker";
import { customRange, dayCount, exceedsMaxDays, latestAllowedStart, londonDay, periodRange, prefillPeriod, rangeDates, rangeLabel } from "./reportPeriods";

const at = (iso: string) => DateTime.fromISO(iso, { zone: "utc" });
const dates = (range: { from: string; to: string }) => rangeDates(range);

describe("report periods", () => {
  it("uses London days, not UTC days, late in the evening in summer", () => {
    // 23:30 UTC on 1 July is 00:30 on 2 July in London.
    expect(dates(periodRange("today", at("2026-07-01T23:30:00Z")))).toEqual({ first: "2026-07-02", last: "2026-07-02" });
    expect(periodRange("today", at("2026-07-01T23:30:00Z"))).toEqual({ from: "2026-07-01T23:00:00.000Z", to: "2026-07-02T22:59:59.999Z" });
  });

  it("covers yesterday, this week and last week Monday to Sunday", () => {
    const now = at("2026-10-15T10:00:00Z"); // Thursday
    expect(dates(periodRange("yesterday", now))).toEqual({ first: "2026-10-14", last: "2026-10-14" });
    expect(dates(periodRange("thisWeek", now))).toEqual({ first: "2026-10-12", last: "2026-10-18" });
    expect(dates(periodRange("lastWeek", now))).toEqual({ first: "2026-10-05", last: "2026-10-11" });
  });

  it("keeps whole London days across the October clock change", () => {
    // Clocks go back at 02:00 on Sunday 25 October 2026.
    const range = periodRange("thisWeek", at("2026-10-21T12:00:00Z"));
    expect(dates(range)).toEqual({ first: "2026-10-19", last: "2026-10-25" });
    expect(range.from).toBe("2026-10-18T23:00:00.000Z"); // BST midnight
    expect(range.to).toBe("2026-10-25T23:59:59.999Z"); // GMT end of day
  });

  it("keeps whole London days across the March clock change", () => {
    const range = periodRange("lastWeek", at("2027-04-01T09:00:00Z"));
    expect(dates(range)).toEqual({ first: "2027-03-22", last: "2027-03-28" });
    expect(range.from).toBe("2027-03-22T00:00:00.000Z");
    expect(range.to).toBe("2027-03-28T22:59:59.999Z");
  });

  it("handles month and year boundaries", () => {
    expect(dates(periodRange("lastMonth", at("2027-01-10T12:00:00Z")))).toEqual({ first: "2026-12-01", last: "2026-12-31" });
    expect(dates(periodRange("thisMonth", at("2026-02-10T12:00:00Z")))).toEqual({ first: "2026-02-01", last: "2026-02-28" });
    expect(dates(periodRange("lastWeek", at("2027-01-01T12:00:00Z")))).toEqual({ first: "2026-12-21", last: "2026-12-27" });
  });

  it("keeps Last 7 days identical to the dashboard's existing 7 days filter", () => {
    const ours = periodRange("7d");
    const existing = dateRangeForPreset("7d");
    expect(ours).toEqual({ from: existing.from, to: existing.to });
  });

  it("validates custom ranges", () => {
    expect(customRange("", "2026-10-15")).toEqual({ error: "Choose a start date." });
    expect(customRange("2026-10-15", "")).toEqual({ error: "Choose an end date." });
    expect(customRange("", "")).toEqual({ error: "Choose a start and an end date." });
    expect(customRange("2026-10-15", "2026-10-09")).toEqual({ error: "The end date is before the start date." });
    expect("error" in customRange("2026-01-01", "2026-12-31")).toBe(true);
    const ok = customRange("2026-10-09", "2026-10-15");
    expect("error" in ok ? null : dates(ok)).toEqual({ first: "2026-10-09", last: "2026-10-15" });
    expect("error" in ok ? "" : rangeLabel(ok)).toBe("9 Oct 2026 to 15 Oct 2026");
  });

  it("counts days inclusively across a clock change, and allows exactly 93 days", () => {
    expect(dayCount("2026-10-24", "2026-10-26")).toBe(3); // spans the 25 October clock change
    expect(dayCount("2026-10-05", "2026-10-05")).toBe(1);
    expect(exceedsMaxDays("2026-01-01", "2026-04-03")).toBe(false); // 93 days
    expect(exceedsMaxDays("2026-01-01", "2026-04-04")).toBe(true); // 94 days
    expect(latestAllowedStart("2026-04-04")).toBe("2026-01-02");
    expect(dayCount(latestAllowedStart("2026-04-04"), "2026-04-04")).toBe(93);
    const error = customRange("2026-01-01", "2026-12-31");
    expect("error" in error && error.error).toMatch(/cover 365 days/);
  });

  it("reads a bare date as that London day and an instant as its London day", () => {
    expect(londonDay("2026-10-05")).toBe("2026-10-05");
    expect(londonDay("2026-10-04T23:00:00.000Z")).toBe("2026-10-05"); // BST midnight
    expect(londonDay("2026-10-05T22:59:59.999Z")).toBe("2026-10-05"); // end of the London day
    expect(londonDay("nonsense")).toBe("");
    expect(londonDay(undefined)).toBe("");
  });

  describe("prefilling from the Overview", () => {
    const now = at("2026-10-15T10:00:00Z");
    it("uses a matching preset, otherwise the exact dates", () => {
      const last = periodRange("lastWeek", now);
      expect(prefillPeriod(last, now)).toEqual({ period: "lastWeek", from: "", to: "" });
      expect(prefillPeriod({ from: "2026-10-01T23:00:00.000Z", to: "2026-10-09T22:59:59.999Z" }, now)).toEqual({ period: "custom", from: "2026-10-02", to: "2026-10-09" });
    });
    it("applies the documented default only when neither date is given", () => {
      expect(prefillPeriod(undefined, now)).toEqual({ period: "lastWeek", from: "", to: "" });
      expect(prefillPeriod({}, now)).toEqual({ period: "lastWeek", from: "", to: "" });
      expect(prefillPeriod({ from: "", to: "" }, now)).toEqual({ period: "lastWeek", from: "", to: "" });
    });
    it("keeps the one boundary it has instead of falling back to Last week", () => {
      expect(prefillPeriod({ from: "2026-10-02T23:00:00.000Z" }, now)).toEqual({ period: "custom", from: "2026-10-03", to: "" });
      expect(prefillPeriod({ to: "2026-10-09" }, now)).toEqual({ period: "custom", from: "", to: "2026-10-09" });
    });
    it("keeps a range longer than 93 days exactly as given", () => {
      expect(prefillPeriod({ from: "2026-01-01", to: "2026-12-31" }, now)).toEqual({ period: "custom", from: "2026-01-01", to: "2026-12-31" });
    });
  });
});
