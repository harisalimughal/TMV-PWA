import { google, gmail_v1 } from "googleapis";
import { createGoogleAuth, env, SCOPES } from "../config/env";
import { DriverProfile, Job } from "../jobs/job.types";
import type { EvidenceProgress } from "../jobs/job.types";
import { renderMessageTemplate } from "../notifications/message";
import { withRetry, withTimeout } from "../utils/retry";

let clientPromise: Promise<gmail_v1.Gmail> | null = null;

async function client(): Promise<gmail_v1.Gmail> {
  if (!clientPromise) {
    // Gmail is the only service that legitimately impersonates a Workspace mailbox.
    clientPromise = createGoogleAuth(SCOPES.GMAIL, { impersonate: true })
      .then(auth => google.gmail({ version: "v1", auth }))
      .catch(error => {
        clientPromise = null;
        throw error;
      });
  }
  return clientPromise;
}

function encodeMessage(lines: string[]): string {
  return Buffer.from(lines.join("\r\n"), "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

interface EmailContent {
  text: string;
  html?: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function pounds(value: number | undefined): string {
  const amount = Number.isFinite(value) ? Number(value) : 0;
  return `£${amount.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function dashboardJobUrl(jobId: string): string {
  const dashboardBase =
    process.env.TMV_DASHBOARD_URL?.trim().replace(/\/+$/, "") ||
    "https://dashboard.themanvan.co.uk";
  return `${dashboardBase}/?section=finished&job=${encodeURIComponent(jobId)}`;
}

function evidenceLine(evidence?: EvidenceProgress): string {
  if (!evidence) return "Evidence: unavailable";
  const completed = evidence.completed || {};
  return [
    `Arrival photos: ${completed.Arrival ?? 0}`,
    `Van loaded photos: ${completed.VanLoaded ?? 0}`,
    `Empty van photos: ${completed.EmptyVan ?? 0}`,
    `Signature: ${evidence.hasSignature ? "Yes" : "No"}`
  ].join("\n");
}

export function opsJobCompletionSubject(
  job: Pick<Job, "customerName">,
  driver: Pick<DriverProfile, "fullName" | "initials" | "email">
): string {
  const driverName = driver.fullName || driver.initials || driver.email || "Driver";
  return `${driverName} completed the job of ${job.customerName || "Customer"}`;
}

export function renderOpsJobCompletionEmail(
  job: Job,
  driver: Pick<DriverProfile, "fullName" | "initials" | "email" | "vanRegistration">,
  evidence?: EvidenceProgress
): EmailContent {
  const viewUrl = dashboardJobUrl(job.jobId);
  const driverLabel = `${driver.fullName || "Unknown driver"} (${driver.initials || job.driverInitials || "—"})`;
  const total = job.amountCharged ?? job.totalCharges ?? job.calculatedTotalCharges ?? job.basePrice;
  const subjectText = opsJobCompletionSubject(job, driver);
  const lines = [
    subjectText,
    "",
    `Customer: ${job.customerName || "Not recorded"}`,
    `Driver: ${driverLabel}`,
    driver.vanRegistration ? `Van: ${driver.vanRegistration}` : "",
    `Pickup: ${job.pickup || "Not recorded"}`,
    `Drop-off: ${job.dropoff || "Not recorded"}`,
    job.stopBy ? `Stop-by: ${job.stopBy}` : "",
    "",
    `Booked: ${job.bookedStart || "Not recorded"} - ${job.bookedFinish || "Not recorded"}`,
    `Actual: ${job.actualStart || "Not recorded"} - ${job.actualFinish || "Not recorded"}`,
    `Duration: ${job.actualMinutes || 0} minutes (${job.differenceMinutes || 0} min difference)`,
    `Delay status: ${job.delayStatus || "Not recorded"}`,
    "",
    `Payment method: ${job.paymentMethod || "Not recorded"}`,
    `Payment status: ${job.paymentStatus || "Not recorded"}`,
    `Amount charged: ${pounds(total)}`,
    `Calculated total: ${pounds(job.calculatedTotalCharges ?? job.totalCharges)}`,
    job.totalAdjustmentNote ? `Adjustment note: ${job.totalAdjustmentNote}` : "",
    "",
    `Client confirmed by: ${job.clientConfirmedBy || "Not recorded"}`,
    evidenceLine(evidence),
    "",
    `View more: ${viewUrl}`
  ].filter(Boolean);

  const row = (label: string, value: string) =>
    `<tr><td style="padding:6px 12px;color:#667085;font-size:13px;">${escapeHtml(label)}</td>` +
    `<td style="padding:6px 12px;color:#101828;font-size:13px;font-weight:600;">${escapeHtml(value || "Not recorded")}</td></tr>`;

  const html =
    `<!doctype html><html><body style="margin:0;background:#f6f7f9;font-family:Arial,sans-serif;color:#101828;">` +
    `<div style="max-width:640px;margin:0 auto;padding:24px;">` +
    `<div style="background:#ffffff;border:1px solid #eaecf0;border-radius:12px;padding:22px;">` +
    `<p style="margin:0 0 6px;color:#12B76A;font-size:12px;font-weight:700;text-transform:uppercase;">Job completed</p>` +
    `<h1 style="margin:0 0 16px;font-size:22px;line-height:1.25;">${escapeHtml(subjectText)}</h1>` +
    `<table style="width:100%;border-collapse:collapse;margin-bottom:18px;">` +
    row("Customer", job.customerName) +
    row("Driver", driverLabel) +
    row("Pickup", job.pickup) +
    row("Drop-off", job.dropoff) +
    (job.stopBy ? row("Stop-by", job.stopBy) : "") +
    row("Booked", `${job.bookedStart || "Not recorded"} - ${job.bookedFinish || "Not recorded"}`) +
    row("Actual", `${job.actualStart || "Not recorded"} - ${job.actualFinish || "Not recorded"}`) +
    row("Delay", job.delayStatus || "Not recorded") +
    row("Payment", `${job.paymentMethod || "Not recorded"} / ${job.paymentStatus || "Not recorded"}`) +
    row("Amount charged", pounds(total)) +
    row("Client confirmed by", job.clientConfirmedBy || "Not recorded") +
    row("Evidence", evidenceLine(evidence).replace(/\n/g, " | ")) +
    `</table>` +
    `<a href="${escapeHtml(viewUrl)}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;border-radius:8px;padding:11px 16px;font-size:14px;font-weight:700;">View More</a>` +
    `</div></div></body></html>`;

  return { text: lines.join("\n"), html };
}

async function sendEmail(to: string, subject: string, content: EmailContent): Promise<void> {
  const gmail = await client();
  const boundary = `tmv-${Date.now().toString(36)}`;
  const lines = content.html
    ? [
        `To: ${to}`,
        `Subject: ${subject}`,
        "MIME-Version: 1.0",
        `Content-Type: multipart/alternative; boundary="${boundary}"`,
        "",
        `--${boundary}`,
        "Content-Type: text/plain; charset=UTF-8",
        "",
        content.text,
        `--${boundary}`,
        "Content-Type: text/html; charset=UTF-8",
        "",
        content.html,
        `--${boundary}--`
      ]
    : [
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "",
        content.text
      ];
  const raw = encodeMessage(lines);

  // Hard timeout: a slow Gmail call must never hold the driver on a spinner.
  await withTimeout(
    "Gmail send",
    withRetry("gmail.messages.send", () => gmail.users.messages.send({ userId: "me", requestBody: { raw } }), "rate-limit-only"),
    env.emailTimeoutMs
  );
}

async function sendPlainTextEmail(to: string, subject: string, body: string): Promise<void> {
  await sendEmail(to, subject, { text: body });
}

export async function sendJobStartedEmail(
  job: Job, template: string, driver: Pick<DriverProfile, "phone" | "vanRegistration" | "fullName">
): Promise<void> {
  if (!job.customerEmail) return;
  // Subject is email-only (SMS has no equivalent concept), so it stays fixed rather
  // than living in the shared admin-editable template. The body is exactly the same
  // rendered text sent as the SMS -- one wording, both channels, no drift.
  const subject = `Your ${env.notificationFromName} team has started your job`;
  await sendPlainTextEmail(job.customerEmail, subject, renderMessageTemplate(template, job, driver));
}

export async function sendReviewRequestEmail(job: Job, template: string): Promise<void> {
  if (!job.customerEmail) return;
  const subject = "We'd love your feedback";
  await sendPlainTextEmail(job.customerEmail, subject, renderMessageTemplate(template, job));
}

export async function sendOpsJobCompletionEmail(
  job: Job,
  driver: Pick<DriverProfile, "fullName" | "initials" | "email" | "vanRegistration">,
  evidence?: EvidenceProgress
): Promise<void> {
  const subject = opsJobCompletionSubject(job, driver);
  await sendEmail("info@themanvan.co.uk", subject, renderOpsJobCompletionEmail(job, driver, evidence));
}

/** Gated behind notifications/message-catalog.ts's DRIVER_JOB_ASSIGNMENT_EMAIL --
 *  off by default (see that catalog entry's own comment for why). Called from
 *  jobs/driver-notify.ts alongside the (always-on-by-default) assignment push.
 *  Unlike sendJobStartedEmail/sendReviewRequestEmail above, `body` arrives already
 *  rendered -- driver-notify.ts resolves it via message-catalog.ts's getMessageBody,
 *  which does the same renderMessageTemplate() call itself, so doing it again here
 *  would be a harmless but pointless no-op every {placeholder} has already resolved. */
export async function sendDriverJobAssignmentEmail(driverEmail: string, job: Job, body: string): Promise<void> {
  if (!driverEmail) return;
  const subject = `New job assigned — ${job.customerName || "your next job"}`;
  await sendPlainTextEmail(driverEmail, subject, body);
}

/** Sent from POST /api/auth/forgot-password. The link is valid for 30 minutes (see
 * auth/reset-token.ts) and is single-use in practice -- completing a reset bumps the
 * account's tokenVersion, which invalidates any other outstanding reset link too. */
export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  const subject = `Reset your ${env.notificationFromName} driver app password`;
  const body =
    `You asked to reset your password for the ${env.notificationFromName} driver app.\n\n` +
    `Tap this link to set a new password (valid for 30 minutes):\n${resetUrl}\n\n` +
    "If you didn't request this, you can safely ignore this email -- your password won't change.";
  await sendPlainTextEmail(to, subject, body);
}
