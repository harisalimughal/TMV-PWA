import { describe, expect, it, vi } from "vitest";
import { parseCalendarTimeRate, resolveJobTimeRate, type ResolveJobTimeRateInput } from "../src/jobs/job-time-rate";
import { calculateJobTimeBilling } from "../src/jobs/job-time-billing";

function input(settings: Record<string, string> = {}, overrides: Partial<ResolveJobTimeRateInput> = {}): ResolveJobTimeRateInput {
  return {
    calendarText: "", crewSize: 2, packing: false,
    defaults: { crewRatePounds: "55", packingRatePounds: "95", crewBillingUnit: "Per 30 minutes" },
    readSetting: vi.fn(async (key: string, fallback: string) => settings[key] ?? fallback),
    ...overrides
  };
}

describe("Calendar overtime rate parsing", () => {
  it.each([
    ["GBP 55 per 30 minutes", 5500],
    ["75 pounds per half an hour", 7500],
    ["\u00a355 PER HALF AN HOUR", 5500],
    ["\u00c2\u00a355 per half hour", 5500],
    ["GBP 110 per hour", 5500],
    ["55.25 GBP per 30 mins", 5525],
    ["GBP 110.01 hourly", 5501],
    ["GBP 110 per 1 hour", 5500],
    ["GBP 110 per 60 minutes", 5500],
    ["GBP 1,100 per hour", 55000],
    ["GBP 0 per 30 minutes", 0]
  ])("normalizes %s to %i pence per half hour", (text, expected) => {
    expect(parseCalendarTimeRate(text)).toBe(expected);
  });

  it.each([
    "", "55", "GBP 55", "GBP -55 per hour", "-GBP 55 per hour",
    "GBP 55.123 per hour", "GBP 55 per 30 minutes or GBP 120 per hour",
    "GBP 55 per 30 minutes or per hour", "GBP 110 per 2 hours", "GBP 55 per 45 minutes", "GBP 55 per 45 minutes or hourly",
    "GBP 9999999999999999 per hour", "GBP 55,25 per hour", "GBP 110 per 21 hours", "GBP 55 per 30 minutes or 45 minutes"
  ])("leaves unusable Calendar text unknown: %s", text => {
    expect(parseCalendarTimeRate(text)).toBeNull();
  });
});

describe("Overtime rate priority and provenance", () => {
  it("uses Calendar first without reading settings", async () => {
    const values = input({ OVERTIME_RATE_PER_30: "99" }, { calendarText: "GBP 55 per half an hour" });
    expect(await resolveJobTimeRate(values)).toMatchObject({ rate: { per30Pence: 5500, source: "calendar" }, settingKey: null, needsVerification: false });
    expect(values.readSetting).not.toHaveBeenCalled();
  });

  it.each(["55.25", "0"])("uses the explicit overtime setting %s independently of crew billing unit", async override => {
    const values = input({ OVERTIME_RATE_PER_30: override, CREW_BILLING_UNIT: "Per hour" });
    expect(await resolveJobTimeRate(values)).toMatchObject({ rate: { per30Pence: Number(override) * 100, source: "settings" }, settingKey: "OVERTIME_RATE_PER_30" });
    expect(values.readSetting).toHaveBeenCalledTimes(1);
  });

  it("uses crew settings when overtime setting is blank", async () => {
    expect(await resolveJobTimeRate(input({ OVERTIME_RATE_PER_30: "", CREW_RATE_2_MAN: "65" }))).toMatchObject({
      rate: { per30Pence: 6500, source: "settings-crew-rate" }, settingKey: "CREW_RATE_2_MAN"
    });
  });

  it("converts hourly crew rates to half-hour rates", async () => {
    expect(await resolveJobTimeRate(input({ CREW_RATE_2_MAN: "110", CREW_BILLING_UNIT: "Per hour" }))).toMatchObject({ rate: { per30Pence: 5500 } });
  });

  it("uses packing settings per half hour", async () => {
    const values = input({ PACKING_RATE: "105.50" }, { packing: true });
    expect(await resolveJobTimeRate(values)).toMatchObject({ rate: { per30Pence: 10550, source: "settings-packing-rate" }, settingKey: "PACKING_RATE" });
    expect(values.readSetting).not.toHaveBeenCalledWith("CREW_BILLING_UNIT", expect.anything());
  });

  it("retains unusable Calendar text as a verification flag while applying settings fallback", async () => {
    expect(await resolveJobTimeRate(input({ OVERTIME_RATE_PER_30: "55" }, { calendarText: "GBP 55 or GBP 120 per hour" }))).toMatchObject({
      rate: { per30Pence: 5500 }, calendarStatus: "unusable", needsVerification: true
    });
  });

  it.each(["bad", "-1", "55oops", "1.234"])("does not silently substitute a rate for invalid explicit override %s", async override => {
    expect(await resolveJobTimeRate(input({ OVERTIME_RATE_PER_30: override }))).toMatchObject({ rate: null, needsVerification: true });
  });

  it("leaves an unknown crew billing unit unverifiable", async () => {
    expect(await resolveJobTimeRate(input({ CREW_BILLING_UNIT: "Per day" }))).toMatchObject({ rate: null, needsVerification: true });
  });

  it("feeds the normalized rate and source into the shared calculation", async () => {
    const resolved = await resolveJobTimeRate(input({ CREW_RATE_2_MAN: "110", CREW_BILLING_UNIT: "Per hour" }));
    const result = calculateJobTimeBilling({
      bookedStart: "2026-10-09T19:00:00Z", bookedFinish: "2026-10-09T20:30:00Z",
      actualStart: "2026-10-09T19:00:00Z", actualFinish: "2026-10-09T21:31:00Z",
      rate: resolved.rate, partialBlockPolicy: "round-up"
    });
    expect(result).toMatchObject({ billedExtraBlocks: 2, extraChargePence: 11000, rateSource: "settings-crew-rate" });
  });
});
