import { withArrivalDistance } from "../jobs/pickup-arrival.rules";
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
  const invoiceJobs = s.financialBreakdown?.invoiceJobs ?? jobs.filter(job => job.finance.invoiceJob).length;
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
      ["Scheduled Hours", time(s.scheduledMinutesKnown)], ["Working Hours", s.workingMinutesUnknownJobs === s.completedJobs && s.completedJobs > 0 ? "Not recorded" : time(s.workingMinutesKnown)], ["Moving time", s.movingUnknownJobs === s.completedJobs && s.completedJobs > 0 ? "Not recorded" : time(s.movingKnownSeconds / 60)],
      ["Overtime", time(s.overtimeMinutesKnown)], ["Arrival delays", time(s.arrivalDelayMinutesKnown)],
      ["Reviews sent / not sent", `${s.reviewSentJobs} / ${s.reviewNotSentJobs}`], ["Helper hours", `${s.helperHoursKnown.toFixed(1)}h`]
    ], s.workingMinutesUnknownJobs ? `Working time is unavailable for ${s.workingMinutesUnknownJobs} jobs; known durations are shown.` : undefined),
      table("Job timings", ["Job ID", "On the Way", "Tracker Pick-up arrival", "Proof photo", "Van loaded", "Drop-off arrival", "Empty van", "Drop-off departure", "Customer signed"], [1.1, 1, 1.4, 1, 1, 1, 1, 1, 1], jobs.map(job => [job.jobId, stamp(job.timings?.onMyWayAt), job.timings?.trackerArrivalAt ? withArrivalDistance(stamp(job.timings.trackerArrivalAt), job.timings.trackerArrivalDistanceMeters) : stamp(null), stamp(job.timings?.proofPhotoAt), stamp(job.timings?.vanLoadedAt), stamp(job.timings?.trackerDropoffArrivalAt), stamp(job.timings?.emptyVanAt), stamp(job.timings?.trackerDropoffDepartureAt), stamp(job.timings?.customerSignedAt)])),
      table("Job performance", ["Job ID", "Scheduled Hours", "Working Hours", "Moving", "Overtime", "Arrival delay", "Review", "Helper hours"], [1.2, 1, 1, 1, 1, 1, 1, 1], jobs.map(job => [job.jobId, time(job.duration.bookedMinutes), time(job.duration.workingMinutes),
      time(job.movement?.onJob.movingSeconds == null ? null : job.movement.onJob.movingSeconds / 60), time(job.duration.overtimeMinutes), time(job.duration.arrivalDelayMinutes), job.reviewSent ? "Sent" : "Not sent", job.manualDetails ? `${job.manualDetails.helperHours}h` : "Not submitted"]))] },
    { name: "Payments", tables: [metrics("Financial totals", [["Total Charges", money(cards?.totalChargesPence)], ["Driver Collected", money(cards?.driverCollectionPence)], ["Scheduled Hours", time(s.scheduledMinutesKnown)], ["Overtime Charges", money(s.overtimeChargesPence)]]),
      table("Financial breakdown", ["Detail", "Recorded amount", "Basis"], [1.5, 1, 2], [
        ["Base price", money(s.financialBreakdown?.basePence), "Booking"], ["Overtime", money(s.overtimeChargesPence), "Included in job total"],
        ...(s.financialBreakdown?.extraCharges ?? []).map((charge, index) => [index === 0 ? "Extra Charges" : "", charge.amountPence === null ? "-" : money(charge.amountPence), charge.label === "London Congestion charge" ? "Congestion" : charge.label === "Tunnel Charges" ? "Tunnel" : charge.label]),
        ...Object.entries(s.systemPaymentsByMethodPence).filter(([method]) => method !== "Invoice").map(([method, amount]) => [method, money(amount), "Job-flow receipt"]),
        ["Invoice", invoiceJobs ? money(s.systemPaymentsByMethodPence.Invoice ?? 0) : "-", invoiceJobs ? "Invoice job" : "-"],
        ["Total", money(Object.values(s.systemPaymentsByMethodPence).reduce((sum, amount) => sum + amount, 0)), "Payment methods including invoices"]]),
      table("Job-wise payment breakdown", ["Job ID", "Cash", "Card", "Link", "Bank Transfer", "Invoice", "Total"], [1.2, 1, 1, 1, 1, 1, 1], jobs.map(job => [job.jobId,
        ...["Cash", "Card", "Link", "Bank Transfer"].map(method => money(job.finance.systemPayments.byMethod[method as keyof typeof job.finance.systemPayments.byMethod])),
        job.finance.invoiceJob ? `${money(job.finance.systemPayments.invoicePence)} / Invoice job` : "-", money(Object.values(job.finance.systemPayments.byMethod).reduce((sum, amount) => sum + amount, 0))]))] },
    { name: "Jobs", tables: [table("Job history", ["Job ID", "Customer", "Scheduled start / finish", "Actual start / finish", "Calendar / allocated", "Status"], [1, 1.6, 1.5, 1.5, 1.1, .8], jobs.map(job => [job.jobId, job.customer.name || "Not recorded",
      `${stamp(job.bookedStart)}\n${stamp(job.bookedFinish)}`, `${stamp(job.actualStart)}\n${stamp(job.actualFinish)}`, `${time(job.duration.bookedMinutes)} / ${time(job.duration.allocatedMinutes)}`, job.status])),
      table("Job charges", ["Job ID", "Base", "Overtime charge", "Saved congestion fee", "Saved tunnel fee", "Total Charges"], [1.1, 1, 1, 1.2, 1.2, 1.2], jobs.map(job => [job.jobId, money(job.finance.basePence), money(job.finance.overtimePence), money(job.finance.congestionPence), money(job.finance.tunnelPence), money(job.finance.systemCalculatedPence)]),
        "Saved job fees are already part of job totals; GPSLive activity is listed separately, not added again.")] },
    { name: "Comparison", tables: [table("System and manual details", ["Job ID", "Expected amount", "Driver Collected", "Scheduled Hours", "Working Hours", "Reported Hours", "Helper hours"], [1.1, 1, 1, 1, 1, 1, 1.4], jobs.map(job => [job.jobId, money(job.finance.systemCalculatedPence), money(job.finance.acceptedPence), time(job.duration.bookedMinutes), time(job.duration.workingMinutes),
      job.manualDetails ? time(job.duration.manualMinutes) : "Not submitted", job.manualDetails ? time(job.manualDetails.helperHours * 60) : "Not submitted"])),
      table("Driver payment entries", ["Job ID", "Cash", "Card", "Link", "Bank Transfer", "Invoice", "Adjustment reason"], [1, 1, 1, 1, 1, 1, 2], jobs.map(job => [job.jobId, ...["Cash", "Card", "Link", "Bank Transfer", "Invoice"].map(method => money(job.finance.systemPayments.byMethod[method as keyof typeof job.finance.systemPayments.byMethod])), job.finance.adjustmentNote || "-"])),
      ] },
    road("tunnel"), road("congestion")
  ];
}

export function pdfDateRange(report: ExportReport) {
  return `${DateTime.fromISO(report.range.from).setZone("Europe/London").toFormat("dd MMM yyyy")} - ${DateTime.fromISO(report.range.to).minus({ milliseconds: 1 }).setZone("Europe/London").toFormat("dd MMM yyyy")}`;
}
