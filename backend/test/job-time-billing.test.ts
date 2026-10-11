import { afterEach, describe, expect, it, vi } from "vitest";
import {
  calculateJobTimeBilling, JOB_TIME_BILLING_RULE_VERSION, type JobTimeBillingInput
} from "../src/jobs/job-time-billing";
import { pence, type Pence } from "../src/utils/money";
import phase0Cases from "./fixtures/phase0-cases.json";

const start = "2026-10-09T19:00:00.000+01:00";
const startMs = new Date(start).getTime();
const afterMinutes = (minutes: number) => new Date(startMs + minutes * 60_000).toISOString();

function input(overrides: Partial<JobTimeBillingInput> = {}): JobTimeBillingInput {
  return {
    bookedStart: start,
    bookedFinish: afterMinutes(90),
    actualStart: start,
    actualFinish: afterMinutes(150),
    rate: { per30Pence: pence(5500), source: "calendar" },
    partialBlockPolicy: "round-up",
    ...overrides
  };
}

describe("Calendar allocation and job time billing", () => {
  afterEach(() => vi.useRealTimers());

  it.each(phase0Cases.clientTimeExamples)("matches client example: %i actual minutes, %i extra minutes, %i pence", (actual, extra, charge) => {
    const result = calculateJobTimeBilling(input({ actualFinish: afterMinutes(actual) }));
    expect(result).toMatchObject({
      ruleVersion: JOB_TIME_BILLING_RULE_VERSION,
      scheduledMinutes: 90,
      allocatedMinutes: 120,
      actualMinutes: actual,
      extraMinutes: extra,
      billedExtraMinutes: extra,
      extraChargePence: charge
    });
  });

  it.each(phase0Cases.observedDurationExamples)("preserves anonymized recorded duration: $source", sample => {
    const result = calculateJobTimeBilling(input({
      bookedFinish: afterMinutes(sample.scheduledMinutes), actualFinish: afterMinutes(sample.actualMinutes)
    }));
    expect(result.actualMinutes).toBeCloseTo(sample.actualMinutes, 6);
    expect(result.allocatedMinutes).toBe(sample.allocatedMinutes);
    expect(result.billedExtraBlocks).toBe(sample.billedExtraBlocksUnderProposedPolicy);
  });

  it.each([[0, 0], [1, 1], [29, 1], [30, 1], [31, 2]])(
    "uses the explicitly requested round-up policy for %i extra minutes", (extra, blocks) => {
      const result = calculateJobTimeBilling(input({ actualFinish: afterMinutes(120 + extra) }));
      expect(result.extraMinutes).toBe(extra);
      expect(result.billedExtraBlocks).toBe(blocks);
      expect(result.billedExtraMinutes).toBe(blocks * 30);
      expect(result.extraChargePence).toBe(blocks * 5500);
    }
  );

  it("retains millisecond excess beyond a billing boundary", () => {
    const result = calculateJobTimeBilling(input({ actualFinish: afterMinutes(120 + 1 / 60_000) }));
    expect(result.extraMinutes).toBeCloseTo(1 / 60_000);
    expect(result.billedExtraBlocks).toBe(1);
    expect(result.extraChargePence).toBe(5500);
  });

  it.each([[60, 60], [120, 120], [61, 120], [121, 180], [0.5, 60]])(
    "preserves %s scheduled minutes and allocates %s minutes", (scheduled, allocated) => {
      const result = calculateJobTimeBilling(input({ bookedFinish: afterMinutes(scheduled) }));
      expect(result.scheduledMinutes).toBe(scheduled);
      expect(result.allocatedMinutes).toBe(allocated);
    }
  );

  it("rounds an allocation upward when the booking exceeds an hour by one millisecond", () => {
    expect(calculateJobTimeBilling(input({ bookedFinish: afterMinutes(60 + 1 / 60_000) })).allocatedMinutes).toBe(120);
  });

  it("does not bill time spent after the recorded job finish", () => {
    vi.useFakeTimers();
    const first = calculateJobTimeBilling(input());
    vi.setSystemTime(new Date("2026-10-15T12:00:00.000Z"));
    expect(calculateJobTimeBilling(input())).toEqual(first);
  });

  it("uses elapsed instants across midnight and a daylight-saving transition", () => {
    const result = calculateJobTimeBilling(input({
      bookedStart: "2026-10-25T00:30:00+01:00",
      bookedFinish: "2026-10-25T01:00:00+00:00",
      actualStart: "2026-10-25T00:30:00+01:00",
      actualFinish: "2026-10-25T02:00:00+00:00"
    }));
    expect(result).toMatchObject({
      scheduledMinutes: 90, allocatedMinutes: 120, actualMinutes: 150,
      extraMinutes: 30, extraChargePence: 5500
    });
    expect(result.bookedStart).toBe("2026-10-24T23:30:00.000Z");
  });

  it("reports unknown overtime cost when a rate is missing", () => {
    expect(calculateJobTimeBilling(input({ rate: null }))).toMatchObject({
      extraMinutes: 30, billedExtraBlocks: 1, rateSource: "unavailable",
      ratePer30Pence: null, extraChargePence: null
    });
  });

  it("knows there is no extra charge within allocation even without a rate", () => {
    expect(calculateJobTimeBilling(input({ rate: null, actualFinish: afterMinutes(120) })).extraChargePence).toBe(0);
  });

  it("allows an explicitly supplied zero rate and records its source", () => {
    expect(calculateJobTimeBilling(input({ rate: { per30Pence: pence(0), source: "settings" } })))
      .toMatchObject({ extraChargePence: 0, ratePer30Pence: 0, rateSource: "settings" });
  });

  it("copies rate inputs into an immutable, serializable calculation snapshot", () => {
    const supplied = input();
    const result = calculateJobTimeBilling(supplied);
    supplied.rate!.per30Pence = pence(10000);
    expect(result.ratePer30Pence).toBe(5500);
    expect(Object.isFrozen(result)).toBe(true);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it.each(["", "invalid", "2026-02-30T10:00:00Z", "2026-10-09T19:00:00", "2026-10-09"])(
    "rejects missing, invalid, or timezone-less timestamps: %s", timestamp => {
      expect(() => calculateJobTimeBilling(input({ actualFinish: timestamp }))).toThrow(RangeError);
    }
  );

  it.each([0, -30])("rejects a non-positive scheduled duration of %i minutes", scheduled => {
    expect(() => calculateJobTimeBilling(input({ bookedFinish: afterMinutes(scheduled) }))).toThrow(RangeError);
  });

  it("rejects a recorded finish before the recorded start", () => {
    expect(() => calculateJobTimeBilling(input({ actualFinish: afterMinutes(-1) }))).toThrow(RangeError);
  });

  it("allows a recorded zero actual duration", () => {
    expect(calculateJobTimeBilling(input({ actualFinish: start })).extraChargePence).toBe(0);
  });

  it.each([-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])("rejects invalid pence rates: %s", rate => {
    expect(() => calculateJobTimeBilling(input({
      rate: { per30Pence: rate as Pence, source: "calendar" }
    }))).toThrow(RangeError);
  });

  it("rejects charges exceeding exact integer arithmetic", () => {
    expect(() => calculateJobTimeBilling(input({
      actualFinish: afterMinutes(180), rate: { per30Pence: pence(Number.MAX_SAFE_INTEGER), source: "calendar" }
    }))).toThrow(RangeError);
  });

  it("requires an explicit partial-block policy", () => {
    const supplied = input();
    delete (supplied as Partial<JobTimeBillingInput>).partialBlockPolicy;
    expect(() => calculateJobTimeBilling(supplied)).toThrow(/policy/);
  });
});
