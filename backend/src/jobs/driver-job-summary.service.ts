import { DateTime } from "luxon";
import { getJobForDriver } from "./jobs.service";
import { ExtraChargeType, JobStatus } from "./job.types";
import { reportJobPayments } from "../reports/report-payments";
import { ValidationError } from "../workflow/validation.engine";
import {
  type DriverJobSummaryPaymentItem, type DriverSummaryPaymentMethod, type DriverReportedCharge,
  getDriverJobSummary, insertDriverJobSummary, type NewDriverJobSummary, type DriverJobSummaryDoc
} from "../db/driver-job-summary.repo";
import { appendActivity } from "../db/activity.repo";
import { invalidateDashboardDataset } from "../admin/dashboard/dataset-cache";
import { withJobLock } from "../utils/lock";
import { log } from "../utils/logger";

const METHODS = ["Cash", "Card", "Link", "Bank Transfer", "Invoice"] as const;
const MAX_PENCE = 100_000_000;

export class ManualDetailsLockedError extends ValidationError {
  constructor() { super("Manual details have already been submitted and are locked."); }
}

function text(value: unknown, field: string, limit: number): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string" || value.length > limit) throw new ValidationError(`${field} is invalid or too long.`);
  return value.trim();
}

function instant(value: unknown, field: string): string {
  if (typeof value !== "string" || !/(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) throw new ValidationError(`${field} requires a date/time with timezone.`);
  const time = DateTime.fromISO(value, { setZone: true });
  if (!time.isValid) throw new ValidationError(`${field} must be a valid date/time.`);
  return time.toUTC().toISO()!;
}

function money(value: unknown, field: string, optional = false): number | null {
  if (optional && (value === undefined || value === null || value === "")) return null;
  if (typeof value !== "string" && typeof value !== "number") throw new ValidationError(`${field} must be a valid amount.`);
  const raw = String(value).trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(raw)) throw new ValidationError(`${field} must be a non-negative amount with at most two decimals.`);
  const [whole, fraction = ""] = raw.split(".");
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(amount) || amount > MAX_PENCE) throw new ValidationError(`${field} exceeds the supported limit.`);
  return amount;
}

function flag(value: unknown, field: string): boolean {
  if (value === undefined) return false;
  if (typeof value !== "boolean") throw new ValidationError(`${field} must be Yes or No.`);
  return value;
}

function payments(body: Record<string, unknown>): DriverJobSummaryPaymentItem[] {
  if (!Array.isArray(body.paymentMethods)) throw new ValidationError("Choose payment methods or No payment received.");
  const raw = body.paymentMethods;
  if (new Set(raw).size !== raw.length || raw.some(method => !(METHODS as readonly string[]).includes(method as string))) {
    throw new ValidationError("Payment methods must be unique valid selections; choose Bank Transfer or Invoice separately.");
  }
  const noPayment = flag(body.noPaymentReceived, "No payment received");
  if ((noPayment && raw.length) || (!noPayment && !raw.length)) throw new ValidationError("Choose payment methods or No payment received.");
  const amounts = body.paymentAmounts;
  if (!amounts || typeof amounts !== "object" || Array.isArray(amounts)) throw new ValidationError("Payment amounts are invalid.");
  return METHODS.filter(method => raw.includes(method)).map(method => ({ method,
    amountPence: money((amounts as Record<string, unknown>)[method], `${method} amount`)! }));
}

function charges(body: Record<string, unknown>): DriverReportedCharge[] {
  if (body.congestionCharge !== undefined) flag(body.congestionCharge, "Congestion charge");
  if (body.chargeItems === undefined) return body.congestionCharge === true ? [{ type: "congestion", amountPence: money(body.congestionChargeAmount, "Congestion amount", true) }] : [];
  if (!Array.isArray(body.chargeItems) || body.chargeItems.length > 30) throw new ValidationError("Report at most 30 charge items.");
  let congestion = 0;
  const references = new Set<string>();
  return body.chargeItems.map(raw => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new ValidationError("Charge item is invalid.");
    const row = raw as Record<string, unknown>;
    if (row.type !== "congestion" && row.type !== "tunnel") throw new ValidationError("Choose a valid charge type.");
    if (row.type === "congestion" && ++congestion > 1) throw new ValidationError("Report congestion once per job.");
    const reference = text(row.reference, "Charge reference", 160);
    const key = `${row.type}:${reference}`;
    if (reference && references.has(key)) throw new ValidationError("A charge reference cannot be reported twice.");
    references.add(key);
    const name = text(row.name, "Charge name", 160);
    return { type: row.type, amountPence: money(row.amount, "Charge amount", true),
      ...(name ? { name } : {}), ...(reference ? { reference } : {}) };
  });
}

function payload(summary: DriverJobSummaryDoc | NewDriverJobSummary): string {
  return JSON.stringify([summary.jobId, summary.driverEmail, summary.driverInitials, summary.schemaVersion,
    summary.startTime, summary.endTime, summary.driverJobHours, summary.helperName, summary.helperHours, summary.paymentBreakdown,
    summary.noPaymentReceived, summary.chargeItems?.map(row => [row.type, row.amountPence, row.name ?? "", row.reference ?? ""]), summary.paymentVerificationIssues]);
}

export async function submitDriverJobSummary(jobId: string, driverEmail: string, body: Record<string, unknown>) {
  return withJobLock(jobId, async () => {
    const { job, driver } = await getJobForDriver(jobId, driverEmail);
    if (job.status !== JobStatus.COMPLETED) throw new ValidationError("Complete this job before submitting Manual details.");
    if (body.schemaVersion !== undefined && body.schemaVersion !== 2 && body.schemaVersion !== 3) throw new ValidationError("Unsupported Manual details version.");
    const hoursOnly = body.schemaVersion === 3;
    const selectedHours = (value: unknown, field: string, optional = false): number => {
      if (optional && (value === undefined || value === "")) return 0;
      if ((typeof value !== "string" && typeof value !== "number") || String(value).trim() === "") throw new ValidationError(`Select ${field}.`);
      const hours = Number(value);
      if (!Number.isFinite(hours) || hours < 2 || hours > 14 || !Number.isInteger(hours * 2)) throw new ValidationError(`${field} must be 2 to 14 hours in half-hour steps.`);
      return hours;
    };
    const driverJobHours = hoursOnly ? selectedHours(body.driverJobHours, "driver job hours") : undefined;
    const startTime = hoursOnly ? job.actualStart || job.bookedStart : instant(body.startTime, "Start time");
    const endTime = hoursOnly ? job.actualFinish : instant(body.endTime, "End time");
    const hours = (Date.parse(endTime) - Date.parse(startTime)) / 3_600_000;
    if (!hoursOnly && (hours < 0 || hours > 168)) throw new ValidationError("Job times must be ordered and span at most seven days.");
    const helperName = text(body.helperName, "Helper name", 160);
    const helperRaw = body.helperHours === undefined || body.helperHours === "" ? "0" : String(body.helperHours).trim();
    if ((typeof body.helperHours !== "string" && typeof body.helperHours !== "number" && body.helperHours !== undefined) || !/^\d+(?:\.\d{1,2})?$/.test(helperRaw)) {
      throw new ValidationError("Helper hours must be a non-negative number with at most two decimals.");
    }
    const helperHours = hoursOnly ? selectedHours(body.helperHours, "helper job hours", true) : Number(helperRaw);
    if (!hoursOnly && (helperHours > 168 || (helperHours > 0 && !helperName))) throw new ValidationError("Add a helper name for helper hours, or leave both blank.");
    const flowPayments = reportJobPayments(job).payments;
    let paymentBreakdown: DriverJobSummaryPaymentItem[] | undefined;
    if (!hoursOnly) paymentBreakdown = payments(body);
    else if (flowPayments.issues.length) paymentBreakdown = job.paymentBreakdown?.map(row => ({
      method: row.method as DriverSummaryPaymentMethod, amountPence: money(row.amount, `${row.method} amount`)!
    }));
    else paymentBreakdown = METHODS.filter(method => flowPayments.byMethod[method] > 0 || job.paymentBreakdown?.some(row => row.method === method))
      .map(method => ({ method, amountPence: flowPayments.byMethod[method] }));
    const chargeItems: DriverReportedCharge[] = hoursOnly ? ([
      ["congestion", ExtraChargeType.CONGESTION, job.chargeSnapshot?.congestionPence ?? job.roadTariffSnapshot?.congestionPence],
      ["tunnel", ExtraChargeType.TUNNEL, job.chargeSnapshot?.tunnelPence ?? job.roadTariffSnapshot?.tunnelPence]
    ] as const).filter(([, type]) => job.extraCharges.includes(type)).map(([type, , amount]) => ({ type, amountPence: amount ?? null })) : charges(body);
    const congestionCharge = chargeItems.some(row => row.type === "congestion");
    const amountCollectedPence = hoursOnly ? flowPayments.collectedPence ?? flowPayments.knownCollectedPence : paymentBreakdown!.filter(row => row.method !== "Invoice").reduce((sum, row) => sum + row.amountPence, 0);
    if (amountCollectedPence > MAX_PENCE) throw new ValidationError("Total collections exceed the supported limit.");
    const summary: NewDriverJobSummary = {
      schemaVersion: hoursOnly ? 3 : 2, ...(hoursOnly ? { driverJobHours } : {}), jobId, driverEmail: driver.email, driverInitials: driver.initials, startTime, endTime,
      helperName, helperHours, congestionCharge,
      congestionChargePence: chargeItems.find(row => row.type === "congestion")?.amountPence ?? 0,
      chargeItems, noPaymentReceived: hoursOnly ? flowPayments.collectedPence === 0 && flowPayments.invoicePence === 0 : flag(body.noPaymentReceived, "No payment received"),
      paymentMethod: hoursOnly ? job.paymentMethod : paymentBreakdown!.map(row => row.method).join(", ") || "No payment received",
      paymentBreakdown, amountCollectedPence,
      ...(hoursOnly ? { paymentVerificationIssues: flowPayments.issues } : {}),
      invoiceAmountPence: hoursOnly ? flowPayments.invoicePence : paymentBreakdown!.find(row => row.method === "Invoice")?.amountPence ?? 0,
      submittedAt: new Date().toISOString()
    };
    const existing = await getDriverJobSummary(jobId);
    if (existing) {
      if (payload(existing) === payload(summary)) { invalidateDashboardDataset(); return existing; }
      throw new ManualDetailsLockedError();
    }
    let saved: DriverJobSummaryDoc;
    try { saved = await insertDriverJobSummary(summary); }
    catch (error) {
      if ((error as { code?: number }).code !== 11000) throw error;
      const winner = await getDriverJobSummary(jobId);
      if (winner && payload(winner) === payload(summary)) { invalidateDashboardDataset(); return winner; }
      throw new ManualDetailsLockedError();
    }
    invalidateDashboardDataset();
    await appendActivity({ jobId, driver: driver.initials, action: "DRIVER_JOB_SUMMARY_SUBMITTED",
      detail: `${summary.paymentMethod} ${(amountCollectedPence / 100).toFixed(2)}`
    }).catch(error => log.warn("Manual details saved; activity log failed", { job_id: jobId, error: String(error) }));
    return saved;
  });
}
