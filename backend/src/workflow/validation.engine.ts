import { ExtraChargeType, PaymentMethod } from "../jobs/job.types";
import { WorkflowState } from "./workflow.states";

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export function assertState(actual: string, expected: WorkflowState): void {
  if (actual !== expected) {
    throw new ValidationError(`This action is not valid at the current step (${actual}). Expected ${expected}.`);
  }
}

export function validateExtraCharges(values: string[]): string[] {
  const allowed = new Set(Object.values(ExtraChargeType));
  const unique = [...new Set(values.filter(Boolean))];
  if (unique.length === 0) throw new ValidationError("Select at least one extra-charge option.");
  for (const value of unique) {
    if (!allowed.has(value as ExtraChargeType)) throw new ValidationError(`Unknown charge option: ${value}`);
  }
  if (unique.includes(ExtraChargeType.NONE) && unique.length > 1) {
    throw new ValidationError("'No Extras Time' cannot be selected together with another charge.");
  }
  return unique;
}

export function validateMinutes(raw: string): number {
  const cleaned = raw.trim().toLowerCase().replace(/minutes?|mins?|min/g, "").trim();
  // Number("") is 0, not NaN — an empty/missing submission must not silently become
  // "the driver entered 0 minutes overtime".
  if (!cleaned) {
    throw new ValidationError("Overtime must be a whole number of minutes, for example 30.");
  }
  const value = Number(cleaned);
  if (!Number.isInteger(value) || value < 0 || value > 24 * 60) {
    throw new ValidationError("Overtime must be a whole number of minutes, for example 30.");
  }
  return value;
}

export function validateCurrency(raw: string): number {
  const cleaned = raw.replace(/[£,$\s]/g, "");
  // Number("") is 0, not NaN — an empty/missing submission must not silently become
  // "the driver entered £0.00". §total-charges-zero.
  if (!cleaned) {
    throw new ValidationError("Enter a valid total charge amount in GBP, for example 196 or 196.00.");
  }
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value < 0 || value > 100000) {
    throw new ValidationError("Enter a valid total charge amount in GBP, for example 196 or 196.00.");
  }
  return Math.round(value * 100) / 100;
}

/** Crew size the driver actually had on site for the overtime period -- may differ
 * from the job's booked crew size (e.g. a helper joined partway through, or someone
 * left early), which is why the driver picks it explicitly rather than it being
 * silently inferred from the booking. Drives which CREW_RATE_*_MAN setting the
 * overtime charge is calculated from -- see workflow.engine.ts's SUBMIT_OVERTIME. */
export function validateCrewSize(raw: string): number {
  const value = Number(raw.trim());
  if (!Number.isInteger(value) || value < 1 || value > 12) {
    throw new ValidationError("Select a crew size between 1 and 12.");
  }
  return value;
}

export function validatePaymentMethod(raw: string): PaymentMethod {
  if (!Object.values(PaymentMethod).includes(raw as PaymentMethod)) {
    throw new ValidationError("Select a valid payment method.");
  }
  return raw as PaymentMethod;
}

export function validateClientDetails(raw: string): string {
  const value = raw.trim();
  if (value.length < 3) throw new ValidationError("Enter the client name and postcode/address confirmation.");
  return value;
}
