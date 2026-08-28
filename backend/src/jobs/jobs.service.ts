import { DateTime } from "luxon";
import { env } from "../config/env";
import { getDriver } from "../google/sheets";
import { getJob, listJobs, upsertJob } from "../db/jobs.repo";
import { appendActivity } from "../db/activity.repo";
import { WorkflowState } from "../workflow/workflow.states";
import { DriverProfile, Job, JobStatus } from "./job.types";
import { syncTodayBookings } from "./booking.service";
import { log } from "../utils/logger";
import { withJobLock } from "../utils/lock";
import { ValidationError } from "../workflow/validation.engine";

export function driverIdentifier(email?: string, chatUserName?: string): string {
  return email?.trim() || chatUserName?.trim() || "";
}

/** Driver PROFILE (initials, phone, van registration, role, active flag) stays in the
 * Sheets Drivers tab -- that roster is admin-managed via TMV-Chat-bot's Add/Edit Driver
 * flow, which is unchanged. Only job/booking/evidence data moved to Mongo. */
export async function resolveDriver(identifier: string): Promise<DriverProfile> {
  if (!identifier) throw new Error("No driver identity was provided.");
  const profile = await getDriver(identifier);
  if (!profile) throw new Error(`Driver is not registered in the Drivers sheet: ${identifier}`);
  if (!profile.active) throw new Error("This driver account is inactive.");
  return profile;
}

/**
 * True for anything booked today or earlier — not just today. A job that was never
 * started doesn't stop being real work once its date passes; it used to vanish from
 * "Next Job" entirely at midnight (excluded by an exact same-day check), which is a
 * trap for a driver who's simply behind. Still excludes future-dated bookings —
 * tomorrow's job shouldn't show up as "next" today.
 */
function isDueByToday(iso: string): boolean {
  if (!iso) return false;
  const dt = DateTime.fromISO(iso).setZone(env.timezone);
  return dt <= DateTime.now().setZone(env.timezone).endOf("day");
}

// ---------------------------------------------------------------------------
// Calendar sync throttle
// ---------------------------------------------------------------------------

let lastSyncAt = 0;
let inFlightSync: Promise<unknown> | null = null;

/** Throttled and single-flighted so a burst of driver requests doesn't each trigger
 * their own Calendar read. server.ts also runs this on a fixed interval in the
 * background, so most calls here find it already fresh and skip entirely. */
async function syncIfStale(): Promise<void> {
  if (Date.now() - lastSyncAt < env.calendarSyncTtlMs) return;
  if (inFlightSync) {
    await inFlightSync.catch(() => undefined);
    return;
  }
  inFlightSync = syncTodayBookings()
    .then(jobs => {
      lastSyncAt = Date.now();
      log.debug("calendar sync completed", { synced: jobs.length });
    })
    .catch(error => {
      // A sync failure must not block a driver who already has jobs in Mongo.
      log.warn("calendar sync failed; serving from Mongo", { error: String(error) });
    })
    .finally(() => {
      inFlightSync = null;
    });
  await inFlightSync;
}

export function markSynced(): void {
  lastSyncAt = Date.now();
}

export interface NextJobOptions {
  /** Only the explicit "jobs" entry point needs fresh Calendar data. */
  sync?: boolean;
}

export async function getNextJobForDriver(
  identifier: string,
  options: NextJobOptions = {}
): Promise<{ job: Job | null; driver: DriverProfile }> {
  if (options.sync) await syncIfStale();

  const [driver, jobs] = await Promise.all([resolveDriver(identifier), listJobs()]);

  const active = jobs
    .filter(j => j.status === JobStatus.IN_PROGRESS && j.driverInitials === driver.initials)
    .sort((a, b) => a.bookedStart.localeCompare(b.bookedStart))[0];
  if (active) return { job: active, driver };

  const next =
    jobs
      .filter(j => isDueByToday(j.bookedStart))
      .filter(j => j.status !== JobStatus.COMPLETED && j.status !== JobStatus.CANCELLED)
      .filter(j => !j.driverInitials || j.driverInitials === driver.initials)
      // Oldest first: an overdue job from three days ago surfaces before today's.
      .sort((a, b) => a.bookedStart.localeCompare(b.bookedStart))[0] ?? null;

  return { job: next, driver };
}

/** Fresh read of the driver's current/next job. Mongo has no read cache to bypass
 * (unlike the old Sheets version's `fresh` flag) -- every read here already sees the
 * latest write. */
export async function getActiveJobForDriver(identifier: string): Promise<{ job: Job | null; driver: DriverProfile }> {
  return getNextJobForDriver(identifier);
}

/** True for anything booked on tomorrow's calendar date, in the operating timezone. */
function isDueTomorrow(iso: string): boolean {
  if (!iso) return false;
  const dt = DateTime.fromISO(iso).setZone(env.timezone);
  const tomorrow = DateTime.now().setZone(env.timezone).plus({ days: 1 });
  return dt.hasSame(tomorrow, "day");
}

/**
 * The driver's own jobs booked for tomorrow, oldest first -- lets a driver plan ahead
 * once today's work is done. Deliberately assigned-only (unlike getNextJobForDriver's
 * "unassigned is up for grabs" rule for today) -- a booking nobody has claimed yet
 * isn't "the driver's job" a day out.
 */
export async function getTomorrowJobsForDriver(identifier: string): Promise<{
  jobs: Job[];
  driver: DriverProfile;
  unassignedCount: number;
}> {
  const [driver, jobs] = await Promise.all([resolveDriver(identifier), listJobs()]);

  const tomorrowAll = jobs
    .filter(j => isDueTomorrow(j.bookedStart))
    .filter(j => j.status !== JobStatus.CANCELLED);

  const tomorrow = tomorrowAll
    .filter(j => j.driverInitials === driver.initials)
    .sort((a, b) => a.bookedStart.localeCompare(b.bookedStart));

  const unassignedCount = tomorrowAll.filter(j => !j.driverInitials).length;

  return { jobs: tomorrow, driver, unassignedCount };
}

export interface JobLookupOptions {
  /** No-op now (Mongo has no read cache to bypass); kept so call sites that pass it
   * (carried over from the Sheets version) don't need editing. */
  fresh?: boolean;
}

export async function getJobForDriver(
  jobId: string,
  identifier: string,
  _options: JobLookupOptions = {}
): Promise<{ job: Job; driver: DriverProfile }> {
  const [job, driver] = await Promise.all([getJob(jobId), resolveDriver(identifier)]);
  if (!job) throw new Error(`Job ${jobId} was not found.`);
  if (job.driverInitials && job.driverInitials !== driver.initials && driver.role.toLowerCase() !== "manager") {
    throw new Error("This job is assigned to another driver.");
  }
  return { job, driver };
}

/** Persists a workflow transition: the job doc and an activity log entry. */
export async function saveJob(
  job: Job,
  driver: DriverProfile,
  action: string,
  fromState: string,
  detail = ""
): Promise<Job> {
  job.updatedAt = new Date().toISOString();
  const actor = driver.email || driver.chatUserName;
  await upsertJob(job);
  await appendActivity({ jobId: job.jobId, driver: actor, action, fromState, toState: job.currentState, detail });
  return job;
}

export async function startJob(jobId: string, identifier: string): Promise<Job> {
  /*
   * The whole read/decide/write sequence runs under the job lock, so two clicks
   * milliseconds apart (mobile cards are very easy to double-tap) can't both read
   * status !== IN_PROGRESS and both proceed.
   */
  return withJobLock(jobId, async () => {
    const { job, driver } = await getJobForDriver(jobId, identifier);

    if (job.status === JobStatus.COMPLETED) throw new ValidationError("This job is already completed.");

    if (job.status === JobStatus.IN_PROGRESS) {
      log.info("start job ignored; already started", { job_id: job.jobId, state: job.currentState });
      return job;
    }

    // An unassigned booking must not be a free-for-all. First claim wins, and it
    // happens inside the lock so two drivers cannot both claim it.
    if (!job.driverInitials) {
      if (!driver.initials) {
        throw new ValidationError("Your driver record has no initials, so this job cannot be assigned to you.");
      }
      log.info("unassigned job claimed", { job_id: job.jobId, driver: driver.initials });
    }

    const from = job.currentState;
    const now = new Date().toISOString();

    job.status = JobStatus.IN_PROGRESS;
    // actualStart is set when the Arrival photo actually lands (workflow.engine.ts's
    // handlePhotoStep), since that's the real physical start of the job, not the
    // moment the driver taps a button in the app.
    job.currentState = WorkflowState.WAITING_ARRIVAL_PHOTO;
    if (!job.driverInitials) job.driverInitials = driver.initials;

    return saveJob(job, driver, "START_JOB", from, `Server start timestamp ${now}`);
  });
}

function delayStatus(bookedFinish: string, actualFinish: string): string {
  const booked = DateTime.fromISO(bookedFinish);
  const actual = DateTime.fromISO(actualFinish);
  const diff = Math.round(actual.diff(booked, "minutes").minutes);
  if (diff <= 0) return diff < 0 ? "Early" : "On Time";
  if (diff <= 15) return "Slight Delay";
  if (diff <= 30) return "Late";
  return "Very Late";
}

export async function completeJob(jobId: string, identifier: string): Promise<Job> {
  const { job, driver } = await getJobForDriver(jobId, identifier);
  if (job.status === JobStatus.COMPLETED) return job;

  const from = job.currentState;
  const now = new Date().toISOString();
  // actualStart/actualFinish normally already landed when the Arrival/Empty Van photos
  // were uploaded. These are just a defensive fallback so the diff below never feeds
  // an invalid ISO string in and silently writes NaN.
  if (!job.actualStart) job.actualStart = now;
  if (!job.actualFinish) job.actualFinish = now;
  job.actualMinutes = Math.max(
    0,
    Math.round(DateTime.fromISO(job.actualFinish).diff(DateTime.fromISO(job.actualStart), "minutes").minutes)
  );
  job.differenceMinutes = job.actualMinutes - job.bookedMinutes;
  job.delayStatus = delayStatus(job.bookedFinish, job.actualFinish);
  job.status = JobStatus.COMPLETED;
  job.currentState = WorkflowState.COMPLETED;
  return saveJob(job, driver, "COMPLETE_JOB", from, `Server finish timestamp ${now}`);
}
