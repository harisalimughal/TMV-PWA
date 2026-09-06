import { DateTime } from "luxon";
import { env } from "../config/env";
import { Job } from "./job.types";
import { getJob, upsertJob } from "../db/jobs.repo";
import { sendPushToDriver } from "../push/push.service";
import { fetchGpsLiveAlertsForDevice, fetchGpsLiveDevices, findDeviceForDriver } from "../integrations/gpslive";
import { log } from "../utils/logger";

/** How far back the job-start check looks for the van's last Congestion zone_in/
 *  zone_out -- long enough to cover a shift's worth of driving before a job starts,
 *  short enough that a query stays cheap. */
const LOOKBACK_HOURS = 6;

/**
 * Flags a job's van as having entered the Congestion Charge zone, and pushes the
 * driver. Shared by gpslive-webhook.routes.ts (a fresh "zone_in" crossing while the
 * job is already in progress) and checkCongestionZoneAtJobStart below (the van was
 * already inside when the job began, so no crossing ever happens for GPSLive to
 * report). Idempotent per job -- re-reads the job fresh and does nothing if
 * congestionZoneEnteredAt is already set, so calling this twice for the same job
 * (e.g. a GPSLive webhook retry, or both paths firing close together) never
 * double-notifies.
 */
export async function flagCongestionZoneEntry(
  jobId: string,
  driverInitials: string,
  notification: { title: string; body: string }
): Promise<void> {
  const job = await getJob(jobId);
  if (!job || job.congestionZoneEnteredAt) return;

  await upsertJob({ ...job, congestionZoneEnteredAt: new Date().toISOString() });

  await sendPushToDriver(driverInitials, { ...notification, url: "/?tab=jobs" }).catch(error =>
    log.warn("congestion zone push failed", { error: String(error), job_id: jobId })
  );

  log.info("congestion zone entry flagged", { job_id: jobId, driver: driverInitials });
}

/**
 * Checked once, right when a job starts. GPSLive's webhook only ever reports a
 * *crossing* into the Congestion zone (see gpslive-webhook.routes.ts) -- a job that
 * starts with the van already inside it (pickup address in central London, or driven
 * in before clocking on) would otherwise never get the extra-charges suggestion,
 * since no crossing happens during that job for GPSLive to report. This instead looks
 * back over the last few hours of that van's own alert history for the most recent
 * Congestion zone_in/zone_out; if the latest one is zone_in, the van is presumably
 * still inside right now.
 *
 * Best-effort throughout: GPSLive being unreachable, the van having no matching
 * device, or no Congestion history in the window all just mean no early suggestion --
 * never blocks or fails job start.
 */
export async function checkCongestionZoneAtJobStart(
  job: Job,
  driverInitials: string,
  vanRegistration: string
): Promise<void> {
  if (!env.gpsApiKey) return;

  try {
    const devices = await fetchGpsLiveDevices();
    const device = findDeviceForDriver({ initials: driverInitials, vanRegistration }, devices);
    if (!device) return;

    const now = DateTime.now();
    const format = (d: DateTime) => d.toFormat("yyyy-MM-dd HH:mm:ss");
    const events = await fetchGpsLiveAlertsForDevice(
      device.imei,
      format(now.minus({ hours: LOOKBACK_HOURS })),
      format(now),
      "Congestion"
    );

    const latest = events
      .filter(e => e.event_desc?.includes("Congestion"))
      .sort((a, b) => b.dt_tracker.localeCompare(a.dt_tracker))[0];

    if (latest?.type !== "zone_in") return;

    await flagCongestionZoneEntry(job.jobId, driverInitials, {
      title: "Already in Central London",
      body: "Congestion charge may apply -- add it on the Extra Charges step."
    });
  } catch (error) {
    log.warn("congestion zone job-start check failed", { error: String(error), job_id: job.jobId });
  }
}
