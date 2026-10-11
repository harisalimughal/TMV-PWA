import { listDriverJobSummariesForJobs } from "../db/driver-job-summary.repo";
import { JobStatus, type Job } from "./job.types";

export async function pendingManualSubmissions(jobs: Job[]): Promise<Job[]> {
  const required = jobs.filter(job => job.status === JobStatus.COMPLETED && job.manualDetailsRequiredAt)
    .sort((a, b) => a.manualDetailsRequiredAt!.localeCompare(b.manualDetailsRequiredAt!));
  if (!required.length) return [];
  const submitted = new Set((await listDriverJobSummariesForJobs(required.map(job => job.jobId))).map(row => row.jobId));
  return required.filter(job => !submitted.has(job.jobId));
}
