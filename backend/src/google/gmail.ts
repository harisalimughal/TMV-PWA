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

export async function sendJobCompletionEmail(job: Job, template: string): Promise<void> {
  if (!job.customerEmail) return;
  const subject = `Your ${env.notificationFromName} move is complete — thank you!`;
  await sendPlainTextEmail(job.customerEmail, subject, renderMessageTemplate(template, job));
}
