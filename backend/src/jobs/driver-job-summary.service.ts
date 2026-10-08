import { getJobForDriver } from "./jobs.service";
import { JobStatus } from "./job.types";
import { ValidationError } from "../workflow/validation.engine";
import {
  DriverJobSummaryPaymentItem,
  DriverSummaryPaymentMethod,
  getDriverJobSummary,
  insertDriverJobSummary,
  NewDriverJobSummary
} from "../db/driver-job-summary.repo";
import { appendActivity } from "../db/activity.repo";
import { invalidateDashboardDataset } from "../admin/dashboard/dataset-cache";

const PAYMENT_METHODS = new Set<DriverSummaryPaymentMethod>(["Cash", "Card", "Link", "Invoice/Transfer"]);

function parseIso(value: unknown, field: string): string {
  const text = String(value ?? "").trim();
  const ms = new Date(text).getTime();
  if (!text || !Number.isFinite(ms)) throw new ValidationError(`${field} must be a valid date/time.`);
  return new Date(ms).toISOString();
}

function parseMoneyPence(value: unknown, field: string): number {
  const text = String(value ?? "").trim();
  const amount = Number(text);
  if (!text || !Number.isFinite(amount) || amount < 0) throw new ValidationError(`${field} must be a valid amount.`);
  return Math.round(amount * 100);
}

function parseOptionalMoneyPence(value: unknown, field: string): number {
  const text = String(value ?? "").trim();
  if (!text) return 0;
  return parseMoneyPence(text, field);
}

function parseHelperHours(value: unknown): number {
  const text = String(value ?? "").trim();
  if (!text) return 0;
  const hours = Number(text);
  if (!text || !Number.isFinite(hours) || hours < 0 || hours > 24) {
    throw new ValidationError("Helper hours must be a number between 0 and 24.");
  }
  return Math.round(hours * 100) / 100;
}

function parsePaymentBreakdown(body: Record<string, unknown>): DriverJobSummaryPaymentItem[] {
  const rawMethods = Array.isArray(body.paymentMethods) ? body.paymentMethods : [];
  const paymentAmounts = body.paymentAmounts && typeof body.paymentAmounts === "object"
    ? body.paymentAmounts as Record<string, unknown>
    : {};

  const methods = rawMethods
    .map(value => String(value).trim() as DriverSummaryPaymentMethod)
    .filter(method => PAYMENT_METHODS.has(method));

  if (methods.length === 0) throw new ValidationError("Choose at least one payment method.");

  return methods.map(method => ({
    method,
    amountPence: parseMoneyPence(paymentAmounts[method], `${method} amount`)
  }));
}

export async function submitDriverJobSummary(jobId: string, driverEmail: string, body: Record<string, unknown>) {
  const { job, driver } = await getJobForDriver(jobId, driverEmail);
  if (job.status !== JobStatus.COMPLETED) {
    throw new ValidationError("This job must be completed before submitting the job summary.");
  }

  const existing = await getDriverJobSummary(job.jobId);
  if (existing) throw new ValidationError("The job summary has already been submitted and is locked.");

  const paymentBreakdown = parsePaymentBreakdown(body);
  const paymentMethod = paymentBreakdown.map(row => row.method).join(", ");

  const startTime = parseIso(body.startTime, "Start time");
  const endTime = parseIso(body.endTime, "End time");
  if (new Date(endTime).getTime() < new Date(startTime).getTime()) {
    throw new ValidationError("End time cannot be before start time.");
  }

  const congestionCharge = Boolean(body.congestionCharge);
  const congestionChargePence = congestionCharge
    ? parseOptionalMoneyPence(body.congestionChargeAmount, "Congestion charge amount")
    : 0;

  const helperName = String(body.helperName ?? "").trim();
  const helperHours = parseHelperHours(body.helperHours);
  const amountCollectedPence = paymentBreakdown.reduce((sum, row) => sum + row.amountPence, 0);
  const submittedAt = new Date().toISOString();

  const summary: NewDriverJobSummary = {
    jobId: job.jobId,
    driverEmail: driver.email,
    driverInitials: driver.initials,
    startTime,
    endTime,
    congestionCharge,
    congestionChargePence,
    helperName,
    helperHours,
    paymentMethod,
    amountCollectedPence,
    paymentBreakdown,
    submittedAt
  };

  const saved = await insertDriverJobSummary(summary);
  await appendActivity({
    jobId: job.jobId,
    driver: driver.initials,
    action: "DRIVER_JOB_SUMMARY_SUBMITTED",
    detail: `${paymentMethod} ${(amountCollectedPence / 100).toFixed(2)}`
  });
  invalidateDashboardDataset();
  return saved;
}
