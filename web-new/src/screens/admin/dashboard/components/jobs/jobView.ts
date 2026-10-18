/**
 * How a job is presented in the Jobs cards and table. Pure functions over the job as
 * the backend returned it: no status is inferred from timestamps, no amount is
 * invented, and missing values stay missing.
 */
import type { NormalizedJob } from "../../types";
import { isUnassigned, jobAttention } from "../../hooks/useAttention";
import { jobStatusLabel, paymentState } from "../StatusBadge";
import type { Tone } from "../ds";

/** The one amount shown per job, with its meaning: completed jobs show the final
 *  charge entered at completion; others the system-calculated charge. */
export function rowCharge(job: NormalizedJob): { label: "Final" | "Calculated" | "Not charged"; pence: number | null } {
  if (job.status === "CANCELLED") return { label: "Not charged", pence: null };
  if (job.status === "COMPLETED") return { label: "Final", pence: typeof job.amountCharged === "number" ? job.amountCharged : null };
  const calculated = job.totalCharges ?? job.calculatedTotalCharges;
  return { label: "Calculated", pence: typeof calculated === "number" && !isUnpriced(job) ? calculated : null };
}

/**
 * True when an open job's calculated charge is zero because nothing priced it: no
 * base price and no billing rate (the booking had no price, e.g. "3 men/ INV-HE").
 * A zero with pricing evidence (a base price or a known rate) is a real £0.00 and is
 * shown as one; only the unpriced case reads "Not priced".
 */
export function isUnpriced(job: NormalizedJob): boolean {
  const calculated = job.totalCharges ?? job.calculatedTotalCharges;
  if (typeof calculated !== "number" || calculated !== 0) return false;
  if ((job.basePrice ?? 0) > 0) return false;
  const billing = job.timeBilling;
  return !(billing && billing.rateSource !== "unavailable" && (billing.ratePer30Pence ?? 0) > 0);
}

export const CHARGE_LABEL: Record<ReturnType<typeof rowCharge>["label"], string> = { Final: "Final charge", Calculated: "Calculated charge", "Not charged": "Cancelled, not charged" };

/** Crew and van as stored on the booking. The raw title shorthand stays in the detail. */
export function crewLine(job: NormalizedJob): string {
  return [job.crewSize ? `Crew ${job.crewSize}` : "", job.bookingDetails?.vanSize || ""].filter(Boolean).join(" · ");
}

export type JobAccent = "neutral" | "violet" | "teal" | "coral" | "amber";

/**
 * The status colour of a job: the backend status, except that an active job with a
 * high-severity issue (no driver) is marked amber so it never looks ready.
 */
export function jobAccent(job: NormalizedJob): { accent: JobAccent; label: string; tone: Tone } {
  const active = job.status === "READY" || job.status === "IN_PROGRESS";
  if (active && isUnassigned(job)) return { accent: "amber", label: jobStatusLabel(job.status), tone: job.status === "IN_PROGRESS" ? "info" : "neutral" };
  switch (job.status) {
    case "IN_PROGRESS": return { accent: "violet", label: "In progress", tone: "info" };
    case "COMPLETED": return { accent: "teal", label: "Completed", tone: "success" };
    case "CANCELLED": return { accent: "coral", label: "Cancelled", tone: "danger" };
    default: return { accent: "neutral", label: jobStatusLabel(job.status), tone: "neutral" };
  }
}

/** Payment line under the amount, from what was recorded at completion. */
export function paymentLine(job: NormalizedJob): string {
  if (job.status === "CANCELLED") return "No charge recorded";
  if (job.status !== "COMPLETED") return "Not yet charged";
  const method = job.paymentMethod || "";
  if (job.paidOnline) return method ? `${method} · paid online` : "Paid online";
  // The backend's own payment status wins ("Recorded", "Outstanding", "Pending");
  // it is only derived from the recorded breakdown when the backend sent none.
  const stored = (job.paymentStatus || "").trim();
  const state = stored ? stored.toLowerCase() : paymentState(job).label.toLowerCase();
  return method ? `${method} · ${state}` : stored ? `Payment ${state}, method not recorded` : state === "receipt recorded" ? "Receipt recorded" : "Payment method not recorded";
}

export function attentionOf(job: NormalizedJob) {
  const items = jobAttention(job);
  const severity = items.some(item => item.severity === "high") ? "high" : items.some(item => item.severity === "medium") ? "medium" : items.length ? "low" : null;
  return { items, severity } as const;
}

/** Splits an address into a first line and the rest, for a two-line route stop. */
export function addressLines(address: string): { first: string; rest: string } {
  const value = (address || "").trim();
  const comma = value.indexOf(",");
  return comma > 0 ? { first: value.slice(0, comma), rest: value.slice(comma + 1).trim() } : { first: value, rest: "" };
}
