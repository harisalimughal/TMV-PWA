import { addPence, equalPence, fromPounds, Pence, pence } from "../utils/money";
import { env } from "../config/env";

/**
 * Parses raw money inputs (e.g. "£350", "350.00", 350, "") safely to Pence.
 * Empty or invalid values return 0 Pence.
 */
export function safeMoney(raw: unknown): Pence {
  if (raw === undefined || raw === null || raw === "") return pence(0);
  try {
    return fromPounds(raw as string | number);
  } catch {
    return pence(0);
  }
}

/**
 * Calculates overtime charge for given overtime minutes.
 * Rate: env.overtimeRatePer30Minutes (£55) per 30 minutes, rounded up.
 */
export function calculateOvertimePence(overtimeMinutes: number): Pence {
  if (overtimeMinutes <= 0) return pence(0);
  const units = Math.ceil(overtimeMinutes / 30);
  const ratePounds = env.overtimeRatePer30Minutes ?? 55;
  return pence(units * ratePounds * 100);
}

/**
 * Checks if total charges reconcile against components:
 * basePrice + extraCharges + overtimeCharge === totalCharges
 */
export function reconcileFinancials(
  base: Pence,
  extras: Pence,
  overtime: Pence,
  total: Pence
): boolean {
  const expectedTotal = addPence(base, extras, overtime);
  // If total is 0 (unrecorded/incomplete job), reconciliation is trivial or skipped
  if (total === pence(0)) return true;
  return equalPence(expectedTotal, total);
}
