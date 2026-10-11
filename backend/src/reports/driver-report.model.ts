import { DateTime } from "luxon";
import type { Job } from "../jobs/job.types";
import { ExtraChargeType } from "../jobs/job.types";
import type { DriverJobSummaryDoc } from "../db/driver-job-summary.repo";
import { poundsToReportPence, reportPayments, validPence, addReportMoney } from "./report-payments";
import { jobReportTimings } from "./job-report-timings";
import type { EvidenceRecord } from "../jobs/job.types";

export function reportRange(from: unknown, to: unknown) {
  const parse = (value: unknown) => {
    if (typeof value !== "string") throw new RangeError("A report date range is required.");
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
    if (!dateOnly && !/(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) throw new RangeError("Report timestamps require explicit offsets.");
    const dt = DateTime.fromISO(value, { zone: dateOnly ? "Europe/London" : "utc", setZone: !dateOnly });
    if (!dt.isValid) throw new RangeError("Invalid report date.");
    return { dt, dateOnly };
  };
  const a = parse(from), b = parse(to);
  const end = b.dateOnly ? b.dt.plus({ days: 1 }) : b.dt;
  if (end <= a.dt || end.diff(a.dt, "days").days > 366) throw new RangeError("Report range must be positive and at most 366 days.");
  return { from: a.dt.toUTC().toISO()!, to: end.toUTC().toISO()!, timezone: "Europe/London", endExclusive: true };
}
export function reportPage(page: unknown = 1, size: unknown = 50) {
  const p = Number(page), s = Number(size);
  if (!Number.isSafeInteger(p) || p < 1 || p > 10000 || !Number.isSafeInteger(s) || s < 1 || s > 200) throw new RangeError("Invalid report pagination.");
  return { page: p, pageSize: s };
}
export function reportIdentity(job: Job, manual?: DriverJobSummaryDoc | null) {
  return job.reportIdentity ?? { initials: job.timeBilling?.driverInitials || manual?.driverInitials || job.driverInitials,
    email: manual?.driverEmail || null, name: null, vehicleImei: job.timeBilling?.vehicleImei || job.gpsliveImei || null,
    source: job.timeBilling ? "billing-snapshot" : manual ? "locked-manual" : "legacy-assignment" };
}
export function reportInstant(value: unknown): string | null {
  if (typeof value !== "string" || !/(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) return null;
  const parsed = DateTime.fromISO(value, { setZone: true });
  return parsed.isValid ? parsed.toUTC().toISO() : null;
}
export function operationalDate(job: Job): string | null {
  return (job.actualStartSource !== "completion-fallback" ? reportInstant(job.actualStart) : null) ?? reportInstant(job.bookedStart);
}
function minutes(from: string, to: string): number | null {
  if (!reportInstant(from) || !reportInstant(to)) return null;
  const duration = Date.parse(to) - Date.parse(from);
  return Number.isFinite(duration) && duration >= 0 ? duration / 60000 : null;
}
export function buildReportJob(job: Job, manual: DriverJobSummaryDoc | null, prepaymentConflict = false, evidence: EvidenceRecord[] = []) {
  const issues: string[] = [];
  const completed = job.status === "COMPLETED";
  const bookedStart = job.timeBilling?.bookedStart || job.bookedStart;
  const bookedFinish = job.timeBilling?.bookedFinish || job.bookedFinish;
  const systemCalculatedPence = job.timeBilling?.extraChargePence === null ? null : poundsToReportPence(job.calculatedTotalCharges ?? job.totalCharges);
  const acceptedPence = poundsToReportPence(job.amountCharged ?? job.totalCharges);
  const adjustmentNote = job.totalAdjustmentNote?.trim() || null;
  const expectedPence = completed ? adjustmentNote ? acceptedPence : systemCalculatedPence : null;
  if (completed && !adjustmentNote && acceptedPence !== systemCalculatedPence) issues.push("Accepted price differs from system calculation without a recorded adjustment reason.");
  const systemPayments = reportPayments(job.paymentBreakdown?.map(row => ({ method: row.method, amountPence: poundsToReportPence(row.amount) })),
    { method: job.paymentMethod, amountPence: acceptedPence, status: job.paymentStatus, invoiceExpectedPence: acceptedPence });
  const manualPayments = manual ? reportPayments(manual.paymentBreakdown?.map(row => ({ method: row.method, amountPence: row.amountPence })),
    { method: manual.paymentMethod, amountPence: manual.amountCollectedPence, status: "Collected" }) : null;
  if (manual?.noPaymentReceived) {
    if (manualPayments!.knownCollectedPence > 0) { manualPayments!.collectedPence = null; manualPayments!.issues.push("No-payment declaration conflicts with positive recorded receipts."); }
    else { manualPayments!.collectedPence = 0; manualPayments!.knownCollectedPence = 0; manualPayments!.issues = []; }
  }
  let separatePrepaymentPence = 0, prepaymentsVerified = true;
  if (prepaymentConflict) { prepaymentsVerified = false; issues.push("Prepayment reference is used on multiple jobs; a unique approved allocation is required."); }
  if (job.paidOnline && !job.confirmedPrepayments?.length && expectedPence !== manualPayments?.collectedPence) prepaymentsVerified = false;
  const seen = new Map<string, { amount: number; scope: string }>();
  for (const payment of job.confirmedPrepayments ?? []) {
    if (!payment.reference || !payment.confirmedBy || !reportInstant(payment.confirmedAt) || !validPence(payment.amountPence) || !["separate", "included"].includes(payment.manualScope)) { prepaymentsVerified = false; continue; }
    if (seen.has(payment.reference)) { if (seen.get(payment.reference)!.amount !== payment.amountPence || seen.get(payment.reference)!.scope !== payment.manualScope) prepaymentsVerified = false; continue; }
    seen.set(payment.reference, { amount: payment.amountPence, scope: payment.manualScope });
    if (payment.manualScope === "separate") separatePrepaymentPence = addReportMoney(separatePrepaymentPence, payment.amountPence);
  }
  if (!prepaymentsVerified) issues.push("Prepayment provenance or overlap with manual collections requires verification.");
  const recognizedCollectionPence = manualPayments?.collectedPence !== null && manualPayments?.collectedPence !== undefined && prepaymentsVerified ? addReportMoney(manualPayments.collectedPence, separatePrepaymentPence) : null;
  const signedDifferencePence = completed && expectedPence !== null && recognizedCollectionPence !== null ? expectedPence - recognizedCollectionPence : null;
  const systemVsManualCollectionDifferencePence = systemPayments.collectedPence !== null && manualPayments?.collectedPence !== null && manualPayments?.collectedPence !== undefined ? systemPayments.collectedPence - manualPayments.collectedPence : null;
  const paymentMethodDifferences = manualPayments ? Object.keys(systemPayments.byMethod).filter(method => method !== "Invoice" && method !== "Unknown" &&
    systemPayments.byMethod[method as keyof typeof systemPayments.byMethod] !== manualPayments.byMethod[method as keyof typeof manualPayments.byMethod]) : [];
  const verifiedBoundaries = job.actualStartSource !== "completion-fallback" && !["admin-manual", "completion-fallback"].includes(job.actualFinishSource ?? "");
  const workingMinutes = completed && verifiedBoundaries ? job.timeBilling?.actualMinutes ?? minutes(job.actualStart, job.actualFinish) : null;
  const manualMinutes = manual ? minutes(manual.startTime, manual.endTime) : null;
  const bookedMinutes = job.timeBilling?.scheduledMinutes ?? minutes(bookedStart, bookedFinish);
  const arrivalAt = job.trackerArrivalSource === "two-fresh-reports" ? job.trackerArrivalAt || job.actualStart : job.actualStart;
  const delay = verifiedBoundaries && Number.isFinite(Date.parse(arrivalAt)) && Number.isFinite(Date.parse(bookedStart)) ? Math.max(0, (Date.parse(arrivalAt) - Date.parse(bookedStart)) / 60000) : null;
  return { jobId: job.jobId, jobDetailsUrl: `/admin?section=jobs&job=${encodeURIComponent(job.jobId)}`, identity: reportIdentity(job, manual), status: job.status,
    customer: { name: job.customerName, email: job.customerEmail, phone: job.customerPhone }, pickup: job.pickup, dropoff: job.dropoff,
    operationalDate: operationalDate(job), bookedStart, bookedFinish, actualStart: job.actualStart || null, actualFinish: job.actualFinish || null,
    timings: jobReportTimings(job, evidence),
    actualStartSource: job.actualStartSource ?? null, actualFinishSource: job.actualFinishSource ?? null, trackerArrivalSource: job.trackerArrivalSource ?? null,
    firstEntryHints: job.congestionZoneEnteredAt || job.tunnelZoneEnteredAt ? { congestionAt: job.congestionZoneEnteredAt ?? null, tunnelAt: job.tunnelZoneEnteredAt ?? null,
      coverage: "first-entry-only-incomplete", eligibleForAutomaticCharges: false } : null,
    duration: { bookedMinutes, allocatedMinutes: job.timeBilling?.allocatedMinutes ?? null, workingMinutes, manualMinutes, differenceMinutes: workingMinutes !== null && manualMinutes !== null ? workingMinutes - manualMinutes : null,
      overtimeMinutes: job.timeBilling?.extraMinutes ?? job.overtimeMinutes ?? null, arrivalDelayMinutes: delay, arrivalSource: job.trackerArrivalSource === "two-fresh-reports" ? "verified-gps" : "proof-acceptance" },
    finance: { systemCalculatedPence, acceptedPence, expectedPence, adjustmentNote, systemPayments, manualPayments, separatePrepaymentPence, recognizedCollectionPence,
      signedDifferencePence, outstandingPence: signedDifferencePence === null ? null : Math.max(0, signedDifferencePence), excessCollectionPence: signedDifferencePence === null ? null : Math.max(0, -signedDifferencePence), systemVsManualCollectionDifferencePence, paymentMethodDifferences,
      prepaymentsVerified, paidOnlineFlagIsReceipt: false, knownCollectionDifferencePence: completed && expectedPence !== null && manualPayments?.collectedPence !== null && manualPayments?.collectedPence !== undefined ? expectedPence - manualPayments.collectedPence - separatePrepaymentPence : null,
      basePence: job.chargeSnapshot?.basePence ?? poundsToReportPence(job.basePrice), congestionPence: savedRoadFee(job, "congestion"), tunnelPence: savedRoadFee(job, "tunnel"), overtimePence: job.timeBilling?.extraChargePence ?? poundsToReportPence(job.overtimeCharge) },
    billingSnapshot: job.timeBilling ?? null, chargeSnapshot: job.chargeSnapshot ?? null, roadTariffSnapshot: job.roadTariffSnapshot ?? null,
    confirmedPrepayments: job.confirmedPrepayments ?? [],
    manualDetails: manual, manualStatus: manual ? "submitted-locked" : completed ? "pending-submission" : "not-completed", reviewSent: job.reviewEmailSent === true,
    issues: [...issues, ...systemPayments.issues, ...(manualPayments?.issues ?? []), ...(!manual && completed ? ["Manual details are missing; outstanding and manual hours are unknown."] : [])] };
}
export type ReportJob = ReturnType<typeof buildReportJob>;
function savedRoadFee(job: Job, type: "congestion" | "tunnel"): number | null {
  const field = type === "congestion" ? "congestionPence" : "tunnelPence";
  if (job.chargeSnapshot) return validPence(job.chargeSnapshot[field]) ? job.chargeSnapshot[field] : null;
  if (!Array.isArray(job.extraCharges)) return null;
  if (!job.extraCharges.includes(type === "congestion" ? ExtraChargeType.CONGESTION : ExtraChargeType.TUNNEL)) return 0;
  const amount = job.roadTariffSnapshot?.[field];
  return validPence(amount) ? amount! : null;
}

export function summarizeReportJobs(rows: ReportJob[]) {
  const completed = rows.filter(row => row.status === "COMPLETED");
  const sum = (select: (row: ReportJob) => number | null | undefined) => completed.reduce((total, row) => total + (select(row) ?? 0), 0);
  const sumMoney = (select: (row: ReportJob) => number | null | undefined) => completed.reduce((total, row) => addReportMoney(total, select(row) ?? 0), 0);
  const helpers = new Map<string, { name: string; hours: number; jobs: number }>();
  for (const row of completed) if (row.manualDetails?.helperName) {
    const name = row.manualDetails.helperName.trim(), key = name.toLowerCase();
    const current = helpers.get(key) ?? { name, hours: 0, jobs: 0 };
    current.hours += row.manualDetails.helperHours; current.jobs++; helpers.set(key, current);
  }
  const byMethod = Object.fromEntries(["Cash", "Card", "Link", "Bank Transfer", "Invoice", "Unknown"].map(method => [method,
    sumMoney(row => row.finance.systemPayments.byMethod[method as keyof typeof row.finance.systemPayments.byMethod]) ]));
  const totalChargeUnknownJobs = completed.filter(row => row.finance.systemCalculatedPence === null).length;
  const driverCollectionUnknownJobs = completed.filter(row => row.finance.acceptedPence === null).length;
  const overtimeChargesUnknownJobs = completed.filter(row => row.finance.overtimePence === null).length;
  const validManualRows = completed.filter(row => row.manualDetails && row.finance.manualPayments?.collectedPence != null &&
    validPence(row.manualDetails.amountCollectedPence) && row.manualDetails.amountCollectedPence === row.finance.manualPayments.collectedPence);
  const manualEntryUnknownJobs = completed.length - validManualRows.length;
  const manualEntryMissingJobs = completed.filter(row => !row.manualDetails).length;
  const driverCollectionKnownPence = sumMoney(row => row.finance.acceptedPence);
  const manualEntriesKnownPence = validManualRows.reduce((total, row) => addReportMoney(total, row.manualDetails!.amountCollectedPence), 0);
  const jobFlowTotalKnownPence = Object.values(byMethod).reduce(addReportMoney, 0);
  const jobFlowUnknownJobs = completed.filter(row => row.finance.systemPayments.issues.length > 0).length;
  const paymentCards = {
    basis: "driver-charged-minus-manual-form-collections", endExclusive: true,
    totalChargesPence: totalChargeUnknownJobs ? null : sumMoney(row => row.finance.systemCalculatedPence), totalChargeUnknownJobs,
    driverCollectionPence: driverCollectionUnknownJobs ? null : driverCollectionKnownPence, driverCollectionUnknownJobs,
    manualEntriesPence: manualEntryUnknownJobs ? null : manualEntriesKnownPence, manualEntriesKnownPence, manualEntryUnknownJobs, manualEntryMissingJobs,
    outstandingPence: driverCollectionUnknownJobs || manualEntryUnknownJobs ? null : driverCollectionKnownPence - manualEntriesKnownPence,
    adjustmentReasons: completed.filter(row => !!row.finance.adjustmentNote).map(row => ({ jobId: row.jobId,
      reason: row.finance.adjustmentNote!, calculatedPence: row.finance.systemCalculatedPence, driverCollectionPence: row.finance.acceptedPence })),
    jobFlowTotalPence: jobFlowUnknownJobs ? null : jobFlowTotalKnownPence, jobFlowTotalKnownPence, jobFlowUnknownJobs
  };
  return { assignedJobs: rows.length, completedJobs: completed.length, cancelledJobs: rows.filter(row => row.status === "CANCELLED").length,
    paymentCards,
    roadChargeTotals: {
      congestionPence: completed.some(row => row.finance.congestionPence === null) ? null : sumMoney(row => row.finance.congestionPence),
      tunnelPence: completed.some(row => row.finance.tunnelPence === null) ? null : sumMoney(row => row.finance.tunnelPence),
      congestionUnknownJobs: completed.filter(row => row.finance.congestionPence === null).length,
      tunnelUnknownJobs: completed.filter(row => row.finance.tunnelPence === null).length
    },
    expectedKnownPence: sumMoney(row => row.finance.expectedPence), expectedUnknownJobs: completed.filter(row => row.finance.expectedPence === null).length,
    systemCollectionsCompletePence: completed.some(row => row.finance.systemPayments.collectedPence === null) ? null : sumMoney(row => row.finance.systemPayments.collectedPence),
    outstandingCompletePence: completed.some(row => row.finance.outstandingPence === null) ? null : sumMoney(row => row.finance.outstandingPence),
    systemKnownCollectionsPence: sumMoney(row => row.finance.systemPayments.knownCollectedPence), unknownSystemCollectionJobs: completed.filter(row => row.finance.systemPayments.collectedPence === null).length,
    recognizedKnownCollectionsPence: sumMoney(row => row.finance.recognizedCollectionPence), outstandingKnownPence: sumMoney(row => row.finance.outstandingPence), excessCollectionKnownPence: sumMoney(row => row.finance.excessCollectionPence),
    outstandingUnknownJobs: completed.filter(row => row.finance.outstandingPence === null).length, pendingManualJobs: completed.filter(row => !row.manualDetails).length,
    systemPaymentsByMethodPence: byMethod, workingMinutesKnown: sum(row => row.duration.workingMinutes), workingMinutesUnknownJobs: completed.filter(row => row.duration.workingMinutes === null).length,
    manualMinutesKnown: sum(row => row.duration.manualMinutes), manualMinutesUnknownJobs: completed.filter(row => row.duration.manualMinutes === null).length,
    overtimeChargesPence: overtimeChargesUnknownJobs ? null : sumMoney(row => row.finance.overtimePence), overtimeChargesUnknownJobs,
    overtimeMinutesKnown: sum(row => row.duration.overtimeMinutes), overtimeMinutesUnknownJobs: completed.filter(row => row.duration.overtimeMinutes === null).length,
    arrivalDelayMinutesKnown: sum(row => row.duration.arrivalDelayMinutes),
    reviewSentJobs: completed.filter(row => row.reviewSent).length, reviewNotSentJobs: completed.filter(row => !row.reviewSent).length,
    helpers: [...helpers.values()], helperHoursKnown: [...helpers.values()].reduce((total, helper) => total + helper.hours, 0),
    discrepancies: completed.filter(row => row.finance.paymentMethodDifferences.length || row.finance.signedDifferencePence || row.finance.systemVsManualCollectionDifferencePence || (row.duration.differenceMinutes !== null && Math.abs(row.duration.differenceMinutes) > 0.000001)).length };
}
export function reportTrends(rows: ReportJob[], groupBy: "day" | "week" | "month") {
  const groups = new Map<string, ReportJob[]>();
  for (const row of rows) if (row.operationalDate) {
    const key = reportPeriod(row.operationalDate, groupBy);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([period, jobs]) => ({ period, ...summarizeReportJobs(jobs) }));
}
export function reportPeriod(instant: string, groupBy: "day" | "week" | "month") {
  const date = DateTime.fromISO(instant).setZone("Europe/London");
  return (groupBy === "week" ? date.startOf("week") : date).toFormat(groupBy === "month" ? "yyyy-MM" : "yyyy-MM-dd");
}
