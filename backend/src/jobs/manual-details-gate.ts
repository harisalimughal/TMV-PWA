import { listDriverJobSummariesForJobs } from "../db/driver-job-summary.repo";
import { ValidationError } from "../workflow/validation.engine";
import { JobStatus, type Job } from "./job.types";
import { isQueueBlockingJob } from "./job-queue-policy";

export class ManualDetailsPendingError extends ValidationError {
  constructor(readonly jobId: string) {
    super(`Submit Manual details for job ${jobId} before starting the next job.`);
  }
}

export async function pendingManualDetails(jobs: Job[]): Promise<Job | null> {
  const required = jobs.filter(job => job.status === JobStatus.COMPLETED && job.manualDetailsRequiredAt)
    .sort((a, b) => a.manualDetailsRequiredAt!.localeCompare(b.manualDetailsRequiredAt!));
  if (!required.length) return null;
  const submitted = new Set((await listDriverJobSummariesForJobs(required.map(job => job.jobId))).map(row => row.jobId));
  return required.find(job => !submitted.has(job.jobId)) ?? null;
}

export async function assertQueueReleased(jobs: Job[], target: Job): Promise<void> {
  if (target.status === JobStatus.IN_PROGRESS) return;
  const pending = await pendingManualDetails(jobs);
  if (pending) throw new ManualDetailsPendingError(pending.jobId);
  const now = new Date();
  if (jobs.some(job => job.jobId !== target.jobId && isQueueBlockingJob(job, now))) {
    throw new ValidationError("Finish your active job before starting another job.");
  }
}
