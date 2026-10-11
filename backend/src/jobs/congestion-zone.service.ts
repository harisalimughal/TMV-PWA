import { DateTime } from "luxon";
import { getGpsApiKey } from "../config/live-settings";
import { DriverProfile, Job } from "./job.types";
import { getJob, upsertJob } from "../db/jobs.repo";
import { getMessageBody, getMessageTitle, isMessageEnabled } from "../notifications/message-catalog";
import { sendPushToDriver } from "../push/push.service";
import { fetchGpsLiveAlertsForDevice, fetchGpsLiveDevices, findDeviceForDriver } from "../integrations/gpslive";
import { log } from "../utils/logger";
import { withJobLock } from "../utils/lock";
import { recordGpsAssignment } from "../gps/gps.association";
import { parseGpsEvent } from "../gps/gps.parse";
import { saveGpsEvents } from "../gps/gps.repo";
import { roadWindow } from "../gps/road-charge.rules";

type Zone = "congestion" | "tunnel";
const fields = { congestion: "congestionZoneEnteredAt", tunnel: "tunnelZoneEnteredAt" } as const;
const messages = { congestion: "DRIVER_CONGESTION_ZONE_PUSH", tunnel: "DRIVER_TUNNEL_ZONE_PUSH" } as const;

/** Legacy first-charge-window UI marker/notification only. Physical counts and money come
 * from the GPS ledger and road rules, never from this marker. */
async function flagZoneEntry(zone: Zone, jobId: string, driverInitials: string, occurredAt: string): Promise<void> {
  // The raw event was already persisted by ingestion; outside-hours activity must
  // not create a fee suggestion or consume the job's one notification opportunity.
  if (roadWindow(zone, occurredAt).chargeable !== true) return;
  await withJobLock(jobId, async () => {
    const job = await getJob(jobId);
    const field = fields[zone];
    if (!job || job[field] || job.status === "COMPLETED" || job.status === "CANCELLED") return;
    await upsertJob({ ...job, [field]: occurredAt });
    const message = messages[zone];
    if (!(await isMessageEnabled(message))) return;
    const title = await getMessageTitle(message), body = await getMessageBody(message);
    await sendPushToDriver(driverInitials, { title, body, url: "/?tab=jobs", data: { kind: `${zone}_zone` } }).catch(error =>
      log.warn(`${zone} zone push failed`, { error: String(error), job_id: jobId }));
  });
}

export function flagCongestionZoneEntry(jobId: string, driverInitials: string, _imei: string, occurredAt = new Date().toISOString()): Promise<void> {
  return flagZoneEntry("congestion", jobId, driverInitials, occurredAt);
}
export function flagTunnelZoneEntry(jobId: string, driverInitials: string, _imei: string, occurredAt = new Date().toISOString()): Promise<void> {
  return flagZoneEntry("tunnel", jobId, driverInitials, occurredAt);
}

/** Pre-job entries establish context only, not a new in-job crossing or customer fee. */
export async function checkCongestionZoneAtJobStart(job: Job, driver: DriverProfile): Promise<void> {
  if (!(await getGpsApiKey())) return;
  try {
    const devices = await fetchGpsLiveDevices();
    const pinned = devices.find(row => row.imei === job.gpsliveImei);
    const device = pinned || findDeviceForDriver(driver, devices);
    if (!device) return;
    await withJobLock(job.jobId, async () => {
      const fresh = await getJob(job.jobId);
      if (!fresh || fresh.status === "COMPLETED" || fresh.status === "CANCELLED") return;
      recordGpsAssignment(fresh, device.imei, new Date().toISOString(), "job-start-resolution");
      await upsertJob(fresh);
    });
    const now = DateTime.utc();
    for (const search of ["Congestion", "Tunnel", "Dartford"]) {
      const rows = await fetchGpsLiveAlertsForDevice(device.imei, now.minus({ hours: 6 }).toFormat("yyyy-MM-dd HH:mm:ss"), now.toFormat("yyyy-MM-dd HH:mm:ss"), search);
      const parsed = rows.map(row => parseGpsEvent(row, "alerts-history", now.toISO()!, device.imei));
      await saveGpsEvents(parsed.filter((row): row is NonNullable<typeof row> => !!row));
    }
  } catch (error) { log.warn("zone job-start context check failed", { error: String(error), job_id: job.jobId }); }
}
