/**
 * What the Performance dashboard draws, as plain data.
 *
 * Driver-level figures come from the driver summary (the same rows as the table) and the
 * daily trend from the jobs scheduled in the range, so nothing is distributed or
 * invented: a bucket with no completed jobs is a real zero, a bucket whose completed jobs
 * all lack a charge is unknown (null), and calculated, final and received stay separate.
 */
import type { DriverSummaryItem, NormalizedJob } from "../types";
import { bucketKey, type Bucket, type Grain } from "./overviewData";

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

/** Calculated charge in pence: the system-priced total, else the stored total. */
export const calculatedPence = (job: NormalizedJob): number | null => {
  const value = job.totalCharges ?? job.calculatedTotalCharges;
  return finite(value) ? value : null;
};

export interface TrendRow {
  key: string; label: string; completed: number;
  /** Pounds; null when completed jobs exist but none had the figure. */
  calculated: number | null; final: number | null;
  calculatedMissing: number; finalMissing: number;
}

/** Calculated and final charges of COMPLETED jobs per bucket, by scheduled day (London). `today` (yyyy-mm-dd, London) marks the first bucket that is not finished. */
export function chargesTrend(jobs: NormalizedJob[], buckets: Bucket[], grain: Grain, today?: string): TrendRow[] {
  const rows = new Map(buckets.map(bucket => [bucket.key, { key: bucket.key, label: bucket.label, completed: 0, calcSum: 0, calcKnown: 0, calcMissing: 0, finalSum: 0, finalKnown: 0, finalMissing: 0 }]));
  for (const job of jobs) {
    if (job.status !== "COMPLETED") continue;
    const row = rows.get(bucketKey(job.bookedStart, grain) ?? "");
    if (!row) continue;
    row.completed += 1;
    const calculated = calculatedPence(job);
    if (calculated === null) row.calcMissing += 1; else { row.calcSum += calculated; row.calcKnown += 1; }
    if (finite(job.amountCharged)) { row.finalSum += job.amountCharged; row.finalKnown += 1; } else row.finalMissing += 1;
  }
  // A day (or period) that has not finished and has nothing completed yet is not a real zero: it is simply not recorded yet.
  const unfinished = (key: string) => !!today && key >= today;
  return Array.from(rows.values()).map(row => ({
    key: row.key, label: row.label, completed: row.completed, calculatedMissing: row.calcMissing, finalMissing: row.finalMissing,
    calculated: row.completed === 0 ? (unfinished(row.key) ? null : 0) : row.calcKnown === 0 ? null : row.calcSum / 100,
    final: row.completed === 0 ? (unfinished(row.key) ? null : 0) : row.finalKnown === 0 ? null : row.finalSum / 100
  }));
}

/* ----------------------------------------------------------------- totals ---- */

export interface Totals {
  completed: number; calculated: number; final: number;
  workingMinutes: number | null; workingUnknownJobs: number;
  reviewSent: number; reviewNotSent: number;
}

/** Working time is unknown (null) when no row has any recorded time. */
export function totalsOf(rows: DriverSummaryItem[]): Totals {
  const working = rows.filter(row => finite(row.totalDurationMinutes) && !(row.totalDurationMinutes === 0 && (row.workingUnknownJobs ?? 0) >= row.completed && row.completed > 0));
  return {
    completed: rows.reduce((sum, row) => sum + row.completed, 0),
    calculated: rows.reduce((sum, row) => sum + (row.calculatedChargesPounds ?? row.totalChargesPounds ?? 0), 0),
    final: rows.reduce((sum, row) => sum + (row.revenuePounds ?? 0), 0),
    workingMinutes: working.length ? working.reduce((sum, row) => sum + row.totalDurationMinutes, 0) : null,
    workingUnknownJobs: rows.reduce((sum, row) => sum + (row.workingUnknownJobs ?? 0), 0),
    reviewSent: rows.reduce((sum, row) => sum + (row.reviewSentCount ?? 0), 0),
    reviewNotSent: rows.reduce((sum, row) => sum + (row.reviewNotSentCount ?? 0), 0)
  };
}

/** Sent as a share of the requests the system tracks (sent plus not sent); null with nothing tracked. */
export function reviewShare(totals: Pick<Totals, "reviewSent" | "reviewNotSent">): { tracked: number; fraction: number | null } {
  const tracked = totals.reviewSent + totals.reviewNotSent;
  return { tracked, fraction: tracked > 0 ? totals.reviewSent / tracked : null };
}

/** Percentage change against a comparable period; null when there is nothing to compare. */
export function pctChange(current: number, previous: number | null | undefined): number | null {
  return finite(previous) && previous > 0 ? (current - previous) / previous : null;
}

/* ------------------------------------------------------------ per driver ---- */

export interface WorkingRow { initials: string; name: string; minutes: number | null; unknownJobs: number; knownJobs: number; averageMinutes: number | null }

/** Recorded working time per driver. The average divides by the jobs that have a time, never by all jobs. */
export function workingRows(rows: DriverSummaryItem[]): WorkingRow[] {
  return rows.map(row => {
    const unknown = row.workingUnknownJobs ?? 0;
    const known = Math.max(0, row.completed - unknown);
    const missingAll = !finite(row.totalDurationMinutes) || (row.totalDurationMinutes === 0 && unknown >= row.completed && row.completed > 0);
    return { initials: row.initials, name: row.fullName, minutes: missingAll ? null : row.totalDurationMinutes, unknownJobs: unknown, knownJobs: known,
      averageMinutes: missingAll || known === 0 ? null : row.totalDurationMinutes / known };
  });
}

export interface ReceiptMix {
  segments: Array<{ key: "cash" | "card" | "link" | "bank"; label: string; pounds: number }>;
  receivedTotal: number;
  /** Billed by invoice. Not money received, so it is never a slice of the received ring. */
  invoiced: number;
  /** Final charges not explained by any recorded payment: shown as a fact, not a slice. */
  unverifiedJobs: number;
}

export function receiptMix(rows: DriverSummaryItem[]): ReceiptMix {
  const sum = (pick: (row: DriverSummaryItem) => number | undefined) => rows.reduce((total, row) => total + (finite(pick(row)) ? pick(row)! : 0), 0);
  const segments = [
    { key: "cash" as const, label: "Cash", pounds: sum(row => row.cashCollectedPounds) },
    { key: "card" as const, label: "Card", pounds: sum(row => row.cardCollectedPounds) },
    { key: "link" as const, label: "Payment link", pounds: sum(row => row.linkCollectedPounds) },
    { key: "bank" as const, label: "Bank transfer", pounds: sum(row => row.bankCollectedPounds) }
  ];
  return { segments, receivedTotal: segments.reduce((total, segment) => total + segment.pounds, 0), invoiced: sum(row => row.invoiceCollectedPounds), unverifiedJobs: sum(row => row.unknownCollectionJobs) };
}

/** Each completed job belongs to exactly one driver, so shares of completed jobs sum to 100%. */
export function jobShares(rows: DriverSummaryItem[]): Array<{ initials: string; name: string; completed: number; share: number | null }> {
  const total = rows.reduce((sum, row) => sum + row.completed, 0);
  return rows.map(row => ({ initials: row.initials, name: row.fullName, completed: row.completed, share: total > 0 ? row.completed / total : null }));
}

export type SortKey = "name" | "completed" | "calculated" | "final" | "receipts" | "working" | "reviews";
export const SORT_LABEL: Record<SortKey, string> = { name: "Driver name", completed: "Completed jobs", calculated: "Calculated charges", final: "Final charges", receipts: "Recorded receipts", working: "Working time", reviews: "Review requests sent" };

const sortValue = (row: DriverSummaryItem, key: SortKey): number | string | null => {
  switch (key) {
    case "name": return row.fullName.toLowerCase();
    case "completed": return row.completed;
    case "calculated": return row.calculatedChargesPounds ?? row.totalChargesPounds ?? null;
    case "final": return finite(row.revenuePounds) ? row.revenuePounds : null;
    case "receipts": return finite(row.totalCollectionsPounds) ? row.totalCollectionsPounds : null;
    case "working": return workingRows([row])[0].minutes;
    case "reviews": return row.reviewSentCount ?? 0;
  }
};

/** Unknown values sort last in either direction, never as zero. */
export function sortDrivers(rows: DriverSummaryItem[], key: SortKey, direction: "asc" | "desc"): DriverSummaryItem[] {
  const sign = direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = sortValue(a, key), y = sortValue(b, key);
    if (x === null && y === null) return a.fullName.localeCompare(b.fullName);
    if (x === null) return 1;
    if (y === null) return -1;
    const order = typeof x === "string" ? x.localeCompare(y as string) : x - (y as number);
    return order * sign || a.fullName.localeCompare(b.fullName);
  });
}
