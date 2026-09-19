import { google, gmail_v1 } from "googleapis";
import { createGoogleAuth, env, SCOPES } from "../config/env";
import { DriverProfile, Job } from "../jobs/job.types";
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

async function sendPlainTextEmail(to: string, subject: string, body: string): Promise<void> {
  const gmail = await client();
  const raw = encodeMessage([
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "",
    body
  ]);

  // Hard timeout: a slow Gmail call must never hold the driver on a spinner.
  await withTimeout(
    "Gmail send",
    withRetry("gmail.messages.send", () => gmail.users.messages.send({ userId: "me", requestBody: { raw } }), "rate-limit-only"),
    env.emailTimeoutMs
  );
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
