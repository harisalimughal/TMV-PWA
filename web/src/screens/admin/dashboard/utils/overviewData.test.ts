import { describe, expect, it } from "vitest";
import type { JobStatus, NormalizedJob } from "../types";
import {
  activitySeries, bucketsFor, change, driverRows, finalChargesSeries, grainFor, kpisFor, paymentMix, previousPeriod, timingSummary, workloadGrid
} from "./overviewData";
import { loadRangeJobs } from "../hooks/useRangeJobs";

const from = "2026-10-07T23:00:00.000Z"; // 8 Oct, London
const to = "2026-10-10T22:59:59.999Z";   // 10 Oct end, London
const job = (patch: Partial<NormalizedJob>): NormalizedJob => ({ jobId: "J", bookedStart: "2026-10-08T09:00:00Z", status: "COMPLETED", driverInitials: "SD", driverName: "Sam Driver", delayMinutes: 0, overtimeMinutes: 0, ...patch } as NormalizedJob);

describe("buckets", () => {
  it("chooses day, week or month by range length and includes empty buckets", () => {
    expect(grainFor(from, to)).toBe("day");
    expect(grainFor("2026-08-01T00:00:00Z", "2026-10-01T00:00:00Z")).toBe("week");
    expect(grainFor("2026-01-01T00:00:00Z", "2026-10-01T00:00:00Z")).toBe("month");
    expect(bucketsFor(from, to, "day").map(bucket => bucket.label)).toEqual(["8 Oct", "9 Oct", "10 Oct"]);
  });
});

describe("kpis and activity", () => {
  const jobs = [job({}), job({ status: "IN_PROGRESS", amountCharged: undefined }), job({ status: "CANCELLED", bookedStart: "2026-10-09T09:00:00Z" }), job({ status: "READY", bookedStart: "2026-10-10T09:00:00Z" })];
  it("counts every status so the parts add up to the total", () => {
    const kpis = kpisFor(jobs);
    expect(kpis.total).toBe(4);
    expect(Object.values(kpis.byStatus).reduce((a, b) => a + b, 0)).toBe(4);
  });
  it("groups jobs by scheduled day with their current status", () => {
    const rows = activitySeries(jobs, bucketsFor(from, to, "day"), "day");
    expect(rows.map(row => [row.label, row.completed, row.inProgress, row.cancelled, row.scheduled])).toEqual([["8 Oct", 1, 1, 0, 0], ["9 Oct", 0, 0, 1, 0], ["10 Oct", 0, 0, 0, 1]]);
  });
});

describe("final charges", () => {
  it("keeps calculated totals separate from completion amounts and payment receipts", () => {
    const kpis = kpisFor([
      job({ calculatedTotalCharges: 18000, amountCharged: 20000, paymentBreakdown: [{ method: "Cash", amount: 5000 }] }),
      job({ calculatedTotalCharges: undefined, amountCharged: 10000 }),
      job({ status: "IN_PROGRESS", calculatedTotalCharges: 90000, amountCharged: 90000 })
    ]);
    expect(kpis.totalCharges).toEqual({ known: 18000, counted: 1, missing: 1 });
    expect(kpis.finalCharges.known).toBe(30000);
  });
  it("counts a missing final charge as missing, never as £0", () => {
    const kpis = kpisFor([job({ amountCharged: 10000 }), job({ amountCharged: undefined })]);
    expect(kpis.finalCharges).toEqual({ known: 10000, missing: 1, counted: 1 });
  });
  it("draws a day with no completed jobs as £0 but a day whose charges are all missing as unknown", () => {
    const rows = finalChargesSeries([job({ amountCharged: undefined }), job({ bookedStart: "2026-10-09T09:00:00Z", amountCharged: 5000 })], bucketsFor(from, to, "day"), "day");
    expect(rows.map(row => row.amount)).toEqual([null, 50, 0]);
    expect(rows[0].missing).toBe(1);
  });
  it("ignores charges on jobs that are not completed", () => {
    expect(kpisFor([job({ status: "IN_PROGRESS", amountCharged: 9000 })]).finalCharges.known).toBe(0);
  });
});

describe("payment mix", () => {
  it("keeps invoices and unknown methods out of recorded receipts", () => {
    const mix = paymentMix([
      job({ paymentBreakdown: [{ method: "Cash", amount: 3000 }, { method: "Card", amount: 2000 }] }),
      job({ paymentBreakdown: [{ method: "Invoice", amount: 9000 }] }),
      job({ paymentBreakdown: [{ method: "Invoice", amount: 0 }] }),
      job({ paymentBreakdown: [{ method: "Voucher", amount: 1000 }] }),
      job({ paymentBreakdown: [] })
    ]);
    expect(mix.receivedTotal).toBe(5000);
    expect(mix.received).toMatchObject({ Cash: 3000, Card: 2000 });
    expect(mix.invoices).toEqual({ pence: 9000, jobs: 2, amountMissing: 1 });
    expect(mix.unclassified).toEqual({ pence: 1000, jobs: 1 });
    expect(mix.noPaymentRecorded).toBe(1);
  });
});

describe("drivers", () => {
  it("aggregates completed work per driver and keeps missing values separate", () => {
    const rows = driverRows([job({ amountCharged: 1000, actualMinutes: 60 }), job({ amountCharged: undefined, actualMinutes: undefined }), job({ status: "CANCELLED" }), job({ driverInitials: "", driverName: "" })]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ initials: "SD", completed: 2, finalCharges: { known: 1000, missing: 1 }, workingMinutes: { known: 60, missing: 1 } });
  });
});

describe("timing", () => {
  it("never counts an unverified arrival as on time and separates total from average lateness", () => {
    const timing = timingSummary([
      job({ arrivalDelaySource: "gps-two-fresh-reports", delayMinutes: 10 }),
      job({ arrivalDelaySource: "gps-two-fresh-reports", delayMinutes: 20 }),
      job({ arrivalDelaySource: "proof-acceptance", delayMinutes: -5 }),
      job({ arrivalDelaySource: "unavailable", delayMinutes: 0 }),
      job({ status: "COMPLETED", overtimeMinutes: 30, arrivalDelaySource: undefined })
    ], bucketsFor(from, to, "day"), "day");
    expect(timing).toMatchObject({ eligible: 5, verified: 3, unverified: 2, lateJobs: 2, totalLateMinutes: 30, averageLateMinutes: 15, overtime: { jobs: 1, minutes: 30, completed: 5 } });
  });
  it("reports no average when nobody was late", () => {
    expect(timingSummary([job({ arrivalDelaySource: "proof-acceptance", delayMinutes: 0 })], [], "day").averageLateMinutes).toBeNull();
  });
});

describe("comparison", () => {
  it("uses the period of equal length immediately before", () => {
    expect(previousPeriod(from, to)).toEqual({ from: "2026-10-04T23:00:00.000Z", to: "2026-10-07T22:59:59.999Z" });
  });
  it("has no percentage against zero and no comparison without a previous value", () => {
    expect(change(5, 0)).toEqual({ delta: 5, pct: null });
    expect(change(5, null)).toBeNull();
  });
});

describe("loadRangeJobs", () => {
  it("loads every page rather than counting from the first page", async () => {
    const all = Array.from({ length: 230 }, (_, index) => job({ jobId: `J${index}` }));
    const load = async (query: Record<string, any> = {}) => ({ items: all.slice((query.page - 1) * query.pageSize, query.page * query.pageSize), pagination: { page: query.page, pageSize: query.pageSize, total: all.length, totalPages: 3, hasMore: false }, meta: { fetchedAt: "", durationMs: 0 } });
    const result = await loadRangeJobs(from, to, load);
    expect(result).toMatchObject({ total: 230, complete: true });
    expect(result.jobs).toHaveLength(230);
  });
  it("asks for one driver's jobs on every page when a driver is given, and for all drivers otherwise", async () => {
    const queries: Record<string, any>[] = [];
    const load = async (query: Record<string, any> = {}) => {
      queries.push(query);
      return { items: query.page === 1 ? [job({})] : [], pagination: { page: query.page, pageSize: 100, total: 1, totalPages: 1, hasMore: false }, meta: { fetchedAt: "", durationMs: 0 } };
    };
    await loadRangeJobs(from, to, load, "JE");
    expect(queries.every(query => query.driver === "JE")).toBe(true);
    queries.length = 0;
    await loadRangeJobs(from, to, load);
    expect(queries.every(query => !("driver" in query))).toBe(true);
  });
  it("flags partial data when the server reports more jobs than were returned", async () => {
    const load = async () => ({ items: [job({})], pagination: { page: 1, pageSize: 100, total: 5, totalPages: 1, hasMore: false }, meta: { fetchedAt: "", durationMs: 0 } });
    const result = await loadRangeJobs(from, to, load);
    expect(result.complete).toBe(false);
  });
});

describe("workloadGrid", () => {
  const at = (iso: string, status: JobStatus = "COMPLETED") => ({ bookedStart: iso, status } as NormalizedJob);
  it("counts jobs by London weekday and start hour, skipping cancelled jobs", () => {
    // Mon 2026-10-12 09:30 BST (08:30Z), Mon 10:05 BST, Wed 2026-10-14 09:00 BST, and a cancelled Monday job.
    const grid = workloadGrid([at("2026-10-12T08:30:00Z"), at("2026-10-12T09:05:00Z"), at("2026-10-14T08:00:00Z", "READY"), at("2026-10-12T08:00:00Z", "CANCELLED")]);
    expect(grid.total).toBe(3);
    expect(grid.hours).toEqual([9, 10]);
    expect(grid.byWeekday).toEqual([2, 0, 1, 0, 0, 0, 0]);
    expect(grid.counts[0]).toEqual([1, 1]);
    expect(grid.counts[2]).toEqual([1, 0]);
  });
  it("returns an empty grid when there is no scheduled work", () => {
    const grid = workloadGrid([at("2026-10-12T08:30:00Z", "CANCELLED")]);
    expect(grid).toMatchObject({ total: 0, hours: [] });
  });
});
