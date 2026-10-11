import { describe, expect, it } from "vitest";
import { buildReportJob, manualRoadFee, operationalDate, reportIdentity, reportPage, reportRange, reportTrends, summarizeReportJobs } from "../src/reports/driver-report.model";
import { normalizedPayments, reportPayments } from "../src/reports/report-payments";
import type { Job } from "../src/jobs/job.types";
import { JobStatus } from "../src/jobs/job.types";
import type { DriverJobSummaryDoc } from "../src/db/driver-job-summary.repo";
const job = (changes: Partial<Job> = {}): Job => ({ jobId: "JOB", status: "COMPLETED", driverInitials: "AB", bookedStart: "2026-10-09T09:00:00Z", bookedFinish: "2026-10-09T10:30:00Z", actualStart: "2026-10-09T09:00:00Z", actualFinish: "2026-10-09T11:00:00Z", basePrice: 250, totalCharges: 250, calculatedTotalCharges: 250, amountCharged: 250, paymentMethod: "Cash", paymentStatus: "Paid", paymentBreakdown: [{ method: "Cash", amount: 250 }], overtimeCharge: 0, overtimeMinutes: 0, ...changes } as Job);
const manual = (amount = 25000, changes: Partial<DriverJobSummaryDoc> = {}): DriverJobSummaryDoc => ({ jobId: "JOB", driverInitials: "AB", driverEmail: "ab@example.com", startTime: "2026-10-09T09:00:00Z", endTime: "2026-10-09T11:00:00Z", amountCollectedPence: amount, paymentMethod: "Cash", paymentBreakdown: [{ method: "Cash", amountPence: amount }], helperName: "", helperHours: 0, ...changes } as DriverJobSummaryDoc);
describe("Split payment receipt accounting", () => {
  it("categorizes each split separately, including Link, excluding unpaid invoices", () => {
    expect(reportPayments([{ method: "Cash", amountPence: 10000 }, { method: "Card", amountPence: 5000 }, { method: "Link", amountPence: 2000 }, { method: "Bank Transfer", amountPence: 3000 }, { method: "Invoice", amountPence: 5000 }])).toMatchObject({ collectedPence: 20000, invoicePence: 5000, byMethod: { Cash: 10000, Card: 5000, Link: 2000, "Bank Transfer": 3000 } });
  });
  it("does not guess ambiguous combined methods, a generated link or missing receipts", () => {
    expect(reportPayments([{ method: "Invoice/Transfer", amountPence: 25000 }]).collectedPence).toBeNull();
    expect(reportPayments(undefined, { method: "Link", amountPence: 25000, status: "Link Sent" }).collectedPence).toBeNull();
    expect(reportPayments(undefined, { method: "Cash + Card", amountPence: 25000, status: "Paid" }).collectedPence).toBeNull();
  });
  it("distinguishes explicit zero, invalid money and derived invoice placeholders", () => {
    expect(reportPayments([{ method: "Cash", amountPence: 0 }]).collectedPence).toBe(0);
    expect(reportPayments([{ method: "Cash", amountPence: -1 }]).collectedPence).toBeNull();
    expect(reportPayments([{ method: "Cash", amountPence: 10000 }, { method: "Invoice", amountPence: 0 }], { method: "Cash + Invoice", amountPence: 25000, invoiceExpectedPence: 25000 })).toMatchObject({ collectedPence: 10000, invoicePence: 15000, invoiceBasis: "derived-uncollected-bill-balance" });
  });
  it("uses the same receipt calculator for normalized summary consumers", () => {
    expect(normalizedPayments({ paymentMethod: "Cash + Card", amountCharged: 25000, paymentBreakdown: [{ method: "Cash", amount: 10000 }, { method: "Card", amount: 15000 }] }).byMethod).toMatchObject({ Cash: 10000, Card: 15000 });
  });
  it("fails explicitly rather than rounding an unsafe monetary sum", () => {
    expect(() => reportPayments([{ method: "Cash", amountPence: Number.MAX_SAFE_INTEGER }, { method: "Card", amountPence: 100 }])).toThrow("integer precision");
  });
});
describe("Per-job reconciliation", () => {
  it("sums manual road charges across completed jobs without mixing missing, legacy and invalid entries with zero", () => {
    const reported = manual(25000, { chargeItems: [{ type: "tunnel", amountPence: 1360 }, { type: "tunnel", amountPence: 1360 }, { type: "congestion", amountPence: 1800 }] });
    const rows = [buildReportJob(job(), reported), buildReportJob(job({ jobId: "ZERO" }), manual(25000, { chargeItems: [] })),
      buildReportJob(job({ jobId: "MISSING" }), null), buildReportJob(job({ jobId: "LEGACY" }), manual(25000, { congestionCharge: false })),
      buildReportJob(job({ jobId: "INVALID" }), manual(25000, { chargeItems: [{ type: "tunnel", amountPence: -1 }] })),
      buildReportJob(job({ status: JobStatus.IN_PROGRESS }), reported)];
    expect(summarizeReportJobs(rows).manualRoadChargeTotals).toEqual({
      tunnel: { knownPence: 2720, knownJobs: 2, missingJobs: 1, unavailableJobs: 2 },
      congestion: { knownPence: 1800, knownJobs: 4, missingJobs: 1, unavailableJobs: 0 } });
    expect(manualRoadFee(null, "tunnel")).toBeNull();
    expect(manualRoadFee(manual(25000, { congestionCharge: true, congestionChargePence: 1800 }), "congestion")).toBe(1800);
  });
  it("aggregates saved job road fees without using GPS estimates or including unfinished jobs", () => {
    const snapshot = { basePence: 25000, congestionPence: 1800, tunnelPence: 2720 } as NonNullable<Job["chargeSnapshot"]>;
    const rows = [buildReportJob(job({ chargeSnapshot: snapshot }), null), buildReportJob(job({ jobId: "ZERO", extraCharges: [] }), null),
      buildReportJob(job({ jobId: "ACTIVE", status: JobStatus.IN_PROGRESS, chargeSnapshot: snapshot }), null)];
    expect(summarizeReportJobs(rows).roadChargeTotals).toEqual({ congestionPence: 1800, tunnelPence: 2720, congestionUnknownJobs: 0, tunnelUnknownJobs: 0 });
    expect(summarizeReportJobs([]).roadChargeTotals).toMatchObject({ congestionPence: 0, tunnelPence: 0 });
  });
  it("uses saved legacy tariffs for selected fees and keeps genuinely missing rates unknown", () => {
    const legacy = buildReportJob(job({ extraCharges: ["London Congestion charge", "Tunnel Charges"], roadTariffSnapshot: { congestionPence: 1800, tunnelPence: 1360 } as Job["roadTariffSnapshot"] }), null);
    expect(legacy.finance).toMatchObject({ congestionPence: 1800, tunnelPence: 1360 });
    const missing = buildReportJob(job({ extraCharges: ["Tunnel Charges"] }), null);
    expect(summarizeReportJobs([missing]).roadChargeTotals).toMatchObject({ congestionPence: 0, tunnelPence: null, tunnelUnknownJobs: 1 });
  });
  it("shows available road-charge subtotals even when other completed jobs have missing amounts", () => {
    const known = buildReportJob(job({ chargeSnapshot: { basePence: 25000, congestionPence: 1800, tunnelPence: 1360 } }), null);
    const missing = buildReportJob(job({ jobId: "MISSING", extraCharges: ["London Congestion charge", "Tunnel Charges"] }), null);
    expect(summarizeReportJobs([known, missing]).roadChargeTotals).toEqual({ congestionPence: 1800, tunnelPence: 1360, congestionUnknownJobs: 1, tunnelUnknownJobs: 1 });
    const zero = buildReportJob(job({ jobId: "ZERO", extraCharges: [] }), null);
    expect(summarizeReportJobs([zero, missing]).roadChargeTotals).toMatchObject({ congestionPence: 0, tunnelPence: 0, congestionUnknownJobs: 1, tunnelUnknownJobs: 1 });
    expect(summarizeReportJobs([missing]).roadChargeTotals).toMatchObject({ congestionPence: null, tunnelPence: null, congestionUnknownJobs: 1, tunnelUnknownJobs: 1 });
  });
  it("totals saved overtime money and hours across completed jobs only", () => {
    const rows = [buildReportJob(job({ overtimeCharge: 55, overtimeMinutes: 30 }), null),
      buildReportJob(job({ jobId: "OTHER", overtimeCharge: 110, overtimeMinutes: 60 }), null),
      buildReportJob(job({ jobId: "ACTIVE", status: JobStatus.IN_PROGRESS, overtimeCharge: 999, overtimeMinutes: 999 }), null)];
    expect(summarizeReportJobs(rows)).toMatchObject({ overtimeChargesPence: 16500, overtimeChargesUnknownJobs: 0, overtimeMinutesKnown: 90, overtimeMinutesUnknownJobs: 0 });
    expect(summarizeReportJobs([])).toMatchObject({ overtimeChargesPence: 0, overtimeMinutesKnown: 0 });
  });
  it("does not turn missing overtime charges or hours into confirmed zero totals", () => {
    const missing = buildReportJob(job({ overtimeCharge: undefined, overtimeMinutes: undefined }), null);
    expect(summarizeReportJobs([missing])).toMatchObject({ overtimeChargesPence: null, overtimeChargesUnknownJobs: 1, overtimeMinutesUnknownJobs: 1 });
  });
  it("summarizes the requested four payment cards without adding confirmed prepayments", () => {
    const row = buildReportJob(job({ calculatedTotalCharges: 326.6, totalCharges: 326.6, amountCharged: 50,
      totalAdjustmentNote: "Agreed adjustment", paidOnline: true,
      paymentBreakdown: [{ method: "Cash", amount: 100 }, { method: "Card", amount: 80 }, { method: "Invoice", amount: 20 }],
      confirmedPrepayments: [{ reference: "separate", amountPence: 1000, confirmedAt: "2026-10-09T08:00:00Z", confirmedBy: "office", manualScope: "separate" }]
    }), manual(18000));
    expect(summarizeReportJobs([row]).paymentCards).toMatchObject({ totalChargesPence: 32660, driverCollectionPence: 5000,
      manualEntriesPence: 18000, outstandingPence: -13000, jobFlowTotalPence: 20000,
      adjustmentReasons: [{ jobId: "JOB", reason: "Agreed adjustment", calculatedPence: 32660, driverCollectionPence: 5000 }] });
  });
  it("keeps missing manual cards unknown while excluding incomplete jobs", () => {
    const complete = buildReportJob(job(), null);
    const active = buildReportJob(job({ jobId: "ACTIVE", status: JobStatus.IN_PROGRESS }), manual(99900));
    expect(summarizeReportJobs([complete, active]).paymentCards).toMatchObject({ totalChargesPence: 25000,
      driverCollectionPence: 25000, manualEntriesPence: null, outstandingPence: null, manualEntryUnknownJobs: 1 });
  });
  it("reports the available manual subtotal and missing count across the full range", () => {
    const submitted = buildReportJob(job({ jobId: "SUBMITTED" }), manual(18000));
    const missing = buildReportJob(job({ jobId: "MISSING" }), null);
    expect(summarizeReportJobs([submitted, missing]).paymentCards).toMatchObject({ manualEntriesKnownPence: 18000,
      manualEntriesPence: null, manualEntryUnknownJobs: 1, manualEntryMissingJobs: 1, outstandingPence: null });
  });
  it("calculates signed full-range entry balances and preserves explicit zeros", () => {
    const rows = [buildReportJob(job(), manual(22000)), buildReportJob(job({ jobId: "OTHER" }), manual(28000)),
      buildReportJob(job({ jobId: "FREE", amountCharged: 0, calculatedTotalCharges: 0, totalCharges: 0,
        paymentBreakdown: [{ method: "Cash", amount: 0 }] }), manual(0))];
    expect(summarizeReportJobs(rows).paymentCards).toMatchObject({ totalChargesPence: 50000, driverCollectionPence: 50000,
      manualEntriesPence: 50000, outstandingPence: 0 });
    expect(summarizeReportJobs([]).paymentCards).toMatchObject({ totalChargesPence: 0, driverCollectionPence: 0, manualEntriesPence: 0, outstandingPence: 0 });
  });
  it("does not silently accept inconsistent manual sums or invalid job-flow totals", () => {
    expect(summarizeReportJobs([buildReportJob(job({ paymentBreakdown: [{ method: "Card", amount: -1 }] }),
      manual(25000, { amountCollectedPence: 99900 }))]).paymentCards).toMatchObject({ manualEntriesPence: null,
      manualEntriesKnownPence: 0, manualEntryMissingJobs: 0, outstandingPence: null, manualEntryUnknownJobs: 1, jobFlowTotalPence: null, jobFlowUnknownJobs: 1 });
  });
  it.each([[25000, 0, 0], [22000, 3000, 0], [28000, 0, 3000]])("reconciles %i pence without netting shortfall and excess", (amount, outstanding, excess) => {
    expect(buildReportJob(job(), manual(amount)).finance).toMatchObject({ outstandingPence: outstanding, excessCollectionPence: excess });
  });
  it("does not offset one job's shortfall with another job's excess", () => {
    expect(summarizeReportJobs([buildReportJob(job(), manual(22000)), buildReportJob(job({ jobId: "OTHER" }), manual(28000))])).toMatchObject({ outstandingKnownPence: 3000, excessCollectionKnownPence: 3000 });
  });
  it("marks missing manual entries as pending/unknown rather than zero payment", () => {
    expect(buildReportJob(job(), null)).toMatchObject({ manualStatus: "pending-submission", finance: { outstandingPence: null, recognizedCollectionPence: null } });
    expect(summarizeReportJobs([buildReportJob(job(), null)])).toMatchObject({ pendingManualJobs: 1, outstandingCompletePence: null });
  });
  it("flags equal-total method discrepancies", () => {
    const row = buildReportJob(job(), manual(25000, { paymentBreakdown: [{ method: "Card", amountPence: 25000 }] }));
    expect(row.finance.signedDifferencePence).toBe(0);
    expect(row.finance.paymentMethodDifferences).toEqual(["Cash", "Card"]);
  });
  it("applies documented price adjustments without repricing saved automatic charges", () => {
    expect(buildReportJob(job({ amountCharged: 220, totalCharges: 220, totalAdjustmentNote: "Agreed discount" }), manual(22000)).finance).toMatchObject({ systemCalculatedPence: 25000, expectedPence: 22000, outstandingPence: 0 });
  });
  it("counts confirmed separate prepayments once and does not add included prepayments again", () => {
    const prepaid = { reference: "receipt", amountPence: 10000, confirmedAt: "2026-10-09T08:00:00Z", confirmedBy: "office", manualScope: "separate" as const };
    expect(buildReportJob(job({ confirmedPrepayments: [prepaid, prepaid] }), manual(15000)).finance).toMatchObject({ recognizedCollectionPence: 25000, outstandingPence: 0 });
    expect(buildReportJob(job({ confirmedPrepayments: [{ ...prepaid, manualScope: "included" }] }), manual()).finance.recognizedCollectionPence).toBe(25000);
  });
  it("does not infer a prepaid amount from a paid-online flag or conflicting receipt scopes", () => {
    expect(buildReportJob(job({ paidOnline: true }), manual(15000)).finance).toMatchObject({ outstandingPence: null, knownCollectionDifferencePence: 10000 });
    const p = { reference: "same", amountPence: 10000, confirmedAt: "2026-10-09T08:00:00Z", confirmedBy: "office", manualScope: "separate" as const };
    expect(buildReportJob(job({ confirmedPrepayments: [p, { ...p, manualScope: "included" }] }), manual()).finance.outstandingPence).toBeNull();
  });
  it("keeps fees already included in the saved total from being added twice", () => {
    expect(buildReportJob(job({ calculatedTotalCharges: 268, amountCharged: 268, totalCharges: 268, chargeSnapshot: { basePence: 25000, congestionPence: 1800, tunnelPence: 0 } }), manual(26800)).finance.outstandingPence).toBe(0);
  });
  it("does not invent an automatic price when the frozen overtime rate is unknown", () => {
    expect(buildReportJob(job({ timeBilling: { extraChargePence: null } as Job["timeBilling"] }), manual()).finance.outstandingPence).toBeNull();
  });
  it("does not accept malformed/naive recorded work times as measured hours", () => {
    expect(buildReportJob(job({ actualStart: "2026-10-09 09:00:00" }), manual()).duration.workingMinutes).toBeNull();
  });
  it("keeps fallback working hours unknown and optional helper totals separate", () => {
    const row = buildReportJob(job({ actualFinishSource: "admin-manual" }), manual(25000, { helperName: "Thiago", helperHours: 2.5 }));
    expect(row.duration.workingMinutes).toBeNull();
    expect(summarizeReportJobs([row])).toMatchObject({ workingMinutesUnknownJobs: 1, manualMinutesKnown: 120, helperHoursKnown: 2.5 });
  });
  it("uses frozen historical ownership before mutable job assignments", () => {
    const frozen = job({ driverInitials: "NEW", reportIdentity: { initials: "OLD", email: null, name: "Original", vehicleImei: "123", source: "completion-snapshot" } });
    expect(reportIdentity(frozen).initials).toBe("OLD");
  });
  it("preserves original Calendar duration/time from the billing snapshot after a later edit", () => {
    const row = buildReportJob(job({ bookedStart: "2026-10-10T09:00:00Z", bookedFinish: "2026-10-10T14:00:00Z",
      timeBilling: { bookedStart: "2026-10-09T09:00:00Z", bookedFinish: "2026-10-09T10:30:00Z", scheduledMinutes: 90, extraChargePence: 0 } as Job["timeBilling"] }), manual());
    expect(row.bookedStart).toBe("2026-10-09T09:00:00Z"); expect(row.duration.bookedMinutes).toBe(90);
  });
});
describe("Report range, date and trend basis", () => {
  it("uses London midnight and an exclusive next-day end for inclusive date filters", () => {
    expect(reportRange("2026-10-09", "2026-10-09")).toMatchObject({ from: "2026-10-08T23:00:00.000Z", to: "2026-10-09T23:00:00.000Z" });
    expect(reportRange("2026-10-25", "2026-10-25")).toMatchObject({ from: "2026-10-24T23:00:00.000Z", to: "2026-10-26T00:00:00.000Z" });
  });
  it("rejects invalid/unbounded/naive ranges and pagination", () => {
    expect(() => reportRange("2026-02-30", "2026-03-01")).toThrow();
    expect(() => reportRange("2020-01-01", "2026-01-01")).toThrow();
    expect(() => reportRange("2026-10-09T10:00:00", "2026-10-09T12:00:00Z")).toThrow();
    expect(() => reportPage(0, 25)).toThrow(); expect(() => reportPage(1, 201)).toThrow();
  });
  it("uses booking date for fallback starts and London periods for trends", () => {
    expect(operationalDate(job({ actualStartSource: "completion-fallback", actualStart: "2026-10-12T12:00:00Z" }))).toBe("2026-10-09T09:00:00.000Z");
    expect(reportTrends([buildReportJob(job({ actualStart: "2026-10-09T23:30:00Z" }), manual())], "day")[0].period).toBe("2026-10-10");
  });
});
