import { env } from "../config/env";
import { DriverProfile, Job } from "../jobs/job.types";
import { renderMessageTemplate } from "../notifications/message";
import { withRetry, withTimeout } from "../utils/retry";

/**
 * UK mobile numbers are stored however they were typed at booking time (e.g.
 * "07123 456789"). Firetext wants international format without a leading zero, '+',
 * spaces or dashes -- 07123456789 becomes 447123456789.
 */
export function normalizeUkMobile(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("44")) return digits;
  if (digits.startsWith("0")) return `44${digits.slice(1)}`;
  return digits;
}

export class FiretextError extends Error {
  constructor(message: string, readonly statusCode: number) {
    super(message);
    this.name = "FiretextError";
  }
}

/**
 * Sends one SMS via Firetext's HTTP API (https://www.firetext.co.uk/docs). The response
 * body is "<status_no>:<credits_used> <description>", not JSON -- 0 means queued
 * successfully, anything else is an error (1 = auth, 2 = bad destination number, 7 =
 * insufficient credit, etc).
 */
async function sendSms(to: string, message: string): Promise<void> {
  const body = new URLSearchParams({
    apiKey: env.firetextApiKey,
    from: env.firetextSenderId,
    to: normalizeUkMobile(to),
    message
  });

  const response = await withTimeout(
    "Firetext send",
    withRetry(
      "firetext.sendsms",
      () => fetch("https://www.firetext.co.uk/api/sendsms", { method: "POST", body }),
      "rate-limit-only"
    ),
    env.smsTimeoutMs
  );

  const text = (await response.text()).trim();
  const statusCode = Number(text.split(":")[0]);
  if (!response.ok || statusCode !== 0) {
    throw new FiretextError(`Firetext send failed: ${text || response.status}`, statusCode);
  }
}

export async function sendJobStartedSms(
  job: Job, template: string, driver: Pick<DriverProfile, "phone" | "vanRegistration">
): Promise<void> {
  if (!env.firetextApiKey || !env.firetextSenderId) return;
  if (!job.customerPhone) return;

  await sendSms(job.customerPhone, renderMessageTemplate(template, job, driver));
}
