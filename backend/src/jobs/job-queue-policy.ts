import { DateTime } from "luxon";
import { JobStatus, type Job } from "./job.types";

export function isWithinUnfinishedBookingWindow(job: Job, now = new Date(), timezone = "Europe/London"): boolean {
  const instant = now.getTime();
  const finish = DateTime.fromISO(job.actualFinish || "", { zone: timezone });
  if (finish.isValid && finish.toMillis() <= instant) return false;
  const bookedFinish = DateTime.fromISO(job.bookedFinish || "", { zone: timezone });
  if (bookedFinish.isValid) return bookedFinish.toMillis() > instant;
  // Missing end times must not make a historical record block the queue forever.
  const bookedStart = DateTime.fromISO(job.bookedStart || "", { zone: timezone });
  const today = DateTime.fromJSDate(now, { zone: timezone }).startOf("day");
  return !bookedStart.isValid || bookedStart.startOf("day").toMillis() >= today.toMillis();
}

export function isQueueBlockingJob(job: Job, now = new Date(), timezone = "Europe/London"): boolean {
  return job.status === JobStatus.IN_PROGRESS && isWithinUnfinishedBookingWindow(job, now, timezone);
}
