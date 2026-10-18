import { describe, expect, it } from "vitest";
import type { DriverSummaryItem, NormalizedJob } from "../types";
import { bucketsFor, grainFor } from "./overviewData";
import { calculatedPence, chargesTrend, jobShares, pctChange, receiptMix, reviewShare, sortDrivers, totalsOf, workingRows } from "./performanceData";

const row = (patch: Partial<DriverSummaryItem>) => ({ initials: "KA", fullName: "Caio", active: true, hasAccount: true, completed: 4, totalDurationMinutes: 480, workingUnknownJobs: 0, revenuePounds: 900, calculatedChargesPounds: 950,
  cashCollectedPounds: 500, cardCollectedPounds: 400, bankCollectedPounds: 0, invoiceCollectedPounds: 0, reviewSentCount: 3, reviewNotSentCount: 1, ...patch }) as DriverSummaryItem;
const job = (patch: Partial<NormalizedJob>) => ({ jobId: "J", status: "COMPLETED", bookedStart: "2026-10-12T10:00:00Z", totalCharges: 10000, amountCharged: 9000, ...patch }) as NormalizedJob;

describe("performance data", () => {
  it("totals agree with the rows and keep working time unknown when nothing is recorded", () => {
    const totals = totalsOf([row({}), row({ initials: "TI", fullName: "Tiago", completed: 2, revenuePounds: 300, calculatedChargesPounds: 300, totalDurationMinutes: 0, workingUnknownJobs: 2 })]);
    expect(totals).toMatchObject({ completed: 6, final: 1200, calculated: 1250, workingMinutes: 480, workingUnknownJobs: 2, reviewSent: 6, reviewNotSent: 2 });
    expect(totalsOf([row({ totalDurationMinutes: 0, workingUnknownJobs: 4 })]).workingMinutes).toBeNull();
  });

  it("only computes a review share when something is tracked", () => {
    expect(reviewShare({ reviewSent: 3, reviewNotSent: 1 })).toEqual({ tracked: 4, fraction: 0.75 });
    expect(reviewShare({ reviewSent: 0, reviewNotSent: 0 }).fraction).toBeNull();
  });

  it("compares with a previous period only when there is one", () => {
    expect(pctChange(150, 100)).toBe(0.5);
    expect(pctChange(150, 0)).toBeNull();
    expect(pctChange(150, undefined)).toBeNull();
  });

  it("averages working time over the jobs that have a time, not all jobs", () => {
    const [partial, none] = workingRows([row({ completed: 4, totalDurationMinutes: 300, workingUnknownJobs: 1 }), row({ completed: 2, totalDurationMinutes: 0, workingUnknownJobs: 2 })]);
    expect(partial).toMatchObject({ minutes: 300, knownJobs: 3, averageMinutes: 100 });
    expect(none).toMatchObject({ minutes: null, averageMinutes: null });
  });

  it("keeps invoices out of money received", () => {
    const mix = receiptMix([row({ invoiceCollectedPounds: 250, linkCollectedPounds: 50, unknownCollectionJobs: 1 })]);
    expect(mix.receivedTotal).toBe(950);
    expect(mix.invoiced).toBe(250);
    expect(mix.segments.map(segment => segment.key)).not.toContain("invoice");
    expect(mix.unverifiedJobs).toBe(1);
  });

  it("shares of completed jobs sum to one", () => {
    const shares = jobShares([row({ completed: 3 }), row({ initials: "TI", completed: 1 })]);
    expect(shares.reduce((sum, item) => sum + (item.share ?? 0), 0)).toBeCloseTo(1);
    expect(jobShares([row({ completed: 0 })])[0].share).toBeNull();
  });

  it("sorts unknown values last in both directions", () => {
    const rows = [row({ initials: "A", fullName: "Anna", totalCollectionsPounds: undefined }), row({ initials: "B", fullName: "Ben", totalCollectionsPounds: 100 }), row({ initials: "C", fullName: "Cy", totalCollectionsPounds: 300 })];
    expect(sortDrivers(rows, "receipts", "desc").map(r => r.initials)).toEqual(["C", "B", "A"]);
    expect(sortDrivers(rows, "receipts", "asc").map(r => r.initials)).toEqual(["B", "C", "A"]);
    expect(sortDrivers(rows, "name", "asc").map(r => r.initials)).toEqual(["A", "B", "C"]);
  });

  describe("charges trend", () => {
    const from = "2026-10-10", to = "2026-10-14";
    const buckets = bucketsFor(from, to, grainFor(from, to));
    it("buckets by London day and never invents a value for an empty day", () => {
      const rows = chargesTrend([job({}), job({ bookedStart: "2026-10-12T15:00:00Z", totalCharges: 5000, amountCharged: 4000 })], buckets, "day");
      const day = rows.find(item => item.key === "2026-10-12")!;
      expect(day).toMatchObject({ completed: 2, calculated: 150, final: 130 });
      expect(rows.find(item => item.key === "2026-10-11")).toMatchObject({ completed: 0, calculated: 0, final: 0 });
    });
    it("marks a day unknown when its completed jobs have no charge, and counts the gaps", () => {
      const rows = chargesTrend([job({ amountCharged: undefined as unknown as number })], buckets, "day");
      expect(rows.find(item => item.key === "2026-10-12")).toMatchObject({ final: null, finalMissing: 1, calculated: 100 });
    });
    it("treats a day that has not finished as not recorded yet, not as £0", () => {
      const rows = chargesTrend([job({})], buckets, "day", "2026-10-13");
      expect(rows.find(item => item.key === "2026-10-12")).toMatchObject({ completed: 1, final: 90 });
      expect(rows.find(item => item.key === "2026-10-13")).toMatchObject({ completed: 0, final: null, calculated: null });
      expect(rows.find(item => item.key === "2026-10-11")!.final).toBe(0);
    });
    it("ignores jobs that are not completed", () => {
      expect(chargesTrend([job({ status: "READY" })], buckets, "day").every(item => item.completed === 0)).toBe(true);
    });
    it("uses London midnight, including across the clocks going back on 25 Oct 2026", () => {
      const range = bucketsFor("2026-10-24", "2026-10-26", "day");
      const at = (iso: string) => job({ bookedStart: iso });
      const rows = chargesTrend([
        at("2026-10-24T22:30:00Z"), // 23:30 BST on the 24th
        at("2026-10-24T23:30:00Z"), // 00:30 BST on the 25th
        at("2026-10-25T23:30:00Z"), // 23:30 GMT on the 25th (the day is 25 hours long)
        at("2026-10-26T00:30:00Z")  // 00:30 GMT on the 26th
      ], range, "day");
      const count = (key: string) => rows.find(item => item.key === key)!.completed;
      expect([count("2026-10-24"), count("2026-10-25"), count("2026-10-26")]).toEqual([1, 2, 1]);
    });
  });

  it("reads the calculated charge from either stored total", () => {
    expect(calculatedPence(job({ totalCharges: undefined, calculatedTotalCharges: 700 } as Partial<NormalizedJob>))).toBe(700);
    expect(calculatedPence(job({ totalCharges: undefined } as Partial<NormalizedJob>))).toBeNull();
  });
});
