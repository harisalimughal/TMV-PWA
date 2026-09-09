import { DateTime } from "luxon";
import { getGpsApiKey } from "../config/live-settings";
import { DriverProfile, Job } from "./job.types";
import { getJob, upsertJob } from "../db/jobs.repo";
import { sendPushToDriver } from "../push/push.service";
import { fetchGpsLiveAlertsForDevice, fetchGpsLiveDevices, findDeviceForDriver } from "../integrations/gpslive";
import { log } from "../utils/logger";

/** How far back the job-start check looks for the van's last Congestion zone_in/
 *  zone_out -- long enough to cover a shift's worth of driving before a job starts,
 *  short enough that a query stays cheap. */
const LOOKBACK_HOURS = 6;

type Zone = "congestion" | "tunnel";

const ZONE_FIELD: Record<Zone, "congestionZoneEnteredAt" | "tunnelZoneEnteredAt"> = {
  congestion: "congestionZoneEnteredAt",
  tunnel: "tunnelZoneEnteredAt"
};

/**
 * Flags a job's van as having entered the Congestion Charge (or tunnel toll) zone,
 * and pushes the driver. Shared by gpslive-webhook.routes.ts (a fresh "zone_in"
 * crossing while the job is already in progress) and checkCongestionZoneAtJobStart
 * below (the van was already inside when the job began, so no crossing ever happens
 * for GPSLive to report). Idempotent per job -- re-reads the job fresh and does
 * nothing if that zone's *ZoneEnteredAt is already set, so calling this twice for the
 * same job (e.g. a GPSLive webhook retry, or both paths firing close together) never
 * double-notifies.
 */
async function flagZoneEntry(
  zone: Zone,
  jobId: string,
  driverInitials: string,
  notification: { title: string; body: string }
): Promise<void> {
  const job = await getJob(jobId);
  const field = ZONE_FIELD[zone];
  if (!job || job[field]) return;

  await upsertJob({ ...job, [field]: new Date().toISOString() });

  await sendPushToDriver(driverInitials, { ...notification, url: "/?tab=jobs" }).catch(error =>
    log.warn(`${zone} zone push failed`, { error: String(error), job_id: jobId })
  );

  log.info(`${zone} zone entry flagged`, { job_id: jobId, driver: driverInitials });
}

export function flagCongestionZoneEntry(
  jobId: string,
  driverInitials: string,
  notification: { title: string; body: string }
): Promise<void> {
  return flagZoneEntry("congestion", jobId, driverInitials, notification);
}

export function flagTunnelZoneEntry(
  jobId: string,
  driverInitials: string,
  notification: { title: string; body: string }
): Promise<void> {
  return flagZoneEntry("tunnel", jobId, driverInitials, notification);
}

/** Zone-specific bits of the job-start "already inside" check below: the GPSLive
 *  event_desc substring to look for, and the flag call + push copy to fire. */
const ZONE_CHECK: Record<
  Zone,
  { search: string; flag: typeof flagCongestionZoneEntry; notification: { title: string; body: string } }
> = {
  congestion: {
    search: "Congestion",
    flag: flagCongestionZoneEntry,
    notification: {
      title: "Already in Central London",
      body: "Congestion charge may apply -- add it on the Extra Charges step."
    }
  },
  tunnel: {
    search: "Tunnel",
    flag: flagTunnelZoneEntry,
    notification: {
      title: "Already in a tunnel toll zone",
      body: "Tunnel charge may apply -- add it on the Extra Charges step."
    }
  }
};

/**
 * Checked once, right when a job starts. GPSLive's webhook only ever reports a
 * *crossing* into the Congestion or tunnel-toll zone (see gpslive-webhook.routes.ts)
 * -- a job that starts with the van already inside one (pickup address in central
 * London, or driven in before clocking on) would otherwise never get the
 * extra-charges suggestion, since no crossing happens during that job for GPSLive to
 * report. This instead looks back over the last few hours of that van's own alert
 * history for the most recent zone_in/zone_out on each zone; if the latest one is
 * zone_in, the van is presumably still inside right now.
 *
 * This is also the only place a job's device gets resolved at all -- see pinDevice's
 * own comment for why that matters even when the "already inside" check itself finds
 * nothing.
 *
 * Best-effort throughout: GPSLive being unreachable, the van having no matching
 * device, or no zone history in the window all just mean no early suggestion --
 * never blocks or fails job start.
 */
export async function checkCongestionZoneAtJobStart(job: Job, driver: DriverProfile): Promise<void> {
  if (!(await getGpsApiKey())) return;

  try {
    const devices = await fetchGpsLiveDevices();
    const device = findDeviceForDriver(driver, devices);
    if (!device) return;

    await pinDevice(job, device.imei);

    const now = DateTime.now();
    const format = (d: DateTime) => d.toFormat("yyyy-MM-dd HH:mm:ss");
    const dateFrom = format(now.minus({ hours: LOOKBACK_HOURS }));
    const dateTo = format(now);

    for (const zone of Object.keys(ZONE_CHECK) as Zone[]) {
      const { search, flag, notification } = ZONE_CHECK[zone];
      const events = await fetchGpsLiveAlertsForDevice(device.imei, dateFrom, dateTo, search);
      const latest = events
        .filter(e => e.event_desc?.includes(search))
        .sort((a, b) => b.dt_tracker.localeCompare(a.dt_tracker))[0];

      if (latest?.type === "zone_in") {
        await flag(job.jobId, driver.initials, notification);
      }
    }
  } catch (error) {
    log.warn("zone job-start check failed", { error: String(error), job_id: job.jobId });
  }
}

/**
 * Pins the resolved device to this job for its whole lifetime, so
 * gpslive-webhook.routes.ts can match a later real-time event by device identity
 * (job.gpsliveImei) instead of re-deriving "whose van is this" from the driver's
 * profile again at the moment the event arrives -- which could be wrong if the
 * driver's assigned van has changed (a swap, a profile edit) since this job started.
 * Set once, never overwritten -- job is the caller's own already-fresh copy, so this
 * skips a redundant read when nothing needs to change.
 */
async function pinDevice(job: Job, imei: string): Promise<void> {
  if (job.gpsliveImei) return;
  await upsertJob({ ...job, gpsliveImei: imei });
}
