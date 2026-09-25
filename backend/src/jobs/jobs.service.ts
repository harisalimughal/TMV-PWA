import { DateTime } from "luxon";
import { env } from "../config/env";
import { getFiretextApiKey } from "../config/live-settings";
import { getDriverProfile } from "../auth/driver-account.service";
import { getJob, listJobs, upsertJob } from "../db/jobs.repo";
import { appendActivity, listActivityForJob } from "../db/activity.repo";
import { getSetting } from "../db/settings.repo";
import { readEvidenceSummary } from "../db/evidence.repo";
import { WorkflowState } from "../workflow/workflow.states";
import { DriverProfile, Job, JobStatus } from "./job.types";
import { syncTodayBookings } from "./booking.service";
import { log } from "../utils/logger";
import { withJobLock } from "../utils/lock";
import { ValidationError } from "../workflow/validation.engine";
import { sendJobStartedSms } from "../integrations/firetext";
import { sendJobStartedEmail, sendOpsJobCompletionEmail } from "../google/gmail";
import { JOB_STARTED_MESSAGE_TEMPLATE } from "../notifications/message";
import { isMessageEnabled } from "../notifications/message-catalog";
import { checkCongestionZoneAtJobStart } from "./congestion-zone.service";

export function driverIdentifier(email?: string, chatUserName?: string): string {
  return email?.trim() || chatUserName?.trim() || "";
}

/** Driver PROFILE (initials, phone, van registration, role, active flag) lives in the
 * driver_accounts Mongo collection -- admin-managed via tmv-pwa's own /admin Drivers
 * screen (see auth/admin.routes.ts). */
export async function resolveDriver(identifier: string): Promise<DriverProfile> {
  if (!identifier) throw new Error("No driver identity was provided.");
  const profile = await getDriverProfile(identifier);
  if (!profile) throw new Error(`Driver is not registered: ${identifier}`);
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

/** True only for a job booked strictly after today (in the operating timezone) --
 * i.e. tomorrow or later. Used to stop a driver starting a future job early, e.g. one
 * tapped from the "Tomorrow" list. Deliberately the mirror image of isDueByToday, not
 * its negation: an overdue job from an earlier day is neither "due by today" nor
 * "future" -- it's still meant to be startable. */
function isFutureDay(iso: string): boolean {
  if (!iso) return false;
  const dt = DateTime.fromISO(iso).setZone(env.timezone);
  return dt > DateTime.now().setZone(env.timezone).endOf("day");
}

// ---------------------------------------------------------------------------
// Calendar sync throttle
// ---------------------------------------------------------------------------

let lastSyncAt = 0;
let inFlightSync: Promise<unknown> | null = null;

/**
 * The one place syncTodayBookings() is ever actually called from. Single-flighted so
 * two near-simultaneous callers share one run instead of racing two independent
 * Calendar reads/writes against each other on the same job documents -- that race is
 * exactly what caused a real incident (2026-09-14): server.ts's background timer and
 * this module's own request-triggered sync used to call syncTodayBookings() through
 * two completely separate code paths with no shared lock between them, so they could
 * (and did) overlap, each seeing a slightly different snapshot of "which jobs Calendar
 * still has today" and flip-flopping a handful of jobs between active and cancelled
 * every time they collided. Both paths now funnel through this one function, so at
 * most one sync is ever in flight system-wide, regardless of which trigger started it.
 */
async function runSyncOnce(): Promise<void> {
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

/**
 * Throttled: no-ops if the last successful sync (by either trigger) is still within
 * the TTL. Deliberately fire-and-forget when it isn't -- a driver's read request must
 * never block on this. `syncTodayBookings()` makes up to 11 sequential Google
 * Calendar API calls with no hard timeout (only retry-with-backoff on failure), so
 * awaiting it here before returning a page of jobs risks the request itself timing
 * out (found live 2026-09-14: every "Jobs" tab load started blocking on a full
 * Calendar sync once the TTL dropped low enough that it was almost always due,
 * surfacing to the driver as "Couldn't load your jobs -- that took too long"). The
 * caller gets whatever's already in Mongo immediately; if a sync was actually due,
 * it runs in the background and the *next* read (the following poll, or the driver
 * tapping refresh again moments later) sees the result.
 */
function syncIfStale(): void {
  if (Date.now() - lastSyncAt < env.calendarSyncTtlMs) return;
  void runSyncOnce();
}

/** Called by server.ts's unconditional background timer -- shares runSyncOnce's lock
 *  and lastSyncAt bookkeeping with syncIfStale above rather than calling
 *  syncTodayBookings() directly, so the timer firing mid-request can never race a
 *  driver-triggered sync (see runSyncOnce's own comment). */
export async function runScheduledCalendarSync(): Promise<void> {
  await runSyncOnce();
}

export interface NextJobOptions {
  /** Only the explicit "jobs" entry point needs fresh Calendar data. */
  sync?: boolean;
}

export async function getNextJobForDriver(
  identifier: string,
  options: NextJobOptions = {}
): Promise<{ job: Job | null; driver: DriverProfile }> {
  if (options.sync) syncIfStale();

  // Sequential, not Promise.all: listJobs needs the driver's initials to scope its
  // query to just this driver's own jobs (see listJobs' own doc comment) rather than
  // pulling every job in the company over the wire on every app open. resolveDriver is
  // a single indexed document lookup, so this costs a few ms, not a second query.
  const driver = await resolveDriver(identifier);
  const jobs = await listJobs({ driverInitials: driver.initials });

  const active = jobs
    .filter(j => j.status === JobStatus.IN_PROGRESS && j.driverInitials === driver.initials)
    .sort((a, b) => a.bookedStart.localeCompare(b.bookedStart))[0];
  if (active) return { job: active, driver };

  const next =
    jobs
      .filter(j => isDueByToday(j.bookedStart))
      .filter(j => j.status !== JobStatus.COMPLETED && j.status !== JobStatus.CANCELLED)
      // Assigned-only: a driver only ever sees their own jobs, never every unassigned
      // booking in the calendar (the "open pool, first to start it claims it" design
      // this used to have -- see startJob's still-present claim logic below, now only
      // reachable for a job assigned some other way than showing up in this list).
      .filter(j => j.driverInitials === driver.initials)
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

function canPreviewTomorrow(now = DateTime.now().setZone(env.timezone)): boolean {
  return now.hour >= 21;
}

/**
 * The driver's own jobs booked for tomorrow, oldest first -- lets a driver plan ahead
 * once today's work is done. Assigned-only, same as every other driver-facing job
 * list now (see getJobsGroupedForDriver/getNextJobForDriver) -- unassignedCount below
 * is a bare number for context, not a way to see those jobs' details.
 */
export async function getTomorrowJobsForDriver(identifier: string): Promise<{
  jobs: Job[];
  driver: DriverProfile;
  unassignedCount: number;
}> {
  const [driver, jobs] = await Promise.all([resolveDriver(identifier), listJobs()]);

  if (!canPreviewTomorrow()) return { jobs: [], driver, unassignedCount: 0 };

  const tomorrowAll = jobs
    .filter(j => isDueTomorrow(j.bookedStart))
    .filter(j => j.status !== JobStatus.CANCELLED);

  const tomorrow = tomorrowAll
    .filter(j => j.driverInitials === driver.initials)
    .sort((a, b) => a.bookedStart.localeCompare(b.bookedStart));

  const unassignedCount = tomorrowAll.filter(j => !j.driverInitials).length;

  return { jobs: tomorrow, driver, unassignedCount };
}

/** Europe/London calendar-day key (YYYY-MM-DD) for a booking's ISO timestamp. Grouping
 * by this string (not by elapsed hours) is what keeps "today" correct regardless of
 * what time of day the driver opens the app or what timezone their device is set to. */
function londonDayKey(iso: string): string | null {
  if (!iso) return null;
  return DateTime.fromISO(iso).setZone(env.timezone).toISODate();
}

/**
 * The driver's full job list, bucketed by calendar day relative to today (Europe/
 * London) instead of the single-"next job" model getNextJobForDriver uses for the
 * active-job workflow screen. Assigned-only across all three buckets: a driver only
 * ever sees jobs with their own initials on them, never another unassigned booking
 * from the shared calendar just because nobody's claimed it yet.
 */
export async function getJobsGroupedForDriver(identifier: string): Promise<{
  driver: DriverProfile;
  today: Job[];
  past: Job[];
  next: Job[];
}> {
  // This is the screen a driver actually watches for a newly-assigned job to appear
  // on, so a refresh here nudges a throttled, fire-and-forget Calendar re-check (see
  // syncIfStale's own comment -- deliberately not awaited, so this read never blocks
  // on Calendar's latency). Safe from the 2026-09-14 race incident now that this and
  // the background timer both funnel through runSyncOnce's single shared lock.
  syncIfStale();

  // Sequential, not Promise.all -- see getNextJobForDriver's matching comment above:
  // this scopes the Mongo query to just this driver's jobs instead of the whole
  // company's, which is what actually made the "Jobs" tab feel slow to load as the
  // collection grew.
  const driver = await resolveDriver(identifier);
  const jobs = await listJobs({ driverInitials: driver.initials });
  const now = DateTime.now().setZone(env.timezone);
  const todayKey = now.toISODate();
  const tomorrowKey = now.plus({ days: 1 }).toISODate();
  const showTomorrow = canPreviewTomorrow(now);

  const relevant = jobs
    .filter(j => j.status !== JobStatus.COMPLETED && j.status !== JobStatus.CANCELLED)
    .filter(j => j.driverInitials === driver.initials);

  const today: Job[] = [];
  const past: Job[] = [];
  const next: Job[] = [];

  for (const job of relevant) {
    const dayKey = londonDayKey(job.bookedStart);
    if (!dayKey || !todayKey) continue;
    if (dayKey === todayKey) today.push(job);
    else if (dayKey < todayKey) past.push(job);
    else if (showTomorrow && dayKey === tomorrowKey) next.push(job);
  }

  const byBookedStart = (a: Job, b: Job) => a.bookedStart.localeCompare(b.bookedStart);
  today.sort(byBookedStart);
  past.sort(byBookedStart);
  next.sort(byBookedStart);

  return { driver, today, past, next };
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
  // Driver-facing APIs are strictly assigned-only. Admin/manager access to other
  // jobs belongs in /api/admin, never the driver app.
  if (!job.driverInitials) {
    throw new Error("This job hasn't been assigned to a driver yet.");
  }
  if (job.driverInitials !== driver.initials) {
    throw new Error("This job is assigned to another driver.");
  }
  return { job, driver };
}

export async function markJobViewed(jobId: string, identifier: string, detail = "Driver viewed the job"): Promise<Job> {
  const { job, driver } = await getJobForDriver(jobId, identifier);
  const actor = driver.email || driver.chatUserName;
  const activity = await listActivityForJob(job.jobId);
  const alreadyViewed = activity.some(entry =>
    entry.action === "DRIVER_VIEWED_JOB" && entry.driver === actor
  );
  if (!alreadyViewed) {
    await appendActivity({
      jobId: job.jobId,
      driver: actor,
      action: "DRIVER_VIEWED_JOB",
      fromState: job.currentState,
      toState: job.currentState,
      detail
    });
  }
  return job;
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

/** Marker so the shared .catch() below in sendJobStartedSmsIfAny can tell "Firetext
 *  has no key set right now" (expected, logs as SKIPPED) apart from a real send
 *  failure (logs as FAILED). */
class FiretextNotConfiguredError extends Error {}

function sendJobStartedSmsIfAny(job: Job, driver: DriverProfile): void {
  const actor = driver.email || driver.chatUserName;
  if (!job.customerPhone) {
    appendActivity({
      jobId: job.jobId,
      driver: actor,
      action: "CLIENT_JOB_STARTED_SMS_SKIPPED",
      detail: "No customer phone number"
    }).catch(err => log.warn("job started SMS skip audit failed", { job_id: job.jobId, error: String(err) }));
    return;
  }

  isMessageEnabled("CUSTOMER_JOB_STARTED_SMS")
    .then(enabled => {
      if (!enabled) {
        return appendActivity({
          jobId: job.jobId, driver: actor,
          action: "CLIENT_JOB_STARTED_SMS_SKIPPED", detail: "Disabled in admin Messaging settings"
        });
      }
      return getFiretextApiKey()
        .then(apiKey => {
          if (!apiKey) throw new FiretextNotConfiguredError("Firetext is not configured");
          return getSetting("JOB_STARTED_MESSAGE_TEXT", JOB_STARTED_MESSAGE_TEMPLATE);
        })
        .then(template => sendJobStartedSms(job, template, driver))
        .then(() => appendActivity({
          jobId: job.jobId,
          driver: actor,
          action: "CLIENT_JOB_STARTED_SMS_SENT",
          detail: job.customerPhone
        }))
        .catch(err => {
          const skipped = err instanceof FiretextNotConfiguredError;
          const message = err instanceof Error ? err.message : String(err);
          if (!skipped) log.warn("job started SMS failed (non-fatal)", { job_id: job.jobId, error: message });
          return appendActivity({
            jobId: job.jobId,
            driver: actor,
            action: skipped ? "CLIENT_JOB_STARTED_SMS_SKIPPED" : "CLIENT_JOB_STARTED_SMS_FAILED",
            detail: message
          });
        });
    })
    .catch(err => log.warn("job started SMS failure audit failed", { job_id: job.jobId, error: String(err) }));
}

/** Driver-introduction email sent alongside the SMS. Its Messaging template is
 *  separate from the SMS template, so admins can tune channel wording independently.
 *  Independent of the SMS: a missing/unconfigured Firetext key never blocks this, and
 *  a Gmail failure never blocks the SMS. */
function sendJobStartedEmailIfAny(job: Job, driver: DriverProfile): void {
  const actor = driver.email || driver.chatUserName;
  if (!job.customerEmail) {
    appendActivity({
      jobId: job.jobId,
      driver: actor,
      action: "CLIENT_JOB_STARTED_EMAIL_SKIPPED",
      detail: "No customer email address"
    }).catch(err => log.warn("job started email skip audit failed", { job_id: job.jobId, error: String(err) }));
    return;
  }

  isMessageEnabled("CUSTOMER_JOB_STARTED_EMAIL")
    .then(enabled => {
      if (!enabled) {
        return appendActivity({
          jobId: job.jobId, driver: actor,
          action: "CLIENT_JOB_STARTED_EMAIL_SKIPPED", detail: "Disabled in admin Messaging settings"
        });
      }
      return getSetting("JOB_STARTED_EMAIL_MESSAGE_TEXT", JOB_STARTED_MESSAGE_TEMPLATE)
        .then(template => sendJobStartedEmail(job, template, driver))
        .then(() => appendActivity({
          jobId: job.jobId,
          driver: actor,
          action: "CLIENT_JOB_STARTED_EMAIL_SENT",
          detail: job.customerEmail
        }))
        .catch(err => {
          const message = err instanceof Error ? err.message : String(err);
          log.warn("job started email failed (non-fatal)", { job_id: job.jobId, error: message });
          return appendActivity({
            jobId: job.jobId,
            driver: actor,
            action: "CLIENT_JOB_STARTED_EMAIL_FAILED",
            detail: message
          });
        });
    })
    .catch(err => log.warn("job started email failure audit failed", { job_id: job.jobId, error: String(err) }));
}

/**
 * "I'm on the Way" -- the customer SMS/email used to fire the instant a job actually
 * started (see startJob below). The client wanted these decoupled: a driver can now
 * tell the customer they're coming well before tapping Start Job, and Start Job itself
 * no longer messages the customer at all (see this function's own onMyWayAt stamp,
 * which startJob checks for before it'll move a job to IN_PROGRESS). Job status/state
 * is untouched here -- this only sends the notification and records when it went out.
 */
export async function sendOnMyWay(jobId: string, identifier: string): Promise<Job> {
  return withJobLock(jobId, async () => {
    const { job, driver } = await getJobForDriver(jobId, identifier);
    await markJobViewed(jobId, identifier, "Tapped I'm on the Way");

    if (job.status === JobStatus.COMPLETED) throw new ValidationError("This job is already completed.");
    // Idempotent, not an error -- a double-tap or a stale screen re-sending this
    // shouldn't surface a scary error to the driver, and re-notifying the customer a
    // second time for the same job would just be noise.
    if (job.onMyWayAt) return job;

    if (isFutureDay(job.bookedStart)) {
      const bookedDay = DateTime.fromISO(job.bookedStart).setZone(env.timezone).toFormat("cccc d LLLL");
      throw new ValidationError(`This job is booked for ${bookedDay}. You can't notify the customer until then.`);
    }

    const from = job.currentState;
    const now = new Date().toISOString();
    job.onMyWayAt = now;

    const savedJob = await saveJob(job, driver, "ON_MY_WAY", from, `Server on-my-way timestamp ${now}`);
    sendJobStartedSmsIfAny(savedJob, driver);
    sendJobStartedEmailIfAny(savedJob, driver);
    return savedJob;
  });
}

export async function startJob(jobId: string, identifier: string): Promise<Job> {
  /*
   * The whole read/decide/write sequence runs under the job lock, so two clicks
   * milliseconds apart (mobile cards are very easy to double-tap) can't both read
   * status !== IN_PROGRESS and both proceed.
   */
  return withJobLock(jobId, async () => {
    const { job, driver } = await getJobForDriver(jobId, identifier);
    await markJobViewed(jobId, identifier, "Tapped Start Job");

    if (job.status === JobStatus.COMPLETED) throw new ValidationError("This job is already completed.");

    if (job.status === JobStatus.IN_PROGRESS) {
      // A job walked back to READY (the header back-arrow on the arrival-photo step
      // maps GO_BACK to READY) keeps status IN_PROGRESS. Without this it dead-ends:
      // Start sees IN_PROGRESS and returns the job unchanged, still on READY. Nudge
      // it forward again -- but not through the congestion-zone side effect, which
      // already ran on the first start (and onMyWayAt is already set from back then).
      if (job.currentState === WorkflowState.READY) {
        const from = job.currentState;
        job.currentState = WorkflowState.WAITING_ARRIVAL_PHOTO;
        return saveJob(job, driver, "START_JOB", from, "re-advanced from READY (already in progress)");
      }
      log.info("start job ignored; already started", { job_id: job.jobId, state: job.currentState });
      return job;
    }

    // The customer has to actually be told the driver's coming before the job can
    // start -- see sendOnMyWay above. This only guards a genuinely fresh start (the
    // IN_PROGRESS branch above, which never reaches here, covers every job that
    // already started before this check existed).
    if (!job.onMyWayAt) {
      throw new ValidationError("Tap \"I'm on the Way\" first so the customer's told before you start the job.");
    }

    // A job tapped from the "Tomorrow" list is still just for browsing -- starting it
    // early would set actualStart today, corrupting delay/duration figures computed
    // against its real booked time. Overdue jobs from an earlier day are unaffected
    // (isFutureDay, not the negation of isDueByToday).
    if (isFutureDay(job.bookedStart)) {
      const bookedDay = DateTime.fromISO(job.bookedStart).setZone(env.timezone).toFormat("cccc d LLLL");
      throw new ValidationError(`This job is booked for ${bookedDay}. You can't start it until then.`);
    }

    const from = job.currentState;
    const now = new Date().toISOString();

    job.status = JobStatus.IN_PROGRESS;
    // actualStart is set when the Arrival photo actually lands (workflow.engine.ts's
    // handlePhotoStep), since that's the real physical start of the job, not the
    // moment the driver taps a button in the app.
    job.currentState = WorkflowState.WAITING_ARRIVAL_PHOTO;

    const startedJob = await saveJob(job, driver, "START_JOB", from, `Server start timestamp ${now}`);
    // Best-effort, never awaited by the response -- see the function's own doc
    // comment for why a job can need this even though the real-time webhook exists.
    checkCongestionZoneAtJobStart(startedJob, driver).catch(error =>
      log.warn("congestion zone job-start check failed to launch", { error: String(error), job_id: startedJob.jobId })
    );
    return startedJob;
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

function sendOpsCompletionEmailIfAny(job: Job, driver: DriverProfile): void {
  const actor = driver.email || driver.chatUserName;
  readEvidenceSummary(job.jobId)
    .catch(error => {
      log.warn("job completion evidence summary unavailable for ops email", { job_id: job.jobId, error: String(error) });
      return undefined;
    })
    .then(evidence => sendOpsJobCompletionEmail(job, driver, evidence))
    .then(() => appendActivity({
      jobId: job.jobId,
      driver: actor,
      action: "OPS_JOB_COMPLETION_EMAIL_SENT",
      fromState: WorkflowState.COMPLETED,
      toState: WorkflowState.COMPLETED,
      detail: "info@themanvan.co.uk"
    }))
    .catch(error => {
      const message = error instanceof Error ? error.message : String(error);
      log.warn("job completion ops email failed (non-fatal)", { job_id: job.jobId, error: message });
      return appendActivity({
        jobId: job.jobId,
        driver: actor,
        action: "OPS_JOB_COMPLETION_EMAIL_FAILED",
        fromState: WorkflowState.COMPLETED,
        toState: WorkflowState.COMPLETED,
        detail: message
      });
    })
    .catch(error => log.warn("job completion ops email audit failed", { job_id: job.jobId, error: String(error) }));
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
  const completedJob = await saveJob(job, driver, "COMPLETE_JOB", from, `Server finish timestamp ${now}`);
  sendOpsCompletionEmailIfAny(completedJob, driver);
  return completedJob;
}
