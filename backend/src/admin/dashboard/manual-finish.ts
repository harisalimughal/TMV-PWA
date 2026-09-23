import { DateTime } from "luxon";
import { getDriverProfileByInitials } from "../../auth/driver-account.service";
import { appendActivity } from "../../db/activity.repo";
import { readEvidenceSummary } from "../../db/evidence.repo";
import { getJob, upsertJob } from "../../db/jobs.repo";
import { sendOpsJobCompletionEmail } from "../../google/gmail";
import { Job, JobStatus } from "../../jobs/job.types";
import { log } from "../../utils/logger";
import { WorkflowState } from "../../workflow/workflow.states";

function delayStatus(bookedFinish: string, actualFinish: string): string {
  const booked = DateTime.fromISO(bookedFinish);
  const actual = DateTime.fromISO(actualFinish);
  if (!booked.isValid || !actual.isValid) return "";
  const diff = Math.round(actual.diff(booked, "minutes").minutes);
  if (diff <= 0) return diff < 0 ? "Early" : "On Time";
  if (diff <= 15) return "Slight Delay";
  if (diff <= 30) return "Late";
  return "Very Late";
}

function sendManualCompletionEmailIfAny(job: Job): void {
  const fallbackDriver = {
    initials: job.driverInitials || "UN",
    fullName: job.driverInitials || "Unassigned driver",
    email: "",
    vanRegistration: ""
  };

  Promise.all([
    job.driverInitials ? getDriverProfileByInitials(job.driverInitials).catch(() => null) : Promise.resolve(null),
    readEvidenceSummary(job.jobId).catch(error => {
      log.warn("manual job completion evidence summary unavailable for ops email", { job_id: job.jobId, error: String(error) });
      return undefined;
    })
  ])
    .then(([driver, evidence]) => sendOpsJobCompletionEmail(job, driver || fallbackDriver, evidence))
    .then(() => appendActivity({
      jobId: job.jobId,
      driver: "admin dashboard",
      action: "OPS_JOB_COMPLETION_EMAIL_SENT",
      fromState: WorkflowState.COMPLETED,
      toState: WorkflowState.COMPLETED,
      detail: "info@themanvan.co.uk"
    }))
    .catch(error => {
      const message = error instanceof Error ? error.message : String(error);
      log.warn("manual job completion ops email failed (non-fatal)", { job_id: job.jobId, error: message });
      return appendActivity({
        jobId: job.jobId,
        driver: "admin dashboard",
        action: "OPS_JOB_COMPLETION_EMAIL_FAILED",
        fromState: WorkflowState.COMPLETED,
        toState: WorkflowState.COMPLETED,
        detail: message
      });
    })
    .catch(error => log.warn("manual job completion ops email audit failed", { job_id: job.jobId, error: String(error) }));
}

export async function markJobFinishedManually(jobId: string, note: string): Promise<Job | null> {
  const job = await getJob(jobId);
  if (!job) return null;
  if (job.status === JobStatus.COMPLETED || job.currentState === WorkflowState.COMPLETED) return job;

  const from = job.currentState;
  const now = new Date().toISOString();
  if (!job.actualStart) job.actualStart = now;
  job.actualFinish = now;
  job.actualMinutes = Math.max(
    0,
    Math.round(DateTime.fromISO(job.actualFinish).diff(DateTime.fromISO(job.actualStart), "minutes").minutes)
  );
  job.differenceMinutes = job.actualMinutes - job.bookedMinutes;
  job.delayStatus = delayStatus(job.bookedFinish, job.actualFinish);
  job.status = JobStatus.COMPLETED;
  job.currentState = WorkflowState.COMPLETED;
  job.updatedAt = now;

  await upsertJob(job);
  await appendActivity({
    jobId,
    driver: "admin dashboard",
    action: "ADMIN_MARKED_COMPLETED",
    fromState: from,
    toState: WorkflowState.COMPLETED,
    detail: note
  });
  sendManualCompletionEmailIfAny(job);
  return job;
}
