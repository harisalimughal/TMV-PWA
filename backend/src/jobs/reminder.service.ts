import { DateTime } from "luxon";
import { env } from "../config/env";
import { listJobs, upsertJob } from "../db/jobs.repo";
import { getDriverProfileByInitials } from "../auth/driver-account.service";
import { sendJobReminderEmail } from "../google/gmail";
import { sendPushToDriver } from "../push/push.service";
import { Job, JobStatus } from "./job.types";
import { log } from "../utils/logger";

/**
 * Reminds a driver by email + push shortly before (TMV_JOB_REMINDER_LEAD_MS, default
 * 1 hour) a job they're assigned to is due to start. Runs on the same kind of plain
 * setInterval sweep server.ts already uses for the Calendar sync -- this app has no
 * external job scheduler, so "due soon" just means "found due on the next pass".
 *
 * A job only ever gets one reminder per booked time: reminderSentAt is stamped once
 * it fires, and booking.service.ts's toJob() clears that stamp itself if the booked
 * start is later edited, so a rescheduled job reminds again for its real new time.
 */
export async function sweepJobReminders(now = DateTime.now()): Promise<void> {
  const jobs = await listJobs();
  const dueAt = now.plus({ milliseconds: env.jobReminderLeadMs });
  const catchUpFrom = now.minus({ milliseconds: env.jobReminderLeadMs });

  const due = jobs.filter(job => {
    if (job.reminderSentAt) return false;
    if (job.status !== JobStatus.READY) return false;
    if (!job.driverInitials || !job.bookedStart) return false;
    const start = DateTime.fromISO(job.bookedStart, { setZone: true });
    if (!start.isValid) return false;
    // Keep a bounded catch-up window so a brief outage can still send a late
    // reminder without notifying drivers about old scheduled jobs on startup.
    return start >= catchUpFrom && start <= dueAt;
  });

  for (const job of due) {
    await sendJobReminder(job, now).catch(error =>
      log.warn("failed to send job reminder", { error: String(error), job_id: job.jobId })
    );
  }
}

async function sendJobReminder(job: Job, now: DateTime): Promise<void> {
  const driver = await getDriverProfileByInitials(job.driverInitials);
  if (!driver || !driver.active) return;

  const leadMinutes = Math.max(0, Math.round(DateTime.fromISO(job.bookedStart, { setZone: true }).diff(now, "minutes").minutes));

  await Promise.all([
    driver.email
      ? sendJobReminderEmail(driver.email, job, leadMinutes).catch(error =>
          log.warn("job reminder email failed", { error: String(error), job_id: job.jobId })
        )
      : Promise.resolve(),
    sendPushToDriver(job.driverInitials, {
      title: "Job starting soon",
      body: `${job.customerName || "Your next job"} - pickup at ${job.pickup || "TBC"} in about ${leadMinutes} min.`,
      url: "/?tab=jobs"
    }).catch(error => log.warn("job reminder push failed", { error: String(error), job_id: job.jobId }))
  ]);

  await upsertJob({ ...job, reminderSentAt: now.toUTC().toISO()! });
  log.info("sent job starting-soon reminder", { job_id: job.jobId, driver: job.driverInitials, lead_minutes: leadMinutes });
}
