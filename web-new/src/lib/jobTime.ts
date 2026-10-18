import type { Job } from "../api/jobs";

export function scheduledDurationMinutes(job: Pick<Job, "bookedStart" | "bookedFinish" | "timeBilling">): number | null {
  const minutes = job.timeBilling?.scheduledMinutes ??
    (Date.parse(job.bookedFinish) - Date.parse(job.bookedStart)) / 60_000;
  return Number.isFinite(minutes) && minutes > 0 ? minutes : null;
}

export function scheduledDurationLabel(job: Pick<Job, "bookedStart" | "bookedFinish" | "timeBilling">): string {
  const minutes = scheduledDurationMinutes(job);
  return minutes === null ? "Not recorded" : `${Math.floor(minutes / 60)}h ${Number((minutes % 60).toFixed(2))}m`;
}
