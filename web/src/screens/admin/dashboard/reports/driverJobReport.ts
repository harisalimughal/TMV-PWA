/**
 * Driver job report: the one data model behind every format of the Generate Report
 * feature (PDF, Excel, CSV, Word). Each format only lays this model out, so a report
 * has the same jobs and the same totals whichever file is downloaded.
 *
 * Every figure comes from the backend's driver report (`/api/admin/driver-reports/:code`),
 * the same response the Driver report page shows. Nothing is recalculated here: totals
 * are the backend's summary values, and per-job values are the backend's job fields.
 * The measures stay separate, as the report page labels them:
 *   Final charges      billed at completion, invoices included (paymentCards.driverCollectionPence)
 *   Recorded receipts  cash, card, link and bank recorded in the job flow
 *   Unpaid invoices    billed as invoice, payment not tracked here
 *   Manual entries     what the driver reported collecting in their job submission
 *   Working time       arrival to finish, from recorded job boundaries
 *   Driver-reported    the start and end times the driver submitted
 *   Scheduled          the calendar booking length
 */
import { DateTime } from "luxon";
import type { DriverReport, DriverReportJob } from "../driverReport.types";
import { fetchDriverReport } from "../api";
import { reportApiRange } from "../utils/reportNavigation";

export type Unit = "count" | "minutes" | "pence";
/** How far a figure can be trusted as a total:
 *  complete     every job contributed; a real total, including a real zero
 *  known-only   some jobs had no value, so this is the sum of the known ones
 *  unavailable  the source did not provide it (`value` is null); never shown as zero */
export type Coverage = "complete" | "known-only" | "unavailable";
export interface SummaryLine {
  key: string; label: string; unit: Unit; note?: string;
  /** Integer pence for money, whole minutes for time. null exactly when coverage is "unavailable". */
  value: number | null;
  coverage: Coverage;
  /** Combined lines only: the sum of the drivers that do have a value, when the total as a whole is unavailable. */
  knownSubtotal?: number | null;
}

export interface JobLine {
  jobId: string;
  date: string | null;          // London date, YYYY-MM-DD
  bookedTime: string | null;    // London time, HH:mm
  customer: string | null;
  pickup: string | null;
  dropoff: string | null;
  status: string;
  scheduledMinutes: number | null;
  workingMinutes: number | null;
  driverReportedMinutes: number | null;
  finalChargePence: number | null;
  paymentMethods: string | null;
  receiptsPence: number | null;
  manualEntryPence: number | null;
}

export interface DriverSection {
  driver: { initials: string; name: string };
  summary: SummaryLine[];
  jobs: JobLine[];
  /** Jobs the backend counted for this driver and range. */
  jobTotal: number;
  warnings: string[];
  /** Records the server sent that could not be used (no job id, or no finance/duration block). Never turned into valid-looking jobs. */
  rejected: number;
  /** Rows with a job id already listed, dropped (a page overlapped another). */
  duplicates: number;
}

export interface DriverJobReport {
  title: string;
  range: { from: string; to: string };
  generatedAt: string;
  sources: string[];
  sections: DriverSection[];
  /** Report-wide notes, such as drivers left out because they had no jobs. */
  notes?: string[];
  /** Drivers whose data could not be loaded. Their jobs are not in this report, so no combined total is available. */
  failed?: Array<{ initials: string; message: string; attempts: number }>;
  /** Every driver the report was asked for, in order (what a retry needs). */
  requested?: string[];
  /** True when drivers with no jobs are left out ("All drivers"); they are listed in `empty` and the notes. */
  dropEmpty?: boolean;
  empty?: Array<{ initials: string; name: string }>;
  /** Drivers deliberately not requested (for example inactive drivers the user turned off). */
  excluded?: string[];
}

export type Completeness = "COMPLETE" | "PARTIAL" | "FAILED";
/** What happened to one driver's request. A driver with zero jobs (empty) is a successful result; failed is not. */
export type DriverLoadKind = "pending" | "loading" | "success" | "empty" | "failed" | "cancelled";
export interface DriverLoadEvent { initials: string; kind: DriverLoadKind; message?: string }

export const REPORT_TITLE = "Driver Job Report";
/** Jobs fetched per request, and the most one driver section will hold. */
const PAGE_SIZE = 100;
export const MAX_JOBS_PER_DRIVER = 1000;

const ZONE = "Europe/London";
const clean = (value: string | null | undefined) => (value && value.trim() && value.trim() !== "Not recorded" ? value.trim() : null);

/** A number only when it is a finite number; anything else is missing, never coerced to 0. */
const fin = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);

/** A record is usable only with a job id, a status and the finance and duration blocks the lines read from. */
export function usableJob(item: unknown): item is DriverReportJob {
  const job = item as Partial<DriverReportJob> | null;
  return !!job && typeof job === "object" && typeof job.jobId === "string" && job.jobId.trim() !== "" && typeof job.status === "string"
    && !!job.finance && typeof job.finance === "object" && !!job.duration && typeof job.duration === "object";
}

export function jobLine(job: DriverReportJob): JobLine {
  const start = job.bookedStart ? DateTime.fromISO(job.bookedStart).setZone(ZONE) : null;
  const byMethod = job.finance.systemPayments?.byMethod ?? {};
  const methods = Object.entries(byMethod).filter(([, amount]) => typeof amount === "number" && amount > 0).map(([method]) => method);
  return {
    jobId: job.jobId,
    date: start?.isValid ? start.toISODate() : null,
    bookedTime: start?.isValid ? start.toFormat("HH:mm") : null,
    customer: clean(job.customer?.name),
    pickup: clean(job.pickup),
    dropoff: clean(job.dropoff),
    status: job.status,
    scheduledMinutes: fin(job.duration.bookedMinutes),
    workingMinutes: fin(job.duration.workingMinutes),
    driverReportedMinutes: fin(job.duration.manualMinutes),
    finalChargePence: fin(job.finance.acceptedPence),
    paymentMethods: methods.length ? methods.join(", ") : null,
    receiptsPence: job.finance.systemPayments ? fin(job.finance.systemPayments.collectedPence) : null,
    manualEntryPence: job.manualDetails ? fin(job.manualDetails.amountCollectedPence) : null
  };
}

export function summaryLines(report: DriverReport): SummaryLine[] {
  const s = report.summary, cards = s.paymentCards;
  const roads = s.roadChargeTotals;
  const unknown = (count: number | undefined, what: string) => (count ? `${count} ${count === 1 ? "job" : "jobs"} without ${what}; known values only` : undefined);
  /** value null: unavailable. Jobs without a value: known-only. Otherwise a complete total (zero included). */
  const line = (key: string, label: string, value: number | null | undefined, unit: Unit, unknownJobs?: number, note?: string): SummaryLine => {
    const present = typeof value === "number" && Number.isFinite(value);
    return { key, label, unit, value: present ? value : null, coverage: !present ? "unavailable" : unknownJobs ? "known-only" : "complete", note };
  };
  // The server sends invoice money per method. A method it leaves out is "not provided", not £0.00;
  // only an explicit 0, or an explicit count of zero invoice jobs, makes it zero.
  const invoice = s.systemPaymentsByMethodPence?.Invoice;
  const invoiceValue = typeof invoice === "number" ? invoice : s.financialBreakdown?.invoiceJobs === 0 ? 0 : null;
  return [
    line("assigned", "Jobs assigned", s.assignedJobs, "count"),
    line("completed", "Completed", s.completedJobs, "count"),
    line("cancelled", "Cancelled", s.cancelledJobs, "count"),
    line("scheduled", "Scheduled hours", s.scheduledMinutesKnown, "minutes", s.scheduledMinutesUnknownJobs, unknown(s.scheduledMinutesUnknownJobs, "a calendar duration")),
    line("working", "Working time", s.workingMinutesKnown, "minutes", s.workingMinutesUnknownJobs, unknown(s.workingMinutesUnknownJobs, "recorded times")),
    line("reported", "Driver-reported time", s.manualMinutesKnown, "minutes", s.manualMinutesUnknownJobs, unknown(s.manualMinutesUnknownJobs, "a driver submission")),
    line("final", "Final charges", cards?.driverCollectionPence, "pence", cards?.driverCollectionUnknownJobs, "Billed at completion, invoices included"),
    line("receipts", "Recorded receipts", s.systemKnownCollectionsPence, "pence", s.unknownSystemCollectionJobs, unknown(s.unknownSystemCollectionJobs, "a verified payment record") ?? "Cash, card, link and bank"),
    line("invoices", "Unpaid invoices", invoiceValue, "pence", undefined, invoiceValue === null ? "Not provided by the server for this driver and period" : "Billed as invoice; later payment is not tracked"),
    line("manual", "Manual entries (reported)", cards ? (cards.manualEntriesKnownPence ?? cards.manualEntriesPence) : null, "pence", cards?.manualEntryUnknownJobs, unknown(cards?.manualEntryUnknownJobs, "a readable manual entry") ?? "What the driver reported collecting"),
    line("outstanding", "Outstanding", cards?.outstandingPence, "pence", undefined, "Final charges minus manual entries"),
    line("overtime", "Extra-time charges", s.overtimeChargesPence, "pence"),
    line("congestion", "Saved congestion charges", roads ? roads.congestionPence : null, "pence", roads?.congestionUnknownJobs, unknown(roads?.congestionUnknownJobs, "a saved charge")),
    line("tunnel", "Saved tunnel charges", roads ? roads.tunnelPence : null, "pence", roads?.tunnelUnknownJobs, unknown(roads?.tunnelUnknownJobs, "a saved charge"))
  ];
}

/** Report order: dated jobs oldest first, jobs without a usable date after them, ties by job id. */
export function compareJobs(a: JobLine, b: JobLine): number {
  const ka = a.date && a.bookedTime ? `${a.date}T${a.bookedTime}` : null, kb = b.date && b.bookedTime ? `${b.date}T${b.bookedTime}` : null;
  if (ka && kb && ka !== kb) return ka < kb ? -1 : 1;
  if (ka && !kb) return -1;
  if (!ka && kb) return 1;
  return a.jobId.localeCompare(b.jobId, "en", { numeric: true });
}

export function buildSection(report: DriverReport, items: unknown[]): DriverSection {
  const usable = items.filter(usableJob);
  const rejected = items.length - usable.length;
  // A job is identified by its job id within one driver's report. The same job under another driver
  // is a separate assignment and is kept; only a repeat inside this driver's pages is dropped.
  const unique = new Map<string, DriverReportJob>();
  for (const job of usable) if (!unique.has(job.jobId)) unique.set(job.jobId, job);
  const duplicates = usable.length - unique.size;
  const jobs = [...unique.values()];
  const warnings: string[] = [];
  if (jobs.length < report.jobs.total) warnings.push(`Only the first ${jobs.length} of ${report.jobs.total} jobs are listed. Totals still cover every job.`);
  if (duplicates) warnings.push(`${duplicates} repeated ${duplicates === 1 ? "row was" : "rows were"} removed. The server's pages overlapped, so some jobs may be missing from the list.`);
  if (rejected) warnings.push(`${rejected} ${rejected === 1 ? "record" : "records"} from the server could not be read and ${rejected === 1 ? "was" : "were"} left out.`);
  if (report.meta && report.meta.financialTotalsCoverAllMatchingJobs === false) warnings.push("The server says its money totals do not cover every matching job.");
  if (report.summary.workingMinutesUnknownJobs) warnings.push(`${report.summary.workingMinutesUnknownJobs} jobs have no recorded working time.`);
  if (report.summary.pendingManualJobs) warnings.push(`${report.summary.pendingManualJobs} jobs have no driver submission yet.`);
  return {
    driver: { initials: report.driver.initials, name: report.driver.name || report.driver.initials },
    summary: summaryLines(report),
    jobs: jobs.map(jobLine).sort(compareJobs),
    jobTotal: report.jobs.total,
    warnings, rejected, duplicates
  };
}

const unexpected = () => new Error("The server sent this driver's report in an unexpected shape.");

/** Loads one driver's report and every job page (up to MAX_JOBS_PER_DRIVER). Pages are fetched one after
 *  another by the page size the server actually used; nothing is fetched twice. */
export async function loadSection(initials: string, range: { from: string; to: string }, signal?: AbortSignal, load = fetchDriverReport): Promise<{ section: DriverSection; version: string }> {
  const query = { ...reportApiRange(range.from, range.to), groupBy: "day", detail: "core", activityScheme: "all", pageSize: PAGE_SIZE };
  const first = await load(initials, { ...query, jobsPage: 1 }, signal);
  if (!first || !first.summary || !first.driver || !first.jobs || !Array.isArray(first.jobs.items) || typeof first.jobs.total !== "number") throw unexpected();
  const items: unknown[] = [...first.jobs.items];
  const pageSize = Math.max(1, first.jobs.pageSize || PAGE_SIZE);
  const pages = Math.ceil(Math.min(first.jobs.total, MAX_JOBS_PER_DRIVER) / pageSize);
  for (let page = 2; page <= pages; page++) {
    const next = await load(initials, { ...query, jobsPage: page }, signal);
    if (!next?.jobs || !Array.isArray(next.jobs.items) || !next.jobs.items.length) break;
    items.push(...next.jobs.items);
  }
  return { section: buildSection(first, items.slice(0, MAX_JOBS_PER_DRIVER + pageSize)), version: first.version };
}

/** Drivers loaded at once. Each driver's own pages stay sequential. Three keeps a 10 to 15 driver roster
 *  quick without flooding an API whose limits are not documented here (the Driver report page makes 1 to 2 requests). */
export const DRIVER_CONCURRENCY = 3;

type Outcome = { kind: "ok"; section: DriverSection; version: string } | { kind: "failed"; message: string };
export interface LoadOptions {
  signal?: AbortSignal; load?: typeof fetchDriverReport; now?: () => Date;
  /** Called with the number of drivers finished and the number asked for. */
  onProgress?: (done: number, total: number) => void;
  /** Called as each driver moves through pending, loading, success, empty, failed or cancelled. */
  onDriver?: (event: DriverLoadEvent) => void;
  /** Keep the drivers that loaded when another fails (a partial report). Otherwise the first failure rejects. */
  continueOnError?: boolean;
  concurrency?: number;
  /** "All drivers": drivers with no jobs are left out and named in the notes. */
  dropEmpty?: boolean;
  excluded?: string[];
}

/** Runs the worker over the items, at most `limit` at a time, and stops starting new work once cancelled. */
async function runLimited<T>(items: T[], limit: number, worker: (item: T) => Promise<void>, stop: () => boolean): Promise<void> {
  let next = 0;
  const lane = async () => { while (next < items.length && !stop()) await worker(items[next++]); };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, lane));
}

async function loadOutcomes(drivers: string[], range: { from: string; to: string }, options: LoadOptions): Promise<Map<string, Outcome>> {
  const outcomes = new Map<string, Outcome>();
  let finished = 0, fatal: unknown;
  const emit = (initials: string, kind: DriverLoadKind, message?: string) => options.onDriver?.({ initials, kind, message });
  drivers.forEach(initials => emit(initials, "pending"));
  await runLimited(drivers, options.concurrency ?? DRIVER_CONCURRENCY, async initials => {
    emit(initials, "loading");
    try {
      const { section, version } = await loadSection(initials, range, options.signal, options.load);
      outcomes.set(initials, { kind: "ok", section, version });
      emit(initials, section.jobTotal === 0 ? "empty" : "success");
    } catch (error) {
      if (options.signal?.aborted) { emit(initials, "cancelled"); fatal ??= error; return; }
      const message = (error as Error)?.message || "The request failed.";
      outcomes.set(initials, { kind: "failed", message });
      emit(initials, "failed", message);
      if (!options.continueOnError) fatal ??= error;
    }
    options.onProgress?.(++finished, drivers.length);
  }, () => fatal !== undefined || !!options.signal?.aborted);
  if (options.signal?.aborted) throw fatal ?? new DOMException("Aborted", "AbortError");
  if (fatal !== undefined) throw fatal;
  return outcomes;
}

function notesFor(report: DriverJobReport): string[] {
  const notes: string[] = [];
  if (report.failed?.length) notes.push(`Not loaded because the request failed: ${report.failed.map(item => item.initials).join(", ")}. Their jobs are not in this report and no combined total is available.`);
  if (report.empty?.length) notes.push(`No jobs in this period: ${report.empty.map(item => `${item.name} (${item.initials})`).join(", ")}.`);
  if (report.excluded?.length) notes.push(`Not requested (left out by choice): ${report.excluded.join(", ")}.`);
  return notes;
}

/** Builds the report from a set of per-driver outcomes, in the order the drivers were requested. */
function assemble(base: { requested: string[]; range: { from: string; to: string }; generatedAt: string; dropEmpty: boolean; excluded?: string[]; sources: Set<string> }, kept: DriverSection[], empty: Array<{ initials: string; name: string }>, outcomes: Map<string, Outcome>, previousFailed: Map<string, number>): DriverJobReport {
  const sections = [...kept], emptied = [...empty], failed: NonNullable<DriverJobReport["failed"]> = [];
  for (const initials of base.requested) {
    const outcome = outcomes.get(initials);
    if (!outcome) continue;
    if (outcome.kind === "failed") { failed.push({ initials, message: outcome.message, attempts: (previousFailed.get(initials) ?? 0) + 1 }); continue; }
    base.sources.add(`Driver report API ${outcome.version}`.trim());
    if (base.dropEmpty && outcome.section.jobTotal === 0) emptied.push({ initials, name: outcome.section.driver.name });
    else sections.push(outcome.section);
  }
  sections.sort((a, b) => base.requested.indexOf(a.driver.initials) - base.requested.indexOf(b.driver.initials));
  const report: DriverJobReport = { title: REPORT_TITLE, range: base.range, generatedAt: base.generatedAt, sources: [...base.sources].filter(Boolean), sections, requested: base.requested, dropEmpty: base.dropEmpty, empty: emptied, excluded: base.excluded };
  if (failed.length) report.failed = failed;
  report.notes = notesFor(report);
  return report;
}

/** One section per driver, in the order given, loaded a few at a time (DRIVER_CONCURRENCY).
 *  By default the first failure rejects. With `continueOnError` a failed driver is recorded in `report.failed`
 *  and left out, and the others are still returned (a partial report); it rejects only when every driver failed.
 *  A cancelled request always rejects. */
export async function loadDriverJobReport(drivers: string[], range: { from: string; to: string }, options: LoadOptions = {}): Promise<DriverJobReport> {
  const requested = [...new Set(drivers)];
  const outcomes = await loadOutcomes(requested, range, options);
  const firstFailure = [...outcomes.values()].find((outcome): outcome is Extract<Outcome, { kind: "failed" }> => outcome.kind === "failed");
  if (firstFailure && ![...outcomes.values()].some(outcome => outcome.kind === "ok")) throw new Error(firstFailure.message);
  return assemble({ requested, range, generatedAt: (options.now?.() ?? new Date()).toISOString(), dropEmpty: !!options.dropEmpty, excluded: options.excluded, sources: new Set() }, [], [], outcomes, new Map());
}

/** Loads only the drivers that failed, keeps every driver that already loaded, and returns the merged report.
 *  Nothing already loaded is requested again and no job is added twice. Drivers that fail again stay in
 *  `failed` with a higher attempt count. A cancelled retry rejects and leaves the given report untouched. */
export async function retryFailedDrivers(report: DriverJobReport, options: LoadOptions = {}): Promise<DriverJobReport> {
  const targets = (report.failed ?? []).map(item => item.initials);
  if (!targets.length) return report;
  const outcomes = await loadOutcomes(targets, report.range, { ...options, continueOnError: true, dropEmpty: !!report.dropEmpty });
  const attempts = new Map((report.failed ?? []).map(item => [item.initials, item.attempts]));
  const retried = new Set(targets);
  return assemble({ requested: report.requested ?? [...report.sections.map(section => section.driver.initials), ...targets], range: report.range, generatedAt: (options.now?.() ?? new Date()).toISOString(), dropEmpty: !!report.dropEmpty, excluded: report.excluded, sources: new Set(report.sources) },
    report.sections.filter(section => !retried.has(section.driver.initials)), report.empty ?? [], outcomes, attempts);
}

/** Combined totals for a report covering several drivers. Each job has one assigned
 *  driver code, so adding the driver sections counts every job once. A value unavailable
 *  in any section (or a driver that failed to load) makes the combined total unavailable;
 *  the sum of the drivers that do have one is kept apart as a known subtotal. A section
 *  that is known-only makes the combined value known-only. */
export function combinedSummary(report: DriverJobReport): SummaryLine[] | null {
  const failed = report.failed?.length ?? 0;
  if (!report.sections.length || report.sections.length + failed < 2) return null;
  return report.sections[0].summary.map((line, index) => {
    const lines = report.sections.map(section => section.summary[index]);
    const present = lines.filter(item => item?.value != null);
    const missing = lines.length - present.length + failed;
    const knownSum = present.reduce((sum, item) => sum + (item!.value as number), 0);
    if (missing > 0) {
      const detail = present.length ? `Known subtotal ${formatValue(knownSum, line.unit)} from ${present.length} of ${lines.length + failed} drivers; the complete total is not available` : "Not available for any selected driver";
      return { key: line.key, label: line.label, unit: line.unit, value: null, coverage: "unavailable", knownSubtotal: present.length ? knownSum : null, note: detail };
    }
    const knownOnly = lines.some(item => item?.coverage === "known-only");
    return { key: line.key, label: line.label, unit: line.unit, value: knownSum, coverage: knownOnly ? "known-only" : "complete", note: knownOnly ? "Includes known values only; some jobs had no value" : undefined };
  });
}

/** Whether a report can be read as final. Anything short of every requested driver and every job
 *  row is PARTIAL, and says why; a complete report with no jobs is EMPTY (a valid result). */
export type ReportStatus = "COMPLETE" | "PARTIAL" | "EMPTY";
export function reportStatus(report: DriverJobReport): { status: ReportStatus; label: string; reasons: string[] } {
  const reasons: string[] = [];
  const failed = report.failed ?? [];
  if (failed.length) reasons.push(`${failed.length} ${failed.length === 1 ? "driver" : "drivers"} could not be loaded: ${failed.map(item => item.initials).join(", ")}`);
  const cut = report.sections.filter(section => section.jobs.length < section.jobTotal);
  if (cut.length) reasons.push(`job list shortened for ${cut.map(section => section.driver.initials).join(", ")} (${cut.map(section => `${section.jobs.length} of ${section.jobTotal}`).join(", ")}); totals still cover every job`);
  const unreadable = report.sections.filter(section => section.rejected > 0);
  if (unreadable.length) reasons.push(`${unreadable.reduce((sum, section) => sum + section.rejected, 0)} unreadable server records were left out (${unreadable.map(section => section.driver.initials).join(", ")})`);
  if (reasons.length) return { status: "PARTIAL", label: "PARTIAL REPORT", reasons };
  if (totalJobs(report) === 0) return { status: "EMPTY", label: "COMPLETE, NO JOBS", reasons: ["No jobs found for the selected period."] };
  return { status: "COMPLETE", label: "COMPLETE", reasons: [] };
}

/** How a summary total reads in text formats (preview, PDF, Word). Known-only totals say so; an
 *  unavailable total is never a number. The spreadsheet formats keep the raw number and write
 *  coverage and notes in their own columns. */
export function lineText(line: SummaryLine): string {
  if (line.coverage === "unavailable" || line.value === null) return NOT_AVAILABLE;
  return line.coverage === "known-only" ? `${formatValue(line.value, line.unit)} (known only)` : formatValue(line.value, line.unit);
}

export function totalJobs(report: DriverJobReport): number {
  return report.sections.reduce((sum, section) => sum + section.jobTotal, 0);
}

/* -------------------------------------------------------------- formatting ---- */

export const GBP = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
/** What a figure the source did not provide reads as, in every format. Never "0" or "£0.00". */
export const NOT_AVAILABLE = "Not available";
export const NOT_RECORDED = "Not recorded";
export const isMissingText = (text: string) => text === NOT_AVAILABLE || text === NOT_RECORDED;
export function formatValue(value: number | null, unit: Unit): string {
  if (value === null || !Number.isFinite(value)) return NOT_AVAILABLE;
  if (unit === "pence") return GBP.format(value / 100);
  if (unit === "minutes") { const total = Math.round(value); return `${Math.floor(total / 60)}h ${String(total % 60).padStart(2, "0")}m`; }
  return String(value);
}
export function formatDate(iso: string | null): string {
  return iso ? DateTime.fromISO(iso, { zone: ZONE }).toFormat("d LLL yyyy") : "Not recorded";
}
export function generatedLabel(iso: string): string {
  return `${DateTime.fromISO(iso).setZone(ZONE).toFormat("d LLL yyyy, HH:mm")}, London time`;
}

/** The job table every format uses: header, how to read the value, and its unit. */
export const JOB_COLUMNS: Array<{ key: keyof JobLine; header: string; unit?: Unit | "date" | "text"; width: number }> = [
  { key: "jobId", header: "Job ID", unit: "text", width: 16 },
  { key: "date", header: "Date", unit: "date", width: 12 },
  { key: "bookedTime", header: "Booked", unit: "text", width: 8 },
  { key: "customer", header: "Customer", unit: "text", width: 20 },
  { key: "pickup", header: "Pickup", unit: "text", width: 30 },
  { key: "dropoff", header: "Drop-off", unit: "text", width: 30 },
  { key: "status", header: "Status", unit: "text", width: 17 },
  { key: "scheduledMinutes", header: "Scheduled", unit: "minutes", width: 10 },
  { key: "workingMinutes", header: "Working time", unit: "minutes", width: 12 },
  { key: "driverReportedMinutes", header: "Driver-reported time", unit: "minutes", width: 14 },
  { key: "finalChargePence", header: "Final charge", unit: "pence", width: 12 },
  { key: "paymentMethods", header: "Payment methods", unit: "text", width: 18 },
  { key: "receiptsPence", header: "Recorded receipts", unit: "pence", width: 14 },
  { key: "manualEntryPence", header: "Manual entry", unit: "pence", width: 12 }
];

/** The PDF and print job table: each column's share of the page width, in percent. A separate
 *  set from the spreadsheet widths above (those are characters); the shares add up to exactly 100. */
export const PDF_SHARE: Record<keyof JobLine, number> = {
  jobId: 9, date: 7.5, bookedTime: 5, customer: 8.5, pickup: 8.5, dropoff: 8.5, status: 8.5,
  scheduledMinutes: 6.2, workingMinutes: 5.5, driverReportedMinutes: 6.3, finalChargePence: 6.8,
  paymentMethods: 6.7, receiptsPence: 6.5, manualEntryPence: 6.5
};

export function cellText(line: JobLine, column: (typeof JOB_COLUMNS)[number]): string {
  const value = line[column.key];
  if (column.unit === "date") return formatDate(value as string | null);
  if (column.unit === "pence" || column.unit === "minutes" || column.unit === "count") return formatValue(value as number | null, column.unit);
  return value === null || value === undefined || value === "" ? "Not recorded" : String(value);
}

/** tmv-driver-jobs-KA-2026-10-05-to-2026-10-11.pdf. Built from the report's own range and drivers,
 *  letters, digits and dashes only, so it is the same on every system and never the browser tab title. */
export function reportFileName(report: DriverJobReport, extension: string): string {
  const { first, last } = { first: DateTime.fromISO(report.range.from).setZone(ZONE).toISODate(), last: DateTime.fromISO(report.range.to).setZone(ZONE).toISODate() };
  const who = report.sections.length === 1 ? report.sections[0].driver.initials.replace(/[^A-Za-z0-9]/g, "") || "driver" : "drivers";
  return `tmv-driver-jobs-${who}-${first}-to-${last}.${extension}`;
}
