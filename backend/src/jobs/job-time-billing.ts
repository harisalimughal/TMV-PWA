import { DateTime } from "luxon";
import { pence, type Pence } from "../utils/money";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const EXTRA_BLOCK_MS = 30 * MINUTE_MS;
export const JOB_TIME_BILLING_RULE_VERSION = "calendar-allocation-30min-v1";
export type JobTimeRateSource = "calendar" | "settings" | "settings-crew-rate" | "settings-packing-rate";

export interface JobTimeBillingInput {
  bookedStart: string;
  bookedFinish: string;
  actualStart: string;
  actualFinish: string;
  rate: { per30Pence: Pence; source: JobTimeRateSource } | null;
  // Caller explicitly selects the accepted billing policy.
  partialBlockPolicy: "round-up";
}

export interface JobTimeBillingSnapshot {
  readonly ruleVersion: typeof JOB_TIME_BILLING_RULE_VERSION;
  readonly partialBlockPolicy: "round-up";
  readonly bookedStart: string;
  readonly bookedFinish: string;
  readonly actualStart: string;
  readonly actualFinish: string;
  readonly scheduledMinutes: number;
  readonly allocatedMinutes: number;
  readonly actualMinutes: number;
  readonly extraMinutes: number;
  readonly billedExtraBlocks: number;
  readonly billedExtraMinutes: number;
  readonly ratePer30Pence: Pence | null;
  readonly rateSource: JobTimeRateSource | "unavailable";
  readonly extraChargePence: Pence | null;
}

function parseInstant(value: string, field: string): DateTime {
  if (typeof value !== "string" || !/(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) {
    throw new RangeError(`${field} must be an ISO date/time with an explicit timezone.`);
  }
  const instant = DateTime.fromISO(value, { setZone: true });
  if (!instant.isValid) throw new RangeError(`${field} must be a valid ISO date/time.`);
  return instant.toUTC();
}

function elapsedMs(start: DateTime, finish: DateTime, field: string, allowZero: boolean): number {
  const elapsed = finish.toMillis() - start.toMillis();
  if (!Number.isSafeInteger(elapsed) || elapsed < 0 || (!allowZero && elapsed === 0)) {
    throw new RangeError(`${field} must be ${allowZero ? "non-negative" : "positive"} and within the supported range.`);
  }
  return elapsed;
}

/** Pure calculation: requires recorded finish time and never consults the clock or settings. */
export function calculateJobTimeBilling(input: JobTimeBillingInput): JobTimeBillingSnapshot {
  if (input.partialBlockPolicy !== "round-up") {
    throw new RangeError("An explicit supported partial-block policy is required.");
  }
  const bookedStart = parseInstant(input.bookedStart, "Booked start");
  const bookedFinish = parseInstant(input.bookedFinish, "Booked finish");
  const actualStart = parseInstant(input.actualStart, "Actual start");
  const actualFinish = parseInstant(input.actualFinish, "Actual finish");
  const scheduledMs = elapsedMs(bookedStart, bookedFinish, "Scheduled duration", false);
  const actualMs = elapsedMs(actualStart, actualFinish, "Actual duration", true);
  const allocatedMs = Math.ceil(scheduledMs / HOUR_MS) * HOUR_MS;
  if (!Number.isSafeInteger(allocatedMs)) throw new RangeError("Allocated duration exceeds the supported range.");

  // Compare milliseconds before converting for display, so small excess is not rounded away.
  const extraMs = Math.max(0, actualMs - allocatedMs);
  const billedExtraBlocks = Math.ceil(extraMs / EXTRA_BLOCK_MS);
  const ratePer30Pence = input.rate?.per30Pence ?? null;
  if (input.rate && (ratePer30Pence === null || !Number.isSafeInteger(ratePer30Pence) || ratePer30Pence < 0 ||
      !["calendar", "settings", "settings-crew-rate", "settings-packing-rate"].includes(input.rate.source))) {
    throw new RangeError("Rate must be a non-negative safe integer in pence with a known source.");
  }
  const charge = extraMs === 0 ? 0 : ratePer30Pence === null ? null : billedExtraBlocks * ratePer30Pence;
  if (charge !== null && !Number.isSafeInteger(charge)) {
    throw new RangeError("Overtime charge exceeds the supported range.");
  }

  return Object.freeze({
    ruleVersion: JOB_TIME_BILLING_RULE_VERSION,
    partialBlockPolicy: input.partialBlockPolicy,
    bookedStart: bookedStart.toISO()!,
    bookedFinish: bookedFinish.toISO()!,
    actualStart: actualStart.toISO()!,
    actualFinish: actualFinish.toISO()!,
    scheduledMinutes: scheduledMs / MINUTE_MS,
    allocatedMinutes: allocatedMs / MINUTE_MS,
    actualMinutes: actualMs / MINUTE_MS,
    extraMinutes: extraMs / MINUTE_MS,
    billedExtraBlocks,
    billedExtraMinutes: billedExtraBlocks * 30,
    ratePer30Pence,
    rateSource: input.rate?.source ?? "unavailable",
    extraChargePence: charge === null ? null : pence(charge)
  });
}
