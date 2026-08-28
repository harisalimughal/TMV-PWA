/**
 * Money handling. §44: store the smallest currency unit, never do GBP arithmetic in
 * JavaScript floats.
 *
 * MIGRATION STATUS: `Job` still carries pounds as `number` for storage compatibility
 * with the live spreadsheet. This module is the target representation and is already
 * used for every *comparison* and every *rendering* — the two places where float
 * behaviour is visible today (`£421.5` on a driver's card, and `Math.abs(a-b) >= 0.01`
 * as an equality test). Converting the stored columns to pence is a schema change and
 * is tracked separately; the branded type below will surface every remaining site at
 * compile time when that happens.
 */

export type Pence = number & { readonly __brand: "Pence" };

export function pence(value: number): Pence {
  if (!Number.isInteger(value)) throw new RangeError(`Pence must be a whole number, received ${value}`);
  return value as Pence;
}

/** Parses "£1,234.50", "1234.5" or 1234.5 into pence. Rounds half away from zero. */
export function fromPounds(value: string | number): Pence {
  const cleaned = typeof value === "number" ? value : Number(String(value).replace(/[£,\s]/g, ""));
  if (!Number.isFinite(cleaned)) throw new RangeError(`Not a monetary amount: ${value}`);
  // Scale before rounding so 18.5 -> 1850, not 1849.9999999999998.
  return pence(Math.round(cleaned * 100));
}

export const toPounds = (value: Pence): number => value / 100;

export const addPence = (...values: Pence[]): Pence => pence(values.reduce((a, b) => a + b, 0));

export const multiplyPence = (value: Pence, factor: number): Pence => pence(Math.round(value * factor));

/** Exact equality. Replaces epsilon comparisons, which are not a correctness argument. */
export const equalPence = (a: Pence, b: Pence): boolean => a === b;

/** Always two decimal places: "£421.00", never "£421.5". */
export function formatGBP(value: Pence): string {
  const negative = value < 0;
  const absolute = Math.abs(value);
  const body = `£${Math.floor(absolute / 100).toLocaleString("en-GB")}.${String(absolute % 100).padStart(2, "0")}`;
  return negative ? `-${body}` : body;
}

/** Convenience for the pounds-typed values still stored on `Job`. */
export const formatPounds = (value: number): string => formatGBP(fromPounds(value));
