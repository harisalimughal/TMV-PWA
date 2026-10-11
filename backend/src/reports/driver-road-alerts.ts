import { DateTime } from "luxon";
import { buildDriverMatchIndex, fetchGpsLiveAlertsForFleet, guessPlateFromDeviceName, matchDriverByPlateAndName } from "../integrations/gpslive";
import { parseGpsEvent } from "../gps/gps.parse";
import { createGpsAssociator } from "../gps/gps.association";
import { reconstructGpsVisits } from "../gps/gps.visits";
import { parseRoadRate, roadWindow } from "../gps/road-charge.rules";
import { getSetting } from "../db/settings.repo";
import { env } from "../config/env";
import type { DriverProfile, Job } from "../jobs/job.types";
import type { GpsEvent } from "../gps/gps.types";
import { addReportMoney } from "./report-payments";

export function summarizeExpectedRoadCharges(alerts: Array<{ jobId: string | null; type: string; estimatedPence: number | null }>, jobIds: Set<string>, available: boolean) {
  const total = (type: "tunnel" | "congestion") => {
    const rows = alerts.filter(row => row.type === type && !!row.jobId && jobIds.has(row.jobId));
    const unpricedEntries = rows.filter(row => row.estimatedPence === null).length;
    const knownPence = rows.reduce((sum, row) => addReportMoney(sum, row.estimatedPence ?? 0), 0);
    return { pence: !available || rows.length > 0 && unpricedEntries === rows.length ? null : knownPence, knownPence, unpricedEntries };
  };
  return { tunnel: total("tunnel"), congestion: total("congestion") };
}

export async function readReportAlerts(from: string, to: string, imeis?: string[]) {
  const rows = await fetchGpsLiveAlertsForFleet(DateTime.fromISO(from).toUTC().toFormat("yyyy-MM-dd HH:mm:ss"), DateTime.fromISO(to).toUTC().toFormat("yyyy-MM-dd HH:mm:ss"), imeis);
  const now = new Date().toISOString();
  return { events: rows.map(row => parseGpsEvent(row, "alerts-history", now)).filter((row): row is GpsEvent => !!row), truncated: rows.length >= 500 };
}

/** Read-only report estimates: never become ledger obligations or alter saved customer totals. */
export function projectRoadAlerts(events: GpsEvent[], jobs: Job[], driver: DriverProfile | null, initials: string, range: { from: string; to: string }, rates: { congestion: number | null; tunnel: number | null }, now: string) {
  const index = buildDriverMatchIndex(driver ? [driver] : []);
  const associate = createGpsAssociator(jobs, now);
  const londonDay = (event: GpsEvent) => DateTime.fromISO(event.occurredAt!).setZone("Europe/London").toISODate();
  const unique = [...new Map(events.map(event => [event._id, event])).values()];
  const eventsById = new Map(unique.map(event => [event._id, event]));
  const jobsById = new Map(jobs.map(job => [job.jobId, job]));
  const own = unique.filter(event => {
    const association = associate(event);
    if (association.driverInitials) return association.driverInitials === initials;
    if (association.confidence === "ambiguous") return false;
    return matchDriverByPlateAndName(guessPlateFromDeviceName(event.deviceName), event.deviceName, index, event.imei ?? "")?.initials === initials;
  });
  const seenCongestionJobs = new Set<string>();
  const ownById = new Map(own.map(event => [event._id, event]));
  const alertVisits = reconstructGpsVisits(own, [], [], jobs, now).flatMap(visit => {
    const entries = visit.eventIds.map(id => ownById.get(id)).filter((event): event is GpsEvent => !!event && event.type === "entry");
    const first = entries[0];
    if (!first) return [];
    // An unclosed visit must not let an older day/job swallow a later linked entry.
    const starts = [first];
    for (const entry of entries.slice(1)) {
      const previous = starts.at(-1)!;
      const contextChanged = londonDay(entry) !== londonDay(previous) || associate(entry).jobId !== associate(previous).jobId;
      const repeatedZone = (entry.zoneId || entry.zoneName) === (previous.zoneId || previous.zoneName) &&
        Date.parse(entry.occurredAt!) - Date.parse(previous.occurredAt!) > 30_000;
      if (contextChanged || repeatedZone) starts.push(entry);
    }
    return starts.map((entry, index) => {
      const nextAt = starts[index + 1]?.occurredAt;
      const exitAt = nextAt ? null : visit.exitAt;
      const eventIds = visit.eventIds.filter(id => {
        const at = eventsById.get(id)?.occurredAt;
        return !!at && Date.parse(at) >= Date.parse(entry.occurredAt!) && (!nextAt || Date.parse(at) < Date.parse(nextAt));
      });
      return { ...visit, id: `alert-visit:${entry._id}`, entryAt: entry.occurredAt, firstInsideAt: entry.occurredAt!, exitAt,
        durationSeconds: exitAt ? (Date.parse(exitAt) - Date.parse(entry.occurredAt!)) / 1000 : null,
        association: associate(entry), eventIds,
        zoneNames: [...new Set(eventIds.map(id => eventsById.get(id)!.zoneName))] };
    });
  });
  return alertVisits.filter(visit => visit.entryAt && Date.parse(visit.entryAt) >= Date.parse(range.from) && Date.parse(visit.entryAt) < Date.parse(range.to))
    .sort((a, b) => Date.parse(a.entryAt!) - Date.parse(b.entryAt!) || a.id.localeCompare(b.id)).map(visit => {
    const at = visit.entryAt!;
    const type = visit.scheme === "congestion" ? "congestion" : "tunnel";
    const window = roadWindow(type, at);
    let jobId = visit.association.jobId;
    let linkBasis = jobId ? "recorded-device" : "unmatched";
    // Old alerts can be displayed with a unique driver/time match, but are not physical GPS proof.
    if (!jobId) {
      const candidates = jobs.filter(job => (job.reportIdentity?.initials ?? job.timeBilling?.driverInitials ?? job.driverInitials) === initials && job.status !== "CANCELLED" &&
        job.actualStartSource !== "completion-fallback" && !["admin-manual", "completion-fallback"].includes(job.actualFinishSource ?? "") &&
        Date.parse(at) >= Date.parse(job.onMyWayAt || job.actualStart) && Date.parse(at) < Date.parse(job.actualFinish || (job.status === "COMPLETED" ? "" : now)) &&
        (!job.gpsliveImei || job.gpsliveImei === visit.imei) && !job.gpsDeviceHistory?.length);
      if (candidates.length === 1) { jobId = candidates[0].jobId; linkBasis = "driver-time-match"; }
    }
    const job = jobsById.get(jobId ?? "");
    const inJob = !!job && Date.parse(at) >= Date.parse(job.actualStart) && Date.parse(at) < Date.parse(job.actualFinish || (job.status === "COMPLETED" ? "" : now));
    const chargeable = window.chargeable === true && inJob;
    const alreadyAllocated = type === "congestion" && !!jobId && seenCongestionJobs.has(jobId);
    if (chargeable && type === "congestion") seenCongestionJobs.add(jobId!);
    const snapshot = job?.roadTariffSnapshot;
    const effective = snapshot && Date.parse(snapshot.effectiveFrom) <= Date.parse(at);
    const rate = effective ? type === "congestion" ? snapshot.congestionPence : snapshot.tunnelPence : rates[type];
    const estimatedPence = window.chargeable === false ? 0 : !inJob || window.chargeable === null ? null : !chargeable || alreadyAllocated ? 0 : rate;
    const feeReason = estimatedPence !== null ? null : !jobId ? "No matching job" : !inJob ? "Outside job working time" : window.chargeable === null ? "Charging time unavailable" : "Pricing rate unavailable";
    return { id: visit.id, type, scheme: visit.scheme, zone: visit.zoneNames.join(", "), enteredAt: at, exitedAt: visit.exitAt,
      durationSeconds: visit.durationSeconds, jobId, linkBasis, inChargeableHours: window.chargeable, chargeable: chargeable && !alreadyAllocated,
      estimatedPence, feeReason,
      rateBasis: effective ? "Job pricing snapshot" : "Current Pricing Settings estimate",
      alerts: visit.eventIds.map(id => eventsById.get(id)).filter((event): event is GpsEvent => !!event).map(event => ({ id: event._id, type: event.type, description: event.zoneName, occurredAt: event.occurredAt })) };
  });
}

export async function reportAlertRates() {
  const [congestion, tunnel] = await Promise.all([
    getSetting("CONGESTION_CHARGE", String(env.congestionCharge)), getSetting("TUNNEL_CHARGE", String(env.tunnelCharge))
  ]);
  return { congestion: parseRoadRate(congestion), tunnel: parseRoadRate(tunnel) };
}
