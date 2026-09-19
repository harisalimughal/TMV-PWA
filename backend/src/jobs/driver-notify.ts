import { getDriverProfileByInitials } from "../auth/driver-account.service";
import { sendDriverJobAssignmentEmail } from "../google/gmail";
import { getMessageBody, getMessageTitle, isMessageEnabled } from "../notifications/message-catalog";
import { sendPushToDriver } from "../push/push.service";
import { Job } from "./job.types";
import { log } from "../utils/logger";

/**
 * Fires both messages a newly-assigned job can trigger for the driver -- a push
 * (DRIVER_JOB_ASSIGNED_PUSH, on by default) and an email (DRIVER_JOB_ASSIGNMENT_EMAIL,
 * off by default, see that catalog entry). Each is independently gated by its own
 * enabled flag in the admin Messaging tab, so this is the one place all three call
 * sites (a fresh Calendar booking in booking.service.ts, a job created manually or
 * reassigned in admin/dashboard/jobs.routes.ts) need to call instead of hand-rolling
 * the push (and now potentially the email) themselves.
 *
 * Best-effort throughout, matching every other notification path in this app -- a
 * driver's device being unreachable, or their profile having no email on file, must
 * never fail or block whatever just assigned them the job.
 */
export async function notifyDriverJobAssigned(job: Job, driverInitials: string): Promise<void> {
  const [pushEnabled, emailEnabled] = await Promise.all([
    isMessageEnabled("DRIVER_JOB_ASSIGNED_PUSH"),
    isMessageEnabled("DRIVER_JOB_ASSIGNMENT_EMAIL")
  ]);

  if (pushEnabled) {
    const [title, body] = await Promise.all([
      getMessageTitle("DRIVER_JOB_ASSIGNED_PUSH", job),
      getMessageBody("DRIVER_JOB_ASSIGNED_PUSH", job)
    ]);
    await sendPushToDriver(driverInitials, { title, body, url: "/?tab=jobs" }).catch(err =>
      log.warn("failed to send new-job push", { error: String(err), driverInitials, job_id: job.jobId })
    );
  }

  if (emailEnabled) {
    const driver = await getDriverProfileByInitials(driverInitials).catch(() => null);
    if (driver?.email) {
      const body = await getMessageBody("DRIVER_JOB_ASSIGNMENT_EMAIL", job);
      await sendDriverJobAssignmentEmail(driver.email, job, body).catch(err =>
        log.warn("failed to send job assignment email", { error: String(err), driverInitials, job_id: job.jobId })
      );
    }
  }
}
