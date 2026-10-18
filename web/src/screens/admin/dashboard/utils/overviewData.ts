/**
 * Overview analytics, derived from ONE dataset: every job whose scheduled start is in
 * the selected range (GET /api/admin/jobs, all pages). Using one dataset keeps every
 * KPI and chart on the same definition and the same range.
 *
 * Definitions (fields on NormalizedJob):
 * - Job status         `status`: READY = Scheduled, IN_PROGRESS, COMPLETED, CANCELLED.
 *                      A job's *current* status, grouped by its scheduled day -- not a
 *                      historical snapshot of what the status was on that day.
 * - Final charges      `amountCharged` (pence) on COMPLETED jobs: the amount entered at
 *                      completion. Includes amounts left to invoice; NOT money received.
 * - Recorded receipts  `paymentBreakdown` rows (pence) on COMPLETED jobs, excluding
 *                      invoice rows. What the driver recorded as received in the job flow.
 * - Unpaid invoices    `paymentBreakdown` rows whose method starts with "Invoice".
 * - Working time       `actualMinutes`: recorded arrival to finish.
 * - Arrival delay      `delayMinutes`, only when `arrivalDelaySource` is a verified basis.
 * - Overtime           `overtimeMinutes` on COMPLETED jobs.
 *
 * Every measure reports how many jobs it could not read, so a partial value is never
 * presented as complete and a missing value is never counted as zero.
 */
import { DateTime } from "luxon";
import type { JobStatus, NormalizedJob } from "../types";

const ZONE = "Europe/London";

export type StatusKey = "scheduled" | "inProgress" | "completed" | "cancelled";
export const STATUS_OF: Record<JobStatus, StatusKey> = { READY: "scheduled", IN_PROGRESS: "inProgress", COMPLETED: "completed", CANCELLED: "cancelled" };
export const STATUS_LABEL: Record<StatusKey, string> = { completed: "Completed", inProgress: "In progress", scheduled: "Scheduled", cancelled: "Cancelled" };

/** A sum that knows how many contributing values were missing. */
export interface KnownSum { known: number; missing: number; counted: number }
const emptySum = (): KnownSum => ({ known: 0, missing: 0, counted: 0 });
function addKnown(sum: KnownSum, value: number | null | undefined) {
  if (typeof value === "number" && Number.isFinite(value)) { sum.known += value; sum.counted += 1; } else sum.missing += 1;
}

/* ---------------------------------------------------------------- buckets ---- */

export type Grain = "day" | "week" | "month";

/** Day buckets up to a month, weekly up to ~4 months, monthly beyond. */
export function grainFor(from: string, to: string): Grain {
  const days = DateTime.fromISO(to).diff(DateTime.fromISO(from), "days").days;
  return days <= 31.5 ? "day" : days <= 124 ? "week" : "month";
}

export interface Bucket { key: string; label: string; start: DateTime }

/** Every bucket in the range, including empty ones, in London time. */
export function bucketsFor(from: string, to: string, grain: Grain): Bucket[] {
  const unit = grain === "day" ? "day" : grain === "week" ? "week" : "month";
  let cursor = DateTime.fromISO(from, { zone: ZONE }).startOf(unit);
  const end = DateTime.fromISO(to, { zone: ZONE });
  const out: Bucket[] = [];
  while (cursor <= end && out.length < 400) {
    out.push({ key: cursor.toISODate()!, start: cursor, label: grain === "day" ? cursor.toFormat("d LLL") : grain === "week" ? `w/c ${cursor.toFormat("d LLL")}` : cursor.toFormat("LLL yyyy") });
    cursor = cursor.plus({ [unit + "s"]: 1 });
  }
  return out;
}

export function bucketKey(iso: string | undefined, grain: Grain): string | null {
  if (!iso) return null;
  const at = DateTime.fromISO(iso).setZone(ZONE);
  return at.isValid ? at.startOf(grain === "day" ? "day" : grain === "week" ? "week" : "month").toISODate() : null;
}

/* ------------------------------------------------------------------- KPIs ---- */

export interface OverviewKpis {
  total: number;
  byStatus: Record<StatusKey, number>;
  finalCharges: KnownSum;
  totalCharges: KnownSum;
}

export function kpisFor(jobs: NormalizedJob[]): OverviewKpis {
  const byStatus: Record<StatusKey, number> = { scheduled: 0, inProgress: 0, completed: 0, cancelled: 0 };
  const finalCharges = emptySum();
  const totalCharges = emptySum();
  for (const job of jobs) {
    const key = STATUS_OF[job.status];
    if (key) byStatus[key] += 1;
    if (job.status === "COMPLETED") {
      addKnown(finalCharges, job.amountCharged);
      addKnown(totalCharges, job.calculatedTotalCharges);
    }
  }
  return { total: jobs.length, byStatus, finalCharges, totalCharges };
}

/** Signed change against a previous period of the same length; null when there is no basis. */
export function change(current: number, previous: number | null | undefined): { delta: number; pct: number | null } | null {
  if (previous === null || previous === undefined) return null;
  return { delta: current - previous, pct: previous === 0 ? null : (current - previous) / previous };
}

/** The period of equal length immediately before [from, to]. */
export function previousPeriod(from: string, to: string): { from: string; to: string } {
  const start = DateTime.fromISO(from), end = DateTime.fromISO(to);
  const length = end.diff(start);
  return { from: start.minus(length).minus({ milliseconds: 1 }).toUTC().toISO()!, to: start.minus({ milliseconds: 1 }).toUTC().toISO()! };
}

/* ---------------------------------------------------------- activity chart ---- */

export type ActivityRow = { key: string; label: string; total: number } & Record<StatusKey, number>;

export function activitySeries(jobs: NormalizedJob[], buckets: Bucket[], grain: Grain): ActivityRow[] {
  const rows = new Map(buckets.map(bucket => [bucket.key, { key: bucket.key, label: bucket.label, total: 0, scheduled: 0, inProgress: 0, completed: 0, cancelled: 0 } as ActivityRow]));
  for (const job of jobs) {
    const row = rows.get(bucketKey(job.bookedStart, grain) ?? "");
    const status = STATUS_OF[job.status];
    if (!row || !status) continue;
    row[status] += 1; row.total += 1;
  }
  return Array.from(rows.values());
}

/* ----------------------------------------------------- final charges chart ---- */

export interface ChargesRow { key: string; label: string; /** Known final charges, pounds; null when no completed job in the bucket had one. */ amount: number | null; completed: number; missing: number }

export function finalChargesSeries(jobs: NormalizedJob[], buckets: Bucket[], grain: Grain): ChargesRow[] {
  const rows = new Map(buckets.map(bucket => [bucket.key, { key: bucket.key, label: bucket.label, sum: emptySum(), completed: 0 }]));
  for (const job of jobs) {
    if (job.status !== "COMPLETED") continue;
    const row = rows.get(bucketKey(job.bookedStart, grain) ?? "");
    if (!row) continue;
    row.completed += 1;
    addKnown(row.sum, job.amountCharged);
  }
  return Array.from(rows.values()).map(row => ({
    key: row.key, label: row.label, completed: row.completed, missing: row.sum.missing,
    // A bucket with no completed jobs is a real £0; one whose completed jobs all lack a charge is unknown.
    amount: row.completed === 0 ? 0 : row.sum.counted === 0 ? null : row.sum.known / 100
  }));
}

/* ---------------------------------------------------------- payment methods ---- */

export const RECEIPT_METHODS = ["Cash", "Card", "Bank transfer", "Payment link"] as const;
export type ReceiptMethod = typeof RECEIPT_METHODS[number];

export interface PaymentMix {
  received: Record<ReceiptMethod, number>;
  receivedTotal: number;
  invoices: { pence: number; jobs: number; amountMissing: number };
  unclassified: { pence: number; jobs: number };
  noPaymentRecorded: number;
  completedJobs: number;
}

function receiptMethod(method: string | undefined): ReceiptMethod | "invoice" | null {
  const m = (method || "").trim().toLowerCase();
  if (m.startsWith("invoice")) return "invoice";
  if (m === "cash") return "Cash";
  if (m === "card") return "Card";
  if (m === "bank transfer" || m === "bank") return "Bank transfer";
  if (m === "link" || m === "payment link") return "Payment link";
  return null;
}

export function paymentMix(jobs: NormalizedJob[]): PaymentMix {
  const mix: PaymentMix = { received: { Cash: 0, Card: 0, "Bank transfer": 0, "Payment link": 0 }, receivedTotal: 0,
    invoices: { pence: 0, jobs: 0, amountMissing: 0 }, unclassified: { pence: 0, jobs: 0 }, noPaymentRecorded: 0, completedJobs: 0 };
  for (const job of jobs) {
    if (job.status !== "COMPLETED") continue;
    mix.completedJobs += 1;
    const rows = job.paymentBreakdown ?? [];
    if (!rows.length) { mix.noPaymentRecorded += 1; continue; }
    let invoiced = false, unclassified = false;
    for (const row of rows) {
      const kind = receiptMethod(row.method);
      const amount = Number.isFinite(row.amount) ? row.amount : 0;
      if (kind === "invoice") { invoiced = true; if (amount > 0) mix.invoices.pence += amount; else mix.invoices.amountMissing += 1; }
      else if (kind) { mix.received[kind] += amount; mix.receivedTotal += amount; }
      else { unclassified = true; mix.unclassified.pence += amount; }
    }
    if (invoiced) mix.invoices.jobs += 1;
    if (unclassified) mix.unclassified.jobs += 1;
  }
  return mix;
}

/* ------------------------------------------------------- driver performance ---- */

export interface DriverRow { initials: string; name: string; completed: number; finalCharges: KnownSum; workingMinutes: KnownSum }

export function driverRows(jobs: NormalizedJob[]): DriverRow[] {
  const map = new Map<string, DriverRow>();
  for (const job of jobs) {
    if (job.status !== "COMPLETED" || !job.driverInitials) continue;
    const row = map.get(job.driverInitials) ?? { initials: job.driverInitials, name: job.driverName || job.driverInitials, completed: 0, finalCharges: emptySum(), workingMinutes: emptySum() };
    row.completed += 1;
    addKnown(row.finalCharges, job.amountCharged);
    addKnown(row.workingMinutes, job.actualMinutes);
    map.set(job.driverInitials, row);
  }
  return Array.from(map.values());
}

/* ------------------------------------------------------------------ timing ---- */

export interface TimingSummary {
  /** Started or completed jobs, i.e. jobs that could have an arrival. */
  eligible: number;
  verified: number;
  unverified: number;
  lateJobs: number;
  /** Sum of minutes late across late jobs. */
  totalLateMinutes: number;
  /** Mean minutes late across late jobs only; null when no job was late. */
  averageLateMinutes: number | null;
  overtime: { jobs: number; minutes: number; completed: number };
  byBucket: Array<{ key: string; label: string; late: number; onTime: number; unverified: number }>;
}

export const VERIFIED_ARRIVAL = (job: NormalizedJob) => !!job.arrivalDelaySource && job.arrivalDelaySource !== "unavailable" && Number.isFinite(job.delayMinutes);

export function timingSummary(jobs: NormalizedJob[], buckets: Bucket[], grain: Grain): TimingSummary {
  const rows = new Map(buckets.map(bucket => [bucket.key, { key: bucket.key, label: bucket.label, late: 0, onTime: 0, unverified: 0 }]));
  const out: TimingSummary = { eligible: 0, verified: 0, unverified: 0, lateJobs: 0, totalLateMinutes: 0, averageLateMinutes: null, overtime: { jobs: 0, minutes: 0, completed: 0 }, byBucket: [] };
  for (const job of jobs) {
    if (job.status === "COMPLETED") {
      out.overtime.completed += 1;
      if ((job.overtimeMinutes ?? 0) > 0) { out.overtime.jobs += 1; out.overtime.minutes += job.overtimeMinutes; }
    }
    if (job.status !== "COMPLETED" && job.status !== "IN_PROGRESS") continue;
    out.eligible += 1;
    const row = rows.get(bucketKey(job.bookedStart, grain) ?? "");
    if (!VERIFIED_ARRIVAL(job)) { out.unverified += 1; if (row) row.unverified += 1; continue; }
    out.verified += 1;
    if (job.delayMinutes > 0) { out.lateJobs += 1; out.totalLateMinutes += job.delayMinutes; if (row) row.late += 1; }
    else if (row) row.onTime += 1;
  }
  out.averageLateMinutes = out.lateJobs ? out.totalLateMinutes / out.lateJobs : null;
  out.byBucket = Array.from(rows.values());
  return out;
}

/* ---------------------------------------------------------------- workload ---- */

export const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export interface WorkloadGrid {
  /** Hours of the day (London) covered, e.g. 7..18. Empty when there is no work. */
  hours: number[];
  /** counts[weekday 0=Mon..6=Sun][hour index]. */
  counts: number[][];
  /** Jobs per weekday (Mon..Sun). */
  byWeekday: number[];
  total: number;
}

/**
 * When the work is scheduled: jobs by weekday and by scheduled start hour (London
 * time). Cancelled jobs are excluded -- they are not workload. This is the scheduled
 * start, not when the work actually happened.
 */
export function workloadGrid(jobs: NormalizedJob[]): WorkloadGrid {
  const stamped: Array<{ day: number; hour: number }> = [];
  for (const job of jobs) {
    if (job.status === "CANCELLED" || !job.bookedStart) continue;
    const at = DateTime.fromISO(job.bookedStart).setZone(ZONE);
    if (at.isValid) stamped.push({ day: at.weekday - 1, hour: at.hour });
  }
  if (!stamped.length) return { hours: [], counts: WEEKDAY_LABELS.map(() => []), byWeekday: WEEKDAY_LABELS.map(() => 0), total: 0 };
  const min = Math.min(...stamped.map(item => item.hour));
  const max = Math.max(...stamped.map(item => item.hour));
  const hours = Array.from({ length: max - min + 1 }, (_, index) => min + index);
  const counts = WEEKDAY_LABELS.map(() => hours.map(() => 0));
  const byWeekday = WEEKDAY_LABELS.map(() => 0);
  for (const { day, hour } of stamped) { counts[day][hour - min] += 1; byWeekday[day] += 1; }
  return { hours, counts, byWeekday, total: stamped.length };
}
