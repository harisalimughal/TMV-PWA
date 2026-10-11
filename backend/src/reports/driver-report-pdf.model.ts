import { DateTime } from "luxon";
import type { ExportReport } from "./driver-report-export.model";

export interface PdfTable { title: string; headers: string[]; widths: number[]; rows: string[][]; note?: string }
export interface PdfSection { name: string; tables: PdfTable[] }
const money = (value: number | null | undefined) => value == null || !Number.isSafeInteger(value) ? "Not recorded" : `GBP ${(value / 100).toFixed(2)}`;
const time = (minutes: number | null | undefined) => minutes == null ? "Not recorded" : `${Math.floor(Math.round(minutes) / 60)}h ${Math.round(minutes) % 60}m`;
const stamp = (value: string | null | undefined) => {
  const parsed = value ? DateTime.fromISO(value).setZone("Europe/London") : null;
  return parsed?.isValid ? parsed.toFormat("dd MMM, HH:mm") : "Not recorded";
};
const table = (title: string, headers: string[], widths: number[], rows: string[][], note?: string): PdfTable => ({ title, headers, widths, rows, note });
const metrics = (title: string, rows: string[][], note?: string) => table(title, ["Item", "Total", "Item", "Total"], [2, 1, 2, 1],
  rows.filter((_, index) => index % 2 === 0).map((row, index) => [...row, ...(rows[index * 2 + 1] ?? ["", ""])]), note);

/** Explicit PDF fields only; the comprehensive Excel/audit projection is deliberately separate. */
export function driverPdfSections(report: ExportReport): PdfSection[] {
  const s = report.summary, cards = s.paymentCards;
  const jobs = report.jobs;
  const manualAmount = (job: typeof jobs[number]) => job.manualDetails ? money(job.finance.manualPayments?.collectedPence) : "Not submitted";
  const manualMethods: Record<string, number> = {};
  for (const job of jobs.filter(row => row.status === "COMPLETED" && row.manualDetails && row.finance.manualPayments?.collectedPence != null && row.manualDetails.amountCollectedPence === row.finance.manualPayments.collectedPence)) for (const [method, amount] of Object.entries(job.finance.manualPayments?.byMethod ?? {})) manualMethods[method] = (manualMethods[method] ?? 0) + amount;
  const methods = [...new Set([...Object.keys(s.systemPaymentsByMethodPence), ...Object.keys(manualMethods)])].filter(method => s.systemPaymentsByMethodPence[method] || manualMethods[method]);
  const missingManual = cards?.manualEntryUnknownJobs ?? s.pendingManualJobs;
  const manualNote = missingManual ? `${missingManual} manual ${missingManual === 1 ? "entry is" : "entries are"} missing or incomplete. Available manual amounts are shown.` : undefined;
  const feeComparisons = jobs.flatMap(job => (["congestion", "tunnel"] as const).flatMap(type => {
    const saved = type === "congestion" ? job.finance.congestionPence : job.finance.tunnelPence;
    const manual = job.manualDetails, entries = manual?.chargeItems?.filter(row => row.type === type);
    if (!saved && !entries?.length && !(type === "congestion" && manual?.congestionCharge)) return [];
    const amount = entries ? entries.some(row => row.amountPence == null || !Number.isSafeInteger(row.amountPence) || row.amountPence < 0) ? null : entries.reduce((sum, row) => sum + row.amountPence!, 0)
      : type === "congestion" ? manual?.congestionCharge ? manual.congestionChargePence : 0 : null;
    return [[job.jobId, type === "tunnel" ? "Tunnel" : "Congestion", money(saved), manual ? money(amount) : "Not submitted"]];
  }));
  const road = (type: "tunnel" | "congestion"): PdfSection => {
    const rows = (report.roadAlerts ?? []).filter(row => row.type === type);
    const unknown = rows.filter(row => row.estimatedPence === null).length;
    const known = rows.reduce((sum, row) => sum + (row.estimatedPence ?? 0), 0);
    return { name: type === "tunnel" ? "Tunnel Charges" : "Congestion Charges", tables: [
      metrics("Activity totals", [["Zone entries", report.roadAlerts ? String(rows.length) : "Unavailable"],
        [type === "tunnel" ? "Chargeable passages" : "Chargeable jobs", report.roadAlerts ? String(rows.filter(row => row.chargeable).length) : "Unavailable"],
        ["Calculated charges", !report.roadAlerts || unknown && unknown === rows.length ? "Not calculated" : money(known)], ["Entries without a calculated fee", String(unknown)]],
        report.alertHistoryTruncated ? "Showing the returned GPSLive history for the selected dates." : undefined),
      table("Zone activity", ["Job ID", "Zone", "Entered", "Exited", "Time inside", "Chargeable", "Fee", "Rate source"], [1.1, 1.8, 1.1, 1.1, .9, .8, 1, 1.2],
        rows.map(row => [row.jobId || "Not linked", row.zone || row.scheme, stamp(row.enteredAt), stamp(row.exitedAt), time(row.durationSeconds == null ? null : row.durationSeconds / 60), row.chargeable ? "Yes" : "No", row.estimatedPence === null ? "Not calculated" : money(row.estimatedPence),
          row.rateBasis === "Current Pricing Settings estimate" ? "Current Pricing Settings" : row.rateBasis]))
    ] };
  };
  return [
    { name: "Performance & Timings", tables: [metrics("Selected range totals", [
      ["Total jobs", String(s.assignedJobs)], ["Completed / cancelled", `${s.completedJobs} / ${s.cancelledJobs}`],
      ["Total Charges", money(cards?.totalChargesPence)], ["Driver Collected", money(cards?.driverCollectionPence)],
      ["Working time", s.workingMinutesUnknownJobs === s.completedJobs && s.completedJobs > 0 ? "Not recorded" : time(s.workingMinutesKnown)], ["Moving time", s.movingUnknownJobs === s.completedJobs && s.completedJobs > 0 ? "Not recorded" : time(s.movingKnownSeconds / 60)],
      ["Overtime", time(s.overtimeMinutesKnown)], ["Arrival delays", time(s.arrivalDelayMinutesKnown)],
      ["Reviews sent / not sent", `${s.reviewSentJobs} / ${s.reviewNotSentJobs}`], ["Helper hours", `${s.helperHoursKnown.toFixed(1)}h`]
    ], s.workingMinutesUnknownJobs ? `Working time is unavailable for ${s.workingMinutesUnknownJobs} jobs; known durations are shown.` : undefined),
      table("Job timings", ["Job ID", "Tracker arrival", "Proof photo", "Van loaded", "Empty van", "Customer signed"], [1.1, 1, 1, 1, 1, 1], jobs.map(job => [job.jobId, stamp(job.timings?.trackerArrivalAt), stamp(job.timings?.proofPhotoAt), stamp(job.timings?.vanLoadedAt), stamp(job.timings?.emptyVanAt), stamp(job.timings?.customerSignedAt)])),
      table("Job performance", ["Job ID", "Working", "Moving", "Overtime", "Arrival delay", "Review", "Helper hours"], [1.2, 1, 1, 1, 1, 1, 1], jobs.map(job => [job.jobId, time(job.duration.workingMinutes),
      time(job.movement?.onJob.movingSeconds == null ? null : job.movement.onJob.movingSeconds / 60), time(job.duration.overtimeMinutes), time(job.duration.arrivalDelayMinutes), job.reviewSent ? "Sent" : "Not sent", job.manualDetails ? `${job.manualDetails.helperHours}h` : "Not submitted"]))] },
    { name: "Payments", tables: [metrics("Financial totals", [["Total Charges", money(cards?.totalChargesPence)], ["Driver Collected", money(cards?.driverCollectionPence)],
      ["Manual Entries", money(cards?.manualEntriesKnownPence ?? cards?.manualEntriesPence)], ["Outstanding", money(cards?.outstandingPence)]],
      ["Outstanding = Driver Collected - Manual Entries.", manualNote].filter(Boolean).join(" ")),
      table("Payment methods", ["Method", "Job-flow amount", "Manual amount"], [1.5, 1, 1], [...methods.map(method => [method === "Invoice" ? "Invoice (uncollected)" : method, money(s.systemPaymentsByMethodPence[method] ?? 0), money(manualMethods[method] ?? 0)]),
        ["Total payment amounts", money(Object.values(s.systemPaymentsByMethodPence).reduce((sum, amount) => sum + amount, 0)), money(Object.values(manualMethods).reduce((sum, amount) => sum + amount, 0))]], "Invoices are not collected payments."),
      table("Job collections", ["Job ID", "Total Charges", "Driver Collected", "Manual Entries", "Adjustment reason"], [1.1, 1, 1, 1, 2], jobs.map(job => [job.jobId, money(job.finance.systemCalculatedPence), money(job.finance.acceptedPence), manualAmount(job), job.finance.adjustmentNote || "-"]))] },
    { name: "Jobs", tables: [table("Job history", ["Job ID", "Customer", "Scheduled start / finish", "Actual start / finish", "Calendar / allocated", "Status"], [1, 1.6, 1.5, 1.5, 1.1, .8], jobs.map(job => [job.jobId, job.customer.name || "Not recorded",
      `${stamp(job.bookedStart)}\n${stamp(job.bookedFinish)}`, `${stamp(job.actualStart)}\n${stamp(job.actualFinish)}`, `${time(job.duration.bookedMinutes)} / ${time(job.duration.allocatedMinutes)}`, job.status])),
      table("Job charges", ["Job ID", "Base", "Overtime charge", "Saved congestion fee", "Saved tunnel fee", "Total Charges"], [1.1, 1, 1, 1.2, 1.2, 1.2], jobs.map(job => [job.jobId, money(job.finance.basePence), money(job.finance.overtimePence), money(job.finance.congestionPence), money(job.finance.tunnelPence), money(job.finance.systemCalculatedPence)]),
        "Saved job fees are already part of job totals; GPSLive activity is listed separately, not added again.")] },
    { name: "Comparison", tables: [table("System and manual details", ["Job ID", "Total Charges", "Driver Collected", "Manual amount", "Working time", "Reported time", "Helper / hours"], [1.1, 1, 1, 1, 1, 1, 1.4], jobs.map(job => [job.jobId, money(job.finance.systemCalculatedPence), money(job.finance.acceptedPence), manualAmount(job), time(job.duration.workingMinutes),
      job.manualDetails ? time(job.duration.manualMinutes) : "Not submitted", job.manualDetails ? `${job.manualDetails.helperName || "None"} / ${job.manualDetails.helperHours}h` : "Not submitted"]), manualNote),
      ...(feeComparisons.length ? [table("Saved and manual charge items", ["Job ID", "Charge", "Saved fee", "Manual fee"], [1.2, 1, 1, 1], feeComparisons)] : [])] },
    road("tunnel"), road("congestion")
  ];
}

export function pdfDateRange(report: ExportReport) {
  return `${DateTime.fromISO(report.range.from).setZone("Europe/London").toFormat("dd MMM yyyy")} - ${DateTime.fromISO(report.range.to).minus({ milliseconds: 1 }).setZone("Europe/London").toFormat("dd MMM yyyy")}`;
}
