/**
 * What the job preview and the Job Report PDF say about one job, as plain data.
 *
 * Both read the same functions so a value cannot differ between the screen and the
 * document. Nothing here is invented: a missing value stays missing, a tracker event
 * with no time is never given one, and "not yet" is only said for a job whose status
 * (not its timestamps) says the step cannot have happened yet.
 */
import type { ActivityEntry, NormalizedEvidenceItem, NormalizedJob } from "../../types";
import { evidenceState } from "../StatusBadge";

/* ------------------------------------------------------------------ lifecycle --- */

export type Lifecycle = "scheduled" | "active" | "completed" | "cancelled";

/** From the backend status only. A timestamp never changes what stage a job is in. */
export function lifecycleOf(job: Pick<NormalizedJob, "status">): Lifecycle {
  switch (job.status) {
    case "READY": return "scheduled";
    case "COMPLETED": return "completed";
    case "CANCELLED": return "cancelled";
    default: return "active";
  }
}

/* ----------------------------------------------------------------- milestones --- */

export type MilestoneState = "recorded" | "pending" | "missing" | "unverified";
export type MilestoneKind = "driver" | "tracker" | "photo" | "customer";

export interface Milestone {
  key: "onTheWay" | "pickup" | "proof" | "loaded" | "dropoff" | "empty" | "departure" | "signed";
  label: string;
  /** Label used by the Job Report PDF (kept as printed before the redesign). */
  pdfLabel: string;
  kind: MilestoneKind;
  /** Who or what recorded it. */
  source: string;
  at?: string;
  state: MilestoneState;
  /** Why it is unverified or missing, or a supporting fact when it is recorded. */
  note?: string;
  /** Evidence category whose photo supports this milestone. */
  category?: NormalizedEvidenceItem["category"];
}

const SOURCE: Record<MilestoneKind, string> = { driver: "Driver app", tracker: "Tracker", photo: "Driver photo", customer: "Customer signature" };

/** The eight operational milestones, in the order the Driver Report uses. */
export function milestonesOf(job: NormalizedJob): Milestone[] {
  const drop = job.dropoffTracking;
  const proofNote = job.arrivalProofLate ? `${job.arrivalProofDelayMinutes ?? "?"} min after tracker arrival` : job.arrivalProofOverdue ? "Overdue" : undefined;
  const base: Array<Omit<Milestone, "state">> = [
    { key: "onTheWay", label: "Driver marked On my way", pdfLabel: "On my way", kind: "driver", source: SOURCE.driver, at: job.onMyWayAt },
    { key: "pickup", label: "Tracker pick-up arrival", pdfLabel: "Tracker Pick-up arrival", kind: "tracker", source: SOURCE.tracker, at: job.trackerArrivalAt,
      note: job.trackerArrivalAt ? (job.trackerArrivalDistanceMeters != null ? `${Math.round(job.trackerArrivalDistanceMeters)} m from pickup` : undefined) : job.trackerUnverifiedReason || undefined },
    { key: "proof", label: "Proof of arrival photo", pdfLabel: "Proof of arrival photo time", kind: "photo", source: SOURCE.photo, at: job.pickupArrivalAt, note: proofNote, category: "Arrival" },
    { key: "loaded", label: "Van loaded photo", pdfLabel: "Van loaded photo time", kind: "photo", source: SOURCE.photo, at: job.vanLoadedAt, category: "VanLoaded" },
    { key: "dropoff", label: "Tracker drop-off arrival", pdfLabel: "Tracker Drop-off arrival", kind: "tracker", source: SOURCE.tracker, at: drop?.arrivalAt, note: drop?.arrivalAt ? undefined : drop?.unverifiedReason || undefined },
    { key: "empty", label: "Empty van photo", pdfLabel: "Empty van photo time", kind: "photo", source: SOURCE.photo, at: job.actualFinish, category: "EmptyVan" },
    { key: "departure", label: "Tracker drop-off departure", pdfLabel: "Tracker Drop-off departure", kind: "tracker", source: SOURCE.tracker, at: drop?.departureAt, note: drop?.departureAt ? undefined : drop?.unverifiedReason || undefined },
    { key: "signed", label: "Customer signature", pdfLabel: "Customer signature time", kind: "customer", source: SOURCE.customer, at: job.clientSignatureAt, note: job.clientConfirmedName ? `Signed as ${job.clientConfirmedName}` : undefined, category: "Signature" }
  ];
  const lifecycle = lifecycleOf(job);
  const lastRecorded = base.reduce((last, item, index) => item.at ? index : last, -1);
  return base.map((item, index) => {
    if (item.at) return { ...item, state: "recorded" as const };
    // A tracker event with a stated reason is "unverified": the evidence was looked for.
    if (item.kind === "tracker" && item.note && lifecycle !== "scheduled") return { ...item, state: "unverified" as const };
    if (lifecycle === "scheduled") return { ...item, state: "pending" as const };
    // In progress: steps after the latest recorded one have simply not happened yet.
    if (lifecycle === "active" && index > lastRecorded) return { ...item, state: "pending" as const };
    return { ...item, state: "missing" as const };
  });
}

export function milestoneSummary(milestones: Milestone[], job: Pick<NormalizedJob, "status">): { recorded: number; total: number; text: string } {
  const recorded = milestones.filter(item => item.state === "recorded").length;
  const total = milestones.length;
  const lifecycle = lifecycleOf(job);
  return { recorded, total, text: lifecycle === "scheduled" && recorded === 0 ? "Nothing expected yet" : `${recorded} of ${total} recorded` };
}

export const MILESTONE_STATE_LABEL: Record<MilestoneState, string> = { recorded: "Recorded", pending: "Not yet", missing: "Not recorded", unverified: "Unverified" };

/* ------------------------------------------------------------------- evidence --- */

export type EvidenceRowState = "recorded" | "uploading" | "failed" | "pending" | "missing" | "notRequired";
export interface EvidenceRow { label: string; state: EvidenceRowState }

/** Required evidence, with "not yet" only for jobs that have not reached that step. */
export function evidenceRows(job: NormalizedJob): EvidenceRow[] {
  const completeness = job.evidenceCompleteness;
  if (!completeness) return [];
  const lifecycle = lifecycleOf(job);
  const order: Array<[string, keyof typeof completeness]> = [["Arrival photo", "arrival"], ["Van loaded photo", "vanLoaded"], ["Empty van photo", "emptyVan"], ["Customer signature", "signature"]];
  const optional: Array<[string, keyof typeof completeness]> = [["Stop-by photo", "stopBy"], ["Organised photo", "organized"]];
  const lastReceived = order.reduce((last, [, key], index) => completeness[key] === "COMPLETED" ? index : last, -1);
  const rows: EvidenceRow[] = order.map(([label, key], index) => {
    const state = completeness[key];
    if (state === "COMPLETED") return { label, state: "recorded" as const };
    if (state === "PROCESSING") return { label, state: "uploading" as const };
    if (state === "FAILED") return { label, state: "failed" as const };
    if (lifecycle === "cancelled") return { label, state: "notRequired" as const };
    if (lifecycle === "scheduled" || (lifecycle === "active" && index > lastReceived)) return { label, state: "pending" as const };
    return { label, state: "missing" as const };
  });
  // Stop-by and organised photos are only taken when relevant: shown when received, never "missing".
  for (const [label, key] of optional) if (completeness[key] === "COMPLETED") rows.push({ label, state: "recorded" });
  return rows;
}

export const EVIDENCE_STATE_LABEL: Record<EvidenceRowState, string> = {
  recorded: "Recorded", uploading: "Uploading", failed: "Upload failed", pending: "Not yet expected", missing: "Missing", notRequired: "Not required"
};

export function evidenceSummary(job: NormalizedJob): { recorded: number; total: number; missing: string[] } {
  const rows = evidenceRows(job);
  const counted = rows.filter(row => row.state !== "notRequired");
  return { recorded: counted.filter(row => row.state === "recorded").length, total: counted.length, missing: evidenceState(job).missing };
}

/** Photos the preview can show, in capture order. Signatures and documents are shown separately. */
export interface GalleryPhoto {
  id: string;
  category: string;
  categoryLabel: string;
  url: string;
  driveUrl?: string;
  capturedAt?: string;
  receivedAt?: string;
  location?: NormalizedEvidenceItem["location"];
  locationName?: string;
  fileName?: string;
}

const CATEGORY_LABEL: Record<string, string> = { Arrival: "Arrival", VanLoaded: "Van loaded", StopBy: "Stop-by", EmptyVan: "Empty van", Organized: "Organised", Signature: "Signature", Documents: "Document" };
export const categoryLabel = (category: string) => CATEGORY_LABEL[category] || category.replace(/([a-z])([A-Z])/g, "$1 $2");

const stamp = (value?: string) => { const t = value ? Date.parse(value) : NaN; return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY; };

export function galleryPhotos(job: NormalizedJob): GalleryPhoto[] {
  return (job.evidenceItems || [])
    .filter(item => item.state === "COMPLETED" && item.category !== "Signature" && (item.driveUrl || item.thumbProxyUrl))
    .map(item => ({
      id: item.id, category: item.category, categoryLabel: categoryLabel(item.category), url: (item.thumbProxyUrl || item.driveUrl)!, driveUrl: item.driveUrl,
      capturedAt: item.capturedAt, receivedAt: item.receivedAt || item.completedAt, location: item.location, locationName: item.locationName, fileName: item.fileName
    }))
    .sort((a, b) => stamp(a.capturedAt || a.receivedAt) - stamp(b.capturedAt || b.receivedAt));
}

/* ------------------------------------------------------------------- durations --- */

export interface DurationBar { key: string; label: string; minutes: number; detail: string }

/** Minutes the driver reported working, from their job summary (hours, else start to end). */
export function driverReportedMinutes(job: NormalizedJob): number | null {
  const summary = job.driverJobSummary;
  if (!summary) return null;
  if (typeof summary.driverJobHours === "number" && Number.isFinite(summary.driverJobHours) && summary.driverJobHours >= 0) return Math.round(summary.driverJobHours * 60);
  const start = Date.parse(summary.startTime), end = Date.parse(summary.endTime);
  return Number.isFinite(start) && Number.isFinite(end) && end > start ? Math.round((end - start) / 60_000) : null;
}

/** Booked, billed, actual and driver-reported time: four different facts, drawn side by side. */
export function durationBars(job: NormalizedJob): DurationBar[] {
  const bars: DurationBar[] = [];
  const eventMinutes = (Date.parse(job.bookedFinish) - Date.parse(job.bookedStart)) / 60_000;
  const booked = Number.isFinite(eventMinutes) && eventMinutes > 0 ? eventMinutes : job.bookedMinutes;
  if (typeof booked === "number" && booked > 0) bars.push({ key: "booked", label: "Booked", minutes: booked, detail: "Calendar start to finish" });
  const billed = job.timeBilling?.allocatedMinutes;
  if (typeof billed === "number" && billed > 0) bars.push({ key: "billed", label: "Billing allowance", minutes: billed, detail: "Time included before extra time" });
  const actual = job.timeBilling?.actualMinutes ?? job.actualMinutes;
  if (typeof actual === "number" && actual > 0) bars.push({ key: "actual", label: "Actual working time", minutes: actual, detail: "Recorded arrival to finish" });
  const reported = driverReportedMinutes(job);
  if (reported !== null && reported > 0) bars.push({ key: "reported", label: "Driver-reported", minutes: reported, detail: "From the driver's job summary" });
  return bars;
}

/* --------------------------------------------------------------------- money --- */

export interface ChargeLine { label: string; pence: number | null | undefined; hint?: string }

/** Priced parts of the calculated charge. Extra-charge rows are not double counted with extra time. */
export function chargeLines(job: NormalizedJob): ChargeLine[] {
  const extras = job.extraChargeBreakdown?.length
    ? job.extraChargeBreakdown.map(row => ({ label: row.label || "Extra charge", pence: row.amount }))
    : [{ label: "Extra charges", pence: job.extraCharges }, { label: "Extra time", pence: job.overtimeCharge }];
  return [{ label: "Base price", pence: job.basePrice }, ...extras, { label: "Congestion charge", pence: job.congestionCharge }, { label: "Tunnel charge", pence: job.tunnelCharge }];
}

export const isInvoiceMethod = (method?: string) => (method || "").toLowerCase().startsWith("invoice");

/** Money the system recorded as received at completion: every method except invoices (which are billed, not received). */
export function recordedReceiptsPence(job: NormalizedJob): number | null {
  if (!job.paymentBreakdown?.length) return null;
  return job.paymentBreakdown.filter(row => !isInvoiceMethod(row.method)).reduce((sum, row) => sum + (row.amount || 0), 0);
}

/* ------------------------------------------------------------------ comparison --- */

export interface ComparisonRow { key: string; label: string; system: string; driver: string; difference: string; state: "same" | "differs" | "incomplete" }

/** System record against what the driver reported, only where the two measure the same thing. */
export function comparisonRows(job: NormalizedJob, fmt: { minutes: (m: number | null) => string; money: (p: number | null) => string }): ComparisonRow[] {
  const summary = job.driverJobSummary;
  const rows: ComparisonRow[] = [];
  const systemMinutes = typeof (job.timeBilling?.actualMinutes ?? job.actualMinutes) === "number" ? (job.timeBilling?.actualMinutes ?? job.actualMinutes)! : null;
  const reported = driverReportedMinutes(job);
  rows.push(pair("time", "Working time", systemMinutes, reported, fmt.minutes, (a, b) => `${Math.abs(a - b)} min ${a > b ? "more in the system" : "more reported by the driver"}`, summary ? "Not reported" : "Not submitted"));
  const reportedOvertime = job.driverReportedOvertimeMinutes;
  const systemOvertime = job.timeBilling?.extraMinutes;
  if (typeof reportedOvertime === "number" || typeof systemOvertime === "number") {
    rows.push(pair("extra", "Extra time", typeof systemOvertime === "number" ? systemOvertime : null, typeof reportedOvertime === "number" ? reportedOvertime : null, fmt.minutes, (a, b) => `${Math.abs(a - b)} min`, summary ? "Not reported" : "Not submitted"));
  }
  rows.push(pair("money", "Money received", recordedReceiptsPence(job), summary ? summary.amountCollectedPence : null, fmt.money, (a, b) => fmt.money(Math.abs(a - b)), summary ? "Not reported" : "Not submitted"));
  return rows;
}

function pair(key: string, label: string, system: number | null, driver: number | null, format: (value: number | null) => string, diff: (a: number, b: number) => string, driverMissing: string): ComparisonRow {
  const sys = system === null ? "Not recorded" : format(system);
  const drv = driver === null ? driverMissing : format(driver);
  if (system === null || driver === null) return { key, label, system: sys, driver: drv, difference: "Not comparable", state: "incomplete" };
  return system === driver ? { key, label, system: sys, driver: drv, difference: "No difference", state: "same" } : { key, label, system: sys, driver: drv, difference: diff(system, driver), state: "differs" };
}

/* -------------------------------------------------------------------- activity --- */

export type ActivityGroup = "changes" | "driver" | "evidence" | "payments" | "other";
export const ACTIVITY_GROUP_LABEL: Record<ActivityGroup, string> = { changes: "Job changes", driver: "Driver actions", evidence: "Evidence", payments: "Payments", other: "Other" };

export function activityGroup(entry: Pick<ActivityEntry, "action" | "toState">): ActivityGroup {
  const text = `${entry.action} ${entry.toState || ""}`.toUpperCase();
  if (/PAYMENT|CHARGE|INVOICE|AMOUNT|RECONCIL/.test(text)) return "payments";
  if (/PHOTO|EVIDENCE|SIGNATURE|UPLOAD|SIGNED/.test(text)) return "evidence";
  if (/VIEWED|STARTED|ON_MY_WAY|ARRIV|LOAD|DRIVER/.test(text)) return "driver";
  if (/CREAT|IMPORT|ASSIGN|STATUS|STATE|COMPLET|CANCEL|FINISH|UPDATE|REVIEW|DELET/.test(text)) return "changes";
  return "other";
}

export const humanAction = (action: string) => action.replace(/_/g, " ").toLowerCase().replace(/^\w/, c => c.toUpperCase());

/* ------------------------------------------------------------------- contacts --- */

/** A telephone link only for something that is a phone number; "Not recorded" never becomes one. */
export function telHref(raw?: string | null): string | null {
  const value = (raw || "").trim();
  if (!/^\+?[\d\s().-]{7,20}$/.test(value)) return null;
  const digits = value.replace(/[^\d+]/g, "");
  return digits.replace(/\D/g, "").length >= 7 ? `tel:${digits}` : null;
}

export function mailHref(raw?: string | null): string | null {
  const value = (raw || "").trim();
  return /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[A-Za-z]{2,}$/.test(value) ? `mailto:${value}` : null;
}
