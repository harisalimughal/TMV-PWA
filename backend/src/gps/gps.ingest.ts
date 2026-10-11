import { listJobs } from "../db/jobs.repo";
import { flagCongestionZoneEntry, flagTunnelZoneEntry } from "../jobs/congestion-zone.service";
import { associateGpsEvent } from "./gps.association";
import { parseGpsEvent } from "./gps.parse";
import { saveGpsEvent } from "./gps.repo";
import { fetchGpsLiveNotifications, type GpsLiveAlertEvent } from "../integrations/gpslive";

let notifications: { at: number; rows: GpsLiveAlertEvent[] } | null = null;
export function clearGpsNotificationCache(): void { notifications = null; }
async function resolveRecentEvent(id: string): Promise<GpsLiveAlertEvent | undefined> {
  if (!notifications || Date.now() - notifications.at > 10_000) {
    notifications = { at: Date.now(), rows: await fetchGpsLiveNotifications() };
  }
  return notifications.rows.find(row => row.event_id === id);
}

export async function ingestGpsWebhook(payload: unknown, receivedAt = new Date().toISOString()) {
  const parsed = parseGpsEvent(payload, "webhook", receivedAt);
  if (!parsed) return { ignored: true };
  // Persist before matching/notifications. A failed downstream step can be retried safely.
  let event = await saveGpsEvent(parsed);
  if (event.providerEventId && !event.occurredAt) {
    try {
      const provider = await resolveRecentEvent(event.providerEventId);
      const resolved = provider ? parseGpsEvent(provider, "alerts-history", receivedAt) : null;
      if (resolved) event = await saveGpsEvent(resolved);
    } catch { /* Stored raw evidence remains available for the bounded history importer. */ }
  }
  const jobs = event.imei ? await listJobs({ gpsliveImei: event.imei }) : [];
  const association = associateGpsEvent(event, jobs, receivedAt);
  const job = jobs.find(row => row.jobId === association.jobId);
  if (event.type === "entry" && event.scheme && event.occurredAt && job?.status === "IN_PROGRESS" &&
    Date.parse(receivedAt) - Date.parse(event.occurredAt) <= 5 * 60_000 &&
    Date.parse(event.occurredAt) <= Date.parse(receivedAt)) {
    if (event.scheme === "congestion") await flagCongestionZoneEntry(job.jobId, association.driverInitials!, event.imei!, event.occurredAt);
    else await flagTunnelZoneEntry(job.jobId, association.driverInitials!, event.imei!, event.occurredAt);
  }
  return { eventId: event._id, association, preserved: true };
}
