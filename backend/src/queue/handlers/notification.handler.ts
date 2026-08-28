import { DateTime } from "luxon";
import { env } from "../../config/env";
import { getJob, getSetting, getDriverByInitials } from "../../google/sheets";
import { sendJobStartedEmail } from "../../google/gmail";
import { sendJobStartedSms } from "../../integrations/firetext";
import { JOB_STARTED_MESSAGE_TEMPLATE } from "../../notifications/message";
import { log } from "../../utils/logger";
import { SendClientNotificationTask } from "../queue.types";
import { JobStatus } from "../../jobs/job.types";

/**
 * Sends the "on my way" client notification (email + SMS) for a job, triggered
 * automatically by a scheduled Cloud Tasks task rather than by the driver tapping
 * "Send Message" (Req 3 — timed client notifications).
 *
 * The job and driver are re-read fresh from Sheets so a rescheduled or reassigned job
 * always uses current data, never what was enqueued.
 */
export async function handleSendClientNotification(task: SendClientNotificationTask): Promise<void> {
  const { jobId } = task;
  const job = await getJob(jobId, 0);
  if (!job) {
    log.warn("scheduled notification: job not found; skipping", { job_id: jobId });
    return;
  }
  if (!job.customerEmail && !job.customerPhone) {
    log.info("scheduled notification: no customer contact info; skipping", { job_id: jobId });
    return;
  }

  // If the job is not READY, don't send notification
  if (job.status !== JobStatus.READY) {
    log.info("scheduled notification: job is not in READY state; skipping", { job_id: jobId, status: job.status });
    return;
  }

  // Check if this task is running at the correct time relative to current bookedStart
  const startDt = DateTime.fromISO(job.bookedStart).setZone(env.timezone);
  const offsetStr = await getSetting("CLIENT_NOTIFICATION_OFFSET_MINUTES", "60");
  const offsetMinutes = Math.max(0, parseInt(offsetStr, 10) || 60);

  if (offsetMinutes === 0) {
    log.info("scheduled notification: auto-notifications are disabled (offset is 0); skipping", { job_id: jobId });
    return;
  }

  const minutesUntilStart = Math.round((startDt.toMillis() - Date.now()) / 60_000);
  
  // We expect to run around offsetMinutes before the job starts.
  // If it's running way too early (e.g. minutesUntilStart > offsetMinutes + 10), it means the job was rescheduled to a later time.
  if (minutesUntilStart > offsetMinutes + 10) {
    log.info("scheduled notification: task is running too early for the current booked start time (likely rescheduled); skipping", {
      job_id: jobId,
      minutesUntilStart,
      offsetMinutes
    });
    return;
  }

  // If the job starts in the past or is already due, we still send it as a fallback unless it's way too late (e.g. more than 30 mins after start time).
  if (minutesUntilStart < -30) {
    log.info("scheduled notification: task is running too late (more than 30 mins past start); skipping", {
      job_id: jobId,
      minutesUntilStart
    });
    return;
  }

  const driver = job.driverInitials ? await getDriverByInitials(job.driverInitials) : null;
  const template = await getSetting("JOB_STARTED_MESSAGE_TEXT", JOB_STARTED_MESSAGE_TEMPLATE);

  const driverCtx = {
    phone: driver?.phone ?? "",
    vanRegistration: driver?.vanRegistration ?? "",
    fullName: driver?.fullName ?? ""
  };

  const errors: string[] = [];

  if (job.customerEmail) {
    try {
      await sendJobStartedEmail(job, template, driverCtx);
      log.info("scheduled client email sent", { job_id: jobId, to: job.customerEmail });
    } catch (err) {
      log.warn("scheduled client email failed", { job_id: jobId, error: String(err) });
      errors.push(`email: ${String(err)}`);
    }
  }

  if (job.customerPhone) {
    try {
      await sendJobStartedSms(job, template, driverCtx);
      log.info("scheduled client SMS sent", { job_id: jobId, to: job.customerPhone });
    } catch (err) {
      log.warn("scheduled client SMS failed", { job_id: jobId, error: String(err) });
      errors.push(`sms: ${String(err)}`);
    }
  }

  if (errors.length > 0 && errors.length === (job.customerEmail ? 1 : 0) + (job.customerPhone ? 1 : 0)) {
    // All targeted channels failed — let Cloud Tasks retry
    throw new Error(`All notification channels failed for job ${jobId}: ${errors.join("; ")}`);
  }
}

