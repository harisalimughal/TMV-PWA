import { DateTime } from "luxon";
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

function dashboardJobUrl(jobId: string, section = "jobs"): string {
  const dashboardBase =
    process.env.TMV_DASHBOARD_URL?.trim().replace(/\/+$/, "") ||
    "https://dashboard.themanvan.co.uk";
  return `${dashboardBase}/?section=${encodeURIComponent(section)}&job=${encodeURIComponent(jobId)}`;
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

function formatLondonTimeOnly(iso?: string): string {
  if (!iso) return "Not recorded";
  const dt = DateTime.fromISO(iso, { zone: env.timezone || "Europe/London" });
  if (!dt.isValid) {
    const jsDate = new Date(iso);
    if (!isNaN(jsDate.getTime())) {
      const dt2 = DateTime.fromJSDate(jsDate, { zone: env.timezone || "Europe/London" });
      if (dt2.isValid) return dt2.toFormat("HH:mm");
    }
    return iso;
  }
  return dt.toFormat("HH:mm");
}

function formatBookedTime(bookedStart?: string, bookedFinish?: string): string {
  if (!bookedStart && !bookedFinish) return "Not recorded";
  const start = bookedStart ? formatLondonTimeOnly(bookedStart) : "Not recorded";
  const finish = bookedFinish ? formatLondonTimeOnly(bookedFinish) : "Not recorded";
  return `${start} - ${finish}`;
}

function formatTrackerArrival(job: Job): string {
  if (job.trackerArrivalAt) {
    return formatLondonTimeOnly(job.trackerArrivalAt);
  }
  let reason = job.trackerUnverifiedReason;
  if (reason && reason.includes(" away") && !reason.includes(" away from pickup point")) {
    reason = reason.replace(/ away(\b)/, " away from pickup point$1");
  }
  return reason ? `Unverified (${reason})` : "Unverified";
}

interface TimingsBreakdown {
  booked: string;
  onMyWay: string;
  trackerArrival: string;
  pickupArrival: string;
  vanLoaded: string;
  emptyVan: string;
  customerSignature: string;
}

function getTimingsBreakdown(job: Job): TimingsBreakdown {
  return {
    booked: formatBookedTime(job.bookedStart, job.bookedFinish),
    onMyWay: formatLondonTimeOnly(job.onMyWayAt),
    trackerArrival: formatTrackerArrival(job),
    pickupArrival: formatLondonTimeOnly(job.pickupArrivalAt || job.actualStart),
    vanLoaded: formatLondonTimeOnly(job.vanLoadedAt),
    emptyVan: formatLondonTimeOnly(job.actualFinish),
    customerSignature: formatLondonTimeOnly(job.clientSignatureAt)
  };
}

function renderTimingsTextLines(timings: TimingsBreakdown): string[] {
  return [
    `Booked: ${timings.booked}`,
    `On my way: ${timings.onMyWay}`,
    `Tracker arrival: ${timings.trackerArrival}`,
    `Proof of arrival photo: ${timings.pickupArrival}`,
    `Van loaded photo: ${timings.vanLoaded}`,
    `Empty van photo: ${timings.emptyVan}`,
    `Customer signature time: ${timings.customerSignature}`
  ];
}

const row = (label: string, value: string) =>
  `<tr><td style="padding:6px 12px;color:#667085;font-size:13px;">${escapeHtml(label)}</td>` +
  `<td style="padding:6px 12px;color:#101828;font-size:13px;font-weight:600;">${escapeHtml(value || "Not recorded")}</td></tr>`;

const sectionHeaderRow = (title: string) =>
  `<tr><td colspan="2" style="padding:12px 12px 6px;color:#475467;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;border-top:1px solid #eaecf0;">${escapeHtml(title)}</td></tr>`;

function renderTimingsHtmlRows(timings: TimingsBreakdown): string {
  return (
    row("Booked", timings.booked) +
    row("On my way", timings.onMyWay) +
    row("Tracker arrival", timings.trackerArrival) +
    row("Proof of arrival photo", timings.pickupArrival) +
    row("Van loaded photo", timings.vanLoaded) +
    row("Empty van photo", timings.emptyVan) +
    row("Customer signature time", timings.customerSignature)
  );
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
  const viewUrl = dashboardJobUrl(job.jobId, "finished");
  const driverLabel = `${driver.fullName || "Unknown driver"} (${driver.initials || job.driverInitials || "—"})`;
  const total = job.amountCharged ?? job.totalCharges ?? job.calculatedTotalCharges ?? job.basePrice;
  const subjectText = opsJobCompletionSubject(job, driver);
  const timings = getTimingsBreakdown(job);
  const lines = [
    subjectText,
    "",
    `Customer: ${job.customerName || "Not recorded"}`,
    `Driver: ${driverLabel}`,
    driver.vanRegistration ? `Van: ${driver.vanRegistration}` : "",
    `Pickup: ${job.pickup || "Not recorded"}`,
    `Drop-off: ${job.dropoff || "Not recorded"}`,
    "",
    "Timings:",
    ...renderTimingsTextLines(timings),
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

  const html =
    `<!doctype html><html><body style="margin:0;background:#f6f7f9;font-family:Arial,sans-serif;color:#101828;">` +
    `<div style="max-width:640px;margin:0 auto;padding:24px;">` +
    `<div style="background:#ffffff;border:1px solid #eaecf0;border-radius:12px;padding:22px;">` +
    `<p style="margin:0 0 6px;color:#12B76A;font-size:12px;font-weight:700;text-transform:uppercase;">Job completed</p>` +
    `<h1 style="margin:0 0 16px;font-size:22px;line-height:1.25;">${escapeHtml(subjectText)}</h1>` +
    `<table style="width:100%;border-collapse:collapse;margin-bottom:18px;">` +
    row("Customer", job.customerName) +
    row("Driver", driverLabel) +
    (driver.vanRegistration ? row("Van", driver.vanRegistration) : "") +
    row("Pickup", job.pickup) +
    row("Drop-off", job.dropoff) +
    sectionHeaderRow("Timings") +
    renderTimingsHtmlRows(timings) +
    row("Duration", `${job.actualMinutes || 0} minutes (${job.differenceMinutes || 0} min difference)`) +
    row("Delay", job.delayStatus || "Not recorded") +
    sectionHeaderRow("Payment & Audit") +
    row("Payment", `${job.paymentMethod || "Not recorded"} / ${job.paymentStatus || "Not recorded"}`) +
    row("Amount charged", pounds(total)) +
    row("Calculated total", pounds(job.calculatedTotalCharges ?? job.totalCharges)) +
    (job.totalAdjustmentNote ? row("Adjustment note", job.totalAdjustmentNote) : "") +
    row("Client confirmed by", job.clientConfirmedBy || "Not recorded") +
    row("Evidence", evidenceLine(evidence).replace(/\n/g, " | ")) +
    `</table>` +
    `<a href="${escapeHtml(viewUrl)}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;border-radius:8px;padding:11px 16px;font-size:14px;font-weight:700;">View More</a>` +
    `</div></div></body></html>`;

  return { text: lines.join("\n"), html };
}

function renderOpsStepEmail({
  job,
  driver,
  stepBadge,
  badgeColor = "#2563eb",
  message,
  section = "jobs"
}: {
  job: Job;
  driver: Pick<DriverProfile, "fullName" | "initials" | "email" | "vanRegistration">;
  stepBadge: string;
  badgeColor?: string;
  message: string;
  section?: string;
}): EmailContent {
  const viewUrl = dashboardJobUrl(job.jobId, section);
  const driverLabel = `${driver.fullName || "Unknown driver"} (${driver.initials || job.driverInitials || "—"})`;
  const timings = getTimingsBreakdown(job);

  const textLines = [
    message,
    "",
    `Customer: ${job.customerName || "Not recorded"}`,
    `Driver: ${driverLabel}`,
    driver.vanRegistration ? `Van: ${driver.vanRegistration}` : "",
    `Pickup: ${job.pickup || "Not recorded"}`,
    `Drop-off: ${job.dropoff || "Not recorded"}`,
    job.clientConfirmedBy ? `Client confirmed by: ${job.clientConfirmedBy}` : "",
    "",
    "Timings:",
    ...renderTimingsTextLines(timings),
    "",
    `View more: ${viewUrl}`
  ].filter(Boolean);

  const html =
    `<!doctype html><html><body style="margin:0;background:#f6f7f9;font-family:Arial,sans-serif;color:#101828;">` +
    `<div style="max-width:640px;margin:0 auto;padding:24px;">` +
    `<div style="background:#ffffff;border:1px solid #eaecf0;border-radius:12px;padding:22px;">` +
    `<p style="margin:0 0 6px;color:${escapeHtml(badgeColor)};font-size:12px;font-weight:700;text-transform:uppercase;">${escapeHtml(stepBadge)}</p>` +
    `<h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;">${escapeHtml(message)}</h1>` +
    `<table style="width:100%;border-collapse:collapse;margin-bottom:18px;">` +
    row("Customer", job.customerName) +
    row("Driver", driverLabel) +
    (driver.vanRegistration ? row("Van", driver.vanRegistration) : "") +
    row("Pickup", job.pickup) +
    row("Drop-off", job.dropoff) +
    (job.clientConfirmedBy ? row("Client confirmed by", job.clientConfirmedBy) : "") +
    sectionHeaderRow("Timings") +
    renderTimingsHtmlRows(timings) +
    `</table>` +
    `<a href="${escapeHtml(viewUrl)}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;border-radius:8px;padding:11px 16px;font-size:14px;font-weight:700;">View More</a>` +
    `</div></div></body></html>`;

  return { text: textLines.join("\n"), html };
}

export function opsVanLoadedSubject(job: Pick<Job, "customerName">): string {
  return `Van loaded - ${job.customerName || "Customer"}`;
}

export function renderOpsVanLoadedEmail(
  job: Job,
  driver: Pick<DriverProfile, "fullName" | "initials" | "email" | "vanRegistration">
): EmailContent {
  const driverName = driver.fullName || driver.initials || driver.email || "Driver";
  const customerName = job.customerName || "Customer";
  return renderOpsStepEmail({
    job,
    driver,
    stepBadge: "Van loaded",
    badgeColor: "#2563eb",
    message: `${driverName} has loaded the van for ${customerName} job.`,
    section: "jobs"
  });
}

export function opsVanUnloadedSubject(job: Pick<Job, "customerName">): string {
  return `Van unloaded - ${job.customerName || "Customer"}`;
}

export function renderOpsVanUnloadedEmail(
  job: Job,
  driver: Pick<DriverProfile, "fullName" | "initials" | "email" | "vanRegistration">
): EmailContent {
  const driverName = driver.fullName || driver.initials || driver.email || "Driver";
  const customerName = job.customerName || "Customer";
  return renderOpsStepEmail({
    job,
    driver,
    stepBadge: "Van unloaded",
    badgeColor: "#0891b2",
    message: `${driverName} has unloaded the van for ${customerName} job.`,
    section: "jobs"
  });
}

export function opsCustomerSignedSubject(job: Pick<Job, "customerName">): string {
  return `Customer signed - ${job.customerName || "Customer"}`;
}

export function renderOpsCustomerSignedEmail(
  job: Job,
  driver: Pick<DriverProfile, "fullName" | "initials" | "email" | "vanRegistration">
): EmailContent {
  const driverName = driver.fullName || driver.initials || driver.email || "Driver";
  const customerName = job.customerName || "Customer";
  return renderOpsStepEmail({
    job,
    driver,
    stepBadge: "Customer signed",
    badgeColor: "#12B76A",
    message: `${driverName} captured customer signature for ${customerName} job.`,
    section: "jobs"
  });
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

export function renderTemplatedEmailContent(
  template: string,
  job: Job,
  driver?: Pick<DriverProfile, "phone" | "vanRegistration" | "fullName">,
  htmlTemplate?: string
): EmailContent {
  const html = htmlTemplate?.trim()
    ? renderMessageTemplate(htmlTemplate, job, driver)
    : undefined;
  return {
    text: renderMessageTemplate(template, job, driver),
    html
  };
}

export async function sendJobStartedEmail(
  job: Job,
  template: string,
  driver: Pick<DriverProfile, "phone" | "vanRegistration" | "fullName">,
  htmlTemplate?: string
): Promise<void> {
  if (!job.customerEmail) return;
  // Subject is email-only (SMS has no equivalent concept), so it stays fixed rather
  // than living in the admin-editable body template.
  const subject = `Your ${env.notificationFromName} team has started your job`;
  await sendEmail(job.customerEmail, subject, renderTemplatedEmailContent(template, job, driver, htmlTemplate));
}

export async function sendReviewRequestEmail(job: Job, template: string, htmlTemplate?: string): Promise<void> {
  if (!job.customerEmail) return;
  const subject = "We'd love your feedback";
  await sendEmail(job.customerEmail, subject, renderTemplatedEmailContent(template, job, undefined, htmlTemplate));
}

export async function sendOpsJobCompletionEmail(
  job: Job,
  driver: Pick<DriverProfile, "fullName" | "initials" | "email" | "vanRegistration">,
  evidence?: EvidenceProgress
): Promise<void> {
  const subject = opsJobCompletionSubject(job, driver);
  await sendEmail("info@themanvan.co.uk", subject, renderOpsJobCompletionEmail(job, driver, evidence));
}

export async function sendOpsVanLoadedEmail(
  job: Job,
  driver: Pick<DriverProfile, "fullName" | "initials" | "email" | "vanRegistration">
): Promise<void> {
  await sendEmail("info@themanvan.co.uk", opsVanLoadedSubject(job), renderOpsVanLoadedEmail(job, driver));
}

export async function sendOpsVanUnloadedEmail(
  job: Job,
  driver: Pick<DriverProfile, "fullName" | "initials" | "email" | "vanRegistration">
): Promise<void> {
  await sendEmail("info@themanvan.co.uk", opsVanUnloadedSubject(job), renderOpsVanUnloadedEmail(job, driver));
}

export async function sendOpsCustomerSignedEmail(
  job: Job,
  driver: Pick<DriverProfile, "fullName" | "initials" | "email" | "vanRegistration">
): Promise<void> {
  await sendEmail("info@themanvan.co.uk", opsCustomerSignedSubject(job), renderOpsCustomerSignedEmail(job, driver));
}

/** Gated behind notifications/message-catalog.ts's DRIVER_JOB_ASSIGNMENT_EMAIL --
 *  off by default (see that catalog entry's own comment for why). Called from
 *  jobs/driver-notify.ts alongside the (always-on-by-default) assignment push.
 *  Unlike sendJobStartedEmail/sendReviewRequestEmail above, `body` arrives already
 *  rendered -- driver-notify.ts resolves it via message-catalog.ts's getMessageBody,
 *  which does the same renderMessageTemplate() call itself, so doing it again here
 *  would be a harmless but pointless no-op every {placeholder} has already resolved. */
export async function sendDriverJobAssignmentEmail(driverEmail: string, job: Job, body: string, htmlBody?: string): Promise<void> {
  if (!driverEmail) return;
  const subject = `New job assigned — ${job.customerName || "your next job"}`;
  await sendEmail(driverEmail, subject, { text: body, html: htmlBody?.trim() || undefined });
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
