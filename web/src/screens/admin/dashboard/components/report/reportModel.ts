/**
 * Driver-report semantics in one place, so every tab and export uses the same words.
 *
 * Money (traced from the report API and the driver workflow):
 * - Calculated charge  = finance.systemCalculatedPence (system pricing)
 * - Final charge       = finance.acceptedPence (entered at completion; may include an
 *                        amount left to invoice). Previously labelled "Driver Collected".
 * - Recorded receipts  = finance.systemPayments.collectedPence (job-flow receipts, no invoices)
 * - Unpaid invoice     = finance.systemPayments.invoicePence
 * - Driver-reported    = finance.manualPayments.collectedPence (post-job submission; null = not submitted)
 * - Reconciliation difference = final charge − driver-reported amount. This is not
 *   customer debt; it is unknown whenever either side is unknown.
 */
import type { DriverReport, DriverReportJob } from "../../driverReport.types";
import type { Tone } from "../ds";

export type ReconStatus = "missing" | "verify" | "difference" | "invoice" | "match";

export interface Reconciliation {
  status: ReconStatus;
  label: string;
  tone: Tone;
  /** Plain-language reason for the list, e.g. "Driver submission missing; difference can't be calculated yet". */
  reason: string;
  finalPence: number | null;
  driverPence: number | null;
  /** final − driver; null whenever either operand is unknown. */
  differencePence: number | null;
  differences: string[];
}

export const RECON_META: Record<ReconStatus, { label: string; tone: Tone }> = {
  missing: { label: "Submission missing", tone: "warning" },
  verify: { label: "Needs verification", tone: "warning" },
  difference: { label: "Difference", tone: "danger" },
  invoice: { label: "Invoice pending", tone: "info" },
  match: { label: "Hours match", tone: "success" }
};

/**
 * Reconciliation is about hours (the TMV rule): a job is a discrepancy when the driver
 * reported at least 30 minutes more than the system working time. Amounts are shown for
 * reference and never raise a discrepancy on their own.
 */
export const HOURS_DISCREPANCY_MINUTES = 30;

export function hasHoursDiscrepancy(job: DriverReportJob): boolean {
  const { workingMinutes, manualMinutes } = job.duration;
  return !!job.manualDetails && workingMinutes !== null && manualMinutes !== null && manualMinutes - workingMinutes >= HOURS_DISCREPANCY_MINUTES;
}

export function reconcile(job: DriverReportJob, _gpsAvailable: boolean): Reconciliation {
  const finance = job.finance, manual = job.manualDetails;
  const finalPence = finance.acceptedPence;
  const driverPence = manual ? finance.manualPayments?.collectedPence ?? null : null;
  const differencePence = finalPence !== null && driverPence !== null ? finalPence - driverPence : null;
  const base = { finalPence, driverPence, differencePence };
  if (!manual) {
    return { ...base, status: "missing", ...RECON_META.missing, reason: "Driver submission missing — hours can't be compared yet.", differences: [] };
  }
  if (hasHoursDiscrepancy(job)) {
    const minutes = (job.duration.manualMinutes ?? 0) - (job.duration.workingMinutes ?? 0);
    return { ...base, status: "difference", ...RECON_META.difference, reason: `Driver reported ${Math.round(minutes)} min more than the system working time`, differences: ["Reported hours"] };
  }
  if (job.duration.workingMinutes === null || job.duration.manualMinutes === null) {
    return { ...base, status: "verify", ...RECON_META.verify, reason: "Can't fully compare: working or reported hours unknown", differences: [] };
  }
  if (finance.systemPayments.invoicePence > 0) {
    return { ...base, status: "invoice", ...RECON_META.invoice, reason: "Hours agree; an invoice is pending for this job.", differences: [] };
  }
  return { ...base, status: "match", ...RECON_META.match, reason: "Reported hours agree with the system working time.", differences: [] };
}

export type ArrivalStatus = "on-time" | "late" | "unverified";

/** Punctuality is only scored from a verified tracker arrival; missing or stale
 *  tracker data is "Unverified", never on time and never late. */
export function arrival(job: DriverReportJob): { status: ArrivalStatus; label: string; tone: Tone; minutes: number | null; reason?: string } {
  const at = job.timings?.trackerArrivalAt;
  const minutes = job.duration.arrivalDelayMinutes;
  if (!at || minutes === null || job.duration.arrivalSource === "unavailable") {
    return { status: "unverified", label: "Unverified", tone: "neutral", minutes: null, reason: job.timings?.trackerUnverifiedReason || "No verified tracker arrival" };
  }
  if (minutes > 0) return { status: "late", label: "Late", tone: "warning", minutes };
  return { status: "on-time", label: "On time", tone: "success", minutes };
}

/** Gap between tracker arrival and the proof-of-arrival photo, when 15+ minutes. */
export function arrivalProofGap(job: DriverReportJob): number | null {
  const start = job.timings?.trackerArrivalAt, end = job.timings?.proofPhotoAt;
  if (!start || !end) return null;
  const minutes = Math.floor((Date.parse(end) - Date.parse(start)) / 60_000);
  return Number.isFinite(minutes) && minutes >= 15 ? minutes : null;
}

export interface ReportException { id: string; jobId: string | null; title: string; detail: string; target: "reconcile" | "timings" | "road" }

/** Exceptions for the Summary tab, from the jobs loaded on this page. */
export function reportExceptions(report: DriverReport, gpsAvailable: boolean): ReportException[] {
  const out: ReportException[] = [];
  for (const job of report.jobs.items) {
    const recon = reconcile(job, gpsAvailable);
    if (recon.status === "missing") out.push({ id: `missing:${job.jobId}`, jobId: job.jobId, title: "Missing driver submission", detail: job.customer.name, target: "reconcile" });
    else if (recon.status === "difference") out.push({ id: `diff:${job.jobId}`, jobId: job.jobId, title: "Reported hours differ from system hours", detail: `${job.customer.name} · ${recon.differences.join(", ")}`, target: "reconcile" });
    const arrive = arrival(job);
    if (arrive.status === "unverified") out.push({ id: `arrival:${job.jobId}`, jobId: job.jobId, title: "Arrival unverified", detail: `${job.customer.name} · ${arrive.reason}`, target: "timings" });
    const gap = arrivalProofGap(job);
    if (gap !== null) out.push({ id: `gap:${job.jobId}`, jobId: job.jobId, title: `Proof photo ${gap} min after arrival`, detail: job.customer.name, target: "timings" });
  }
  const unlinked = report.roadAlerts?.items.filter(row => !row.jobId).length ?? 0;
  if (unlinked) out.push({ id: "unlinked-road", jobId: null, title: `${unlinked} road event${unlinked === 1 ? " needs" : "s need"} a job match`, detail: "Zone entries the system could not link to a job", target: "road" });
  return out;
}

export interface SummaryCoverage { lines: string[]; complete: boolean }

/** One consolidated coverage line instead of scattered red notes (audit p.9). */
export function summaryCoverage(report: DriverReport, gps: { loading: boolean; error?: string }): SummaryCoverage {
  const s = report.summary, lines: string[] = [];
  const completed = s.completedJobs;
  const timed = completed - s.workingMinutesUnknownJobs;
  if (s.workingMinutesUnknownJobs) lines.push(`${timed} of ${completed} completed jobs have complete timings`);
  if (s.pendingManualJobs) lines.push(`${s.pendingManualJobs} driver submission${s.pendingManualJobs === 1 ? "" : "s"} missing`);
  if (s.unknownSystemCollectionJobs) lines.push(`${s.unknownSystemCollectionJobs} job${s.unknownSystemCollectionJobs === 1 ? "" : "s"} with unverified receipts`);
  if (gps.loading) lines.push("GPS movement and zone activity are loading");
  else if (gps.error) lines.push("movement and road-charge details could not be loaded");
  else if (!gps.loading && s.movingUnknownJobs) lines.push(`movement data unavailable for ${s.movingUnknownJobs} job${s.movingUnknownJobs === 1 ? "" : "s"}`);
  if (!report.meta.financialTotalsCoverAllMatchingJobs) lines.push("financial totals do not cover every matching job");
  return { lines, complete: lines.length === 0 };
}
