/**
 * Vehicle due-state rules -- the existing thresholds from the former VanMileagePage,
 * now in one place so the list, the detail and the attention badges agree:
 *
 * - A date is "Due soon" within COMPLIANCE_ALERT_DAYS (30) days, "Overdue" once passed.
 * - Service is "Due soon" within SERVICE_MILEAGE_WARNING_MILES (500) of the interval.
 *
 * A stored date is not proof of compliance; these states only describe the date on
 * record, evaluated as of today (London).
 */
import { DateTime } from "luxon";
import type { VanComplianceItem } from "../types";
import type { Tone } from "../components/ds";

export const COMPLIANCE_ALERT_DAYS = 30;
export const SERVICE_MILEAGE_WARNING_MILES = 500;

export type DueState = "current" | "due-soon" | "overdue" | "missing";
export interface DueStatus { state: DueState; label: string; tone: Tone; detail: string }

export function daysUntil(rawDate?: string | null, today: DateTime = DateTime.now().setZone("Europe/London")): number | null {
  const match = rawDate ? /^(\d{4})-(\d{2})-(\d{2})/.exec(rawDate) : null;
  if (!match) return null;
  const target = DateTime.fromObject({ year: +match[1], month: +match[2], day: +match[3] }, { zone: "Europe/London" });
  return Math.round(target.diff(today.startOf("day"), "days").days);
}

export function dateStatus(rawDate?: string | null, today?: DateTime): DueStatus {
  const days = daysUntil(rawDate, today);
  if (days === null) return { state: "missing", label: "Date missing", tone: "neutral", detail: "No date recorded" };
  if (days < 0) return { state: "overdue", label: "Overdue", tone: "danger", detail: `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} ago` };
  if (days === 0) return { state: "due-soon", label: "Due today", tone: "warning", detail: "Today" };
  if (days <= COMPLIANCE_ALERT_DAYS) return { state: "due-soon", label: "Due soon", tone: "warning", detail: `In ${days} day${days === 1 ? "" : "s"}` };
  return { state: "current", label: "Current", tone: "success", detail: `In ${days} days` };
}

export interface ServiceStatus extends DueStatus { milesRemaining: number | null; nextServiceMileage: number | null; interval: number | null }

export function serviceStatus(compliance?: VanComplianceItem | null): ServiceStatus {
  const interval = compliance?.serviceIntervalMiles ?? null;
  const last = compliance?.lastServiceMileage ?? null;
  const current = compliance?.currentMileage ?? null;
  if (!(typeof interval === "number" && interval > 0)) return { state: "missing", label: "Interval not set", tone: "neutral", detail: "Set a service interval to track it", milesRemaining: null, nextServiceMileage: null, interval: null };
  if (typeof last !== "number") return { state: "missing", label: "No service logged", tone: "neutral", detail: `Every ${interval.toLocaleString("en-GB")} mi`, milesRemaining: null, nextServiceMileage: null, interval };
  const since = Math.max(0, (current ?? last) - last);
  const remaining = interval - since;
  const next = last + interval;
  const base = { milesRemaining: remaining, nextServiceMileage: next, interval };
  if (remaining < 0) return { ...base, state: "overdue", label: "Overdue", tone: "danger", detail: `${Math.abs(remaining).toLocaleString("en-GB")} mi over · due at ${next.toLocaleString("en-GB")} mi` };
  if (remaining <= SERVICE_MILEAGE_WARNING_MILES) return { ...base, state: "due-soon", label: "Due soon", tone: "warning", detail: `${remaining.toLocaleString("en-GB")} mi left · due at ${next.toLocaleString("en-GB")} mi` };
  return { ...base, state: "current", label: "Current", tone: "success", detail: `${remaining.toLocaleString("en-GB")} mi left` };
}

/** Items that need attention for one vehicle, most urgent first. */
export function vehicleAttention(compliance?: VanComplianceItem | null): Array<{ label: string; status: DueStatus }> {
  const items = [
    { label: "MOT", status: dateStatus(compliance?.motExpiryDate) },
    { label: "Tax", status: dateStatus(compliance?.roadTaxRenewalDate) },
    { label: "Service", status: serviceStatus(compliance) as DueStatus }
  ];
  const order: Record<DueState, number> = { overdue: 0, "due-soon": 1, missing: 2, current: 3 };
  // A missing MOT or tax date is an action (record it); an unset service interval is configuration, not shown here.
  return items.filter(item => item.status.state === "overdue" || item.status.state === "due-soon" || (item.status.state === "missing" && item.label !== "Service"))
    .sort((a, b) => order[a.status.state] - order[b.status.state]);
}

/* ---- The Van preview's countdown ring and service gauge -------------------------
 * Same labels, thresholds and ring maths as the live Van page (VanMileagePage):
 * full ring while a date is more than COMPLIANCE_ALERT_DAYS away, a ring that fills as
 * the date approaches inside the window, a full red ring once expired. */

export interface ComplianceCountdown {
  days: number | null;
  tone: "ok" | "warning" | "danger" | "empty";
  /** 0..100 of the ring drawn. */
  ringPercent: number;
  /** Inside the ring: "109 days", "Today", "Expired", "No date". */
  center: string;
  /** Under the ring: "Status: OK", "Alert: Due in 12 days", "Due today", "Expired 4 days ago", "Add date". */
  status: string;
}

export function complianceCountdown(rawDate?: string | null, today?: DateTime): ComplianceCountdown {
  const days = daysUntil(rawDate, today);
  if (days === null) return { days, tone: "empty", ringPercent: 0, center: "No date", status: "Add date" };
  if (days < 0) return { days, tone: "danger", ringPercent: 100, center: "Expired", status: `Expired ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} ago` };
  if (days <= COMPLIANCE_ALERT_DAYS) {
    return { days, tone: "warning", ringPercent: Math.max(8, Math.round(((COMPLIANCE_ALERT_DAYS - days) / COMPLIANCE_ALERT_DAYS) * 100)),
      center: days === 0 ? "Today" : `${days} day${days === 1 ? "" : "s"}`, status: days === 0 ? "Due today" : `Alert: Due in ${days} day${days === 1 ? "" : "s"}` };
  }
  return { days, tone: "ok", ringPercent: 100, center: `${days} days`, status: "Status: OK" };
}

export interface ServiceGauge {
  tone: "ok" | "warning" | "danger" | "empty";
  ringPercent: number;
  /** Above the ring: "Next service at 56,210 mi", or "Not recorded". */
  top: string;
  center: string | null;
  /** "Remaining miles: 19,606", "Overdue by 120 mi", "Interval not set", "No service logged yet". */
  status: string;
  interval: number | null;
}

export function serviceGauge(compliance?: VanComplianceItem | null): ServiceGauge {
  const s = serviceStatus(compliance);
  if (s.milesRemaining === null || s.nextServiceMileage === null || s.interval === null) {
    return { tone: "empty", ringPercent: 0, top: "Not recorded", center: null, status: s.interval === null ? "Interval not set" : "No service logged yet", interval: s.interval };
  }
  const since = s.interval - s.milesRemaining;
  const overdue = s.milesRemaining < 0;
  const n = (value: number) => Math.abs(value).toLocaleString("en-GB");
  return {
    tone: overdue ? "danger" : s.state === "due-soon" ? "warning" : "ok",
    ringPercent: Math.min(100, Math.max(0, Math.round((since / s.interval) * 100))),
    top: `Next service at ${s.nextServiceMileage.toLocaleString("en-GB")} mi`,
    center: overdue ? `${n(s.milesRemaining)} mi over` : `${n(s.milesRemaining)} mi`,
    status: overdue ? `Overdue by ${n(s.milesRemaining)} mi` : `Remaining miles: ${n(s.milesRemaining)}`,
    interval: s.interval
  };
}

/**
 * One summary for a van's MOT and road tax: the worst of the two. A stored date is not
 * a conclusion, so this says Overdue / Due soon / Current, and "Partly recorded" or
 * "Not recorded" when a date is missing, never just "Recorded".
 */
export function complianceSummary(compliance?: VanComplianceItem | null, today?: DateTime): { label: string; tone: "ok" | "warning" | "danger" | "empty" } {
  const states = [dateStatus(compliance?.motExpiryDate, today).state, dateStatus(compliance?.roadTaxRenewalDate, today).state];
  if (states.includes("overdue")) return { label: "Overdue", tone: "danger" };
  if (states.includes("due-soon")) return { label: "Due soon", tone: "warning" };
  if (states.every(state => state === "missing")) return { label: "Not recorded", tone: "empty" };
  if (states.includes("missing")) return { label: "Partly recorded", tone: "warning" };
  return { label: "Current", tone: "ok" };
}
