import { pence, type Pence } from "../utils/money";
import type { JobTimeRateSource } from "./job-time-billing";

export interface JobTimeRate {
  per30Pence: Pence;
  source: JobTimeRateSource;
}

export interface JobTimeRateResolution {
  rate: JobTimeRate | null;
  settingKey: string | null;
  calendarText: string;
  calendarStatus: "valid" | "missing" | "unusable";
  needsVerification: boolean;
}

function amountPence(raw: string): Pence | null {
  const trimmed = raw.trim();
  if (trimmed.includes(",") && !/^\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?$/.test(trimmed)) return null;
  const value = trimmed.replace(/,/g, "");
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return null;
  const [whole, decimals = ""] = value.split(".");
  const amount = Number(whole) * 100 + Number(decimals.padEnd(2, "0"));
  return Number.isSafeInteger(amount) ? pence(amount) : null;
}

/** Reject competing amounts/units rather than selecting the first price in prose. */
export function parseCalendarTimeRate(text: string): Pence | null {
  const amounts = [...text.matchAll(/(?:\u00c2?\u00a3|\bgbp\s*)\s*([\d,]+(?:\.\d+)?)(?![\d.,])|\b([\d,]+(?:\.\d+)?)\s*(?:pounds?|gbp)\b/gi)];
  if (amounts.length !== 1 || /-\s*(?:\u00c2?\u00a3|gbp|\d)/i.test(text)) return null;
  const amount = amountPence(amounts[0][1] ?? amounts[0][2]);
  if (amount === null) return null;
  const amountIndex = amounts[0].index!;
  const unitsText = text.slice(0, amountIndex) + " " + text.slice(amountIndex + amounts[0][0].length);

  const halfHour = /\b(?:half\s+(?:an?\s+)?hour|30\s*(?:mins?|minutes?))\b/gi;
  const halfMatches = [...unitsText.matchAll(halfHour)];
  const remaining = unitsText.replace(halfHour, "");
  const hourly = /\b(?:60\s*(?:mins?|minutes?)|1\s*(?:hour|hr)|full\s+hour|hours?|hrs?|hourly)\b/gi;
  const hourMatches = [...remaining.matchAll(hourly)];
  const otherUnits = remaining.replace(hourly, "");
  if (halfMatches.length === 1 && hourMatches.length === 0 && !/\b\d+\s*(?:mins?|minutes?)\b/i.test(remaining)) return amount;
  if (halfMatches.length === 0 && hourMatches.length === 1 && !/\b\d+\s*(?:hours?|hrs?|mins?|minutes?)\b/i.test(otherUnits) &&
      !/\b(?:[2-9]|\d{2,})\s*$/i.test(remaining.slice(0, hourMatches[0].index))) {
    return pence(Math.round(amount / 2));
  }
  return null;
}

export interface ResolveJobTimeRateInput {
  calendarText: string;
  crewSize: number;
  packing: boolean;
  defaults: { crewRatePounds: string; packingRatePounds: string; crewBillingUnit: string };
  readSetting: (key: string, fallback: string) => Promise<string>;
}

/** Read only the selected priority branch; every result is normalized to 30 minutes. */
export async function resolveJobTimeRate(input: ResolveJobTimeRateInput): Promise<JobTimeRateResolution> {
  const calendarRate = parseCalendarTimeRate(input.calendarText);
  const calendarStatus = calendarRate !== null ? "valid" : input.calendarText.trim() ? "unusable" : "missing";
  const result = (rate: JobTimeRate | null, settingKey: string | null): JobTimeRateResolution => ({
    rate, settingKey, calendarText: input.calendarText, calendarStatus,
    needsVerification: calendarStatus === "unusable" || rate === null
  });
  if (calendarRate !== null) return result({ per30Pence: calendarRate, source: "calendar" }, null);

  const override = await input.readSetting("OVERTIME_RATE_PER_30", "");
  if (override.trim()) {
    const amount = amountPence(override);
    return result(amount === null ? null : { per30Pence: amount, source: "settings" }, "OVERTIME_RATE_PER_30");
  }

  if (input.packing) {
    const amount = amountPence(await input.readSetting("PACKING_RATE", input.defaults.packingRatePounds));
    return result(amount === null ? null : { per30Pence: amount, source: "settings-packing-rate" }, "PACKING_RATE");
  }
  if (!Number.isSafeInteger(input.crewSize) || input.crewSize < 1) return result(null, null);
  const key = `CREW_RATE_${input.crewSize}_MAN`;
  const amount = amountPence(await input.readSetting(key, input.defaults.crewRatePounds));
  const unit = (await input.readSetting("CREW_BILLING_UNIT", input.defaults.crewBillingUnit)).trim().toLowerCase();
  const hourly = /^(?:per\s+)?(?:hour|hourly|1\s*hour|60\s*(?:mins?|minutes?))$/.test(unit);
  const halfHourly = /^(?:per\s+)?(?:30\s*(?:mins?|minutes?)|half\s+(?:an?\s+)?hour)$/.test(unit);
  return result(amount === null || (!hourly && !halfHourly) ? null : {
    per30Pence: hourly ? pence(Math.round(amount / 2)) : amount, source: "settings-crew-rate"
  }, key);
}
