import crypto from "node:crypto";
import { Request, Response, Router } from "express";
import { getGpsLiveWebhookToken } from "../config/live-settings";
import { listDriverProfiles } from "../auth/driver-account.service";
import { listJobs } from "../db/jobs.repo";
import { flagCongestionZoneEntry, flagTunnelZoneEntry } from "../jobs/congestion-zone.service";
import { buildDriverMatchIndex, guessPlateFromDeviceName, matchDriverByPlateAndName } from "./gpslive";
import { JobStatus } from "../jobs/job.types";
import { log } from "../utils/logger";

/**
 * One event from GPSLive's account-level Webhooks feature (Settings > Webhooks,
 * "Alerts" type). That feature forwards every alert on the account, not just the
 * ones we care about -- the client's existing "CHARGES - ALERTS" rule (type "Zone In
 * or Out") covers both the Congestion Charge zone and a separate "Tunnels-Black-
 * Silver"/Dartford Crossing tunnel zone, both handled below (different job field,
 * different push copy, same idempotent-per-job flagging); everything else -- Crash
 * Detection/Engine Idle/Ignition On/Moving alerts from other rules entirely -- is
 * ignored. Undocumented beyond what a live payload showed us; treat every field as
 * possibly absent.
 */
interface GpsLiveWebhookEvent {
  event_id?: string;
  type?: string;
  event_desc?: string;
  deviceName?: string;
  imei?: string;
}

/**
 * GPSLive's webhook feature has no signing/HMAC option (confirmed against the
 * dashboard's Webhook Properties form -- just Name/URL/Type), so the random token in
 * the URL path is the only thing standing between this endpoint and the open
 * internet. Constant-time compare is cheap, standard hygiene for that -- the actual
 * blast radius of a forged request is low (a spurious "entered the zone" push), not
 * worth more than this.
 */
function tokenMatches(candidate: string, expected: string): boolean {
  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function gpsLiveWebhookRoutes(): Router {
  const router = Router();

  router.post("/:token", async (req: Request, res: Response) => {
    const expectedToken = await getGpsLiveWebhookToken();
    if (!expectedToken || !tokenMatches(String(req.params.token), expectedToken)) {
      res.status(404).end();
      return;
    }

    const event = req.body as GpsLiveWebhookEvent;

    try {
      // event_desc's zone name also covers a separate "Tunnels-Black-Silver" zone
      // under the same alert rule -- handled identically to Congestion below, just a
      // different job field/push copy and a different Extra Charges suggestion.
      const isCongestion = event.event_desc?.includes("Congestion");
      const isTunnel = event.event_desc?.includes("Tunnel");
      if (event.type !== "zone_in" || (!isCongestion && !isTunnel)) {
        res.status(200).json({ ok: true, ignored: true });
        return;
      }

      const jobs = await listJobs();
      const inProgress = jobs.filter(j => j.status === JobStatus.IN_PROGRESS);

      // Primary: the job this exact device was pinned to at start (see
      // jobs/congestion-zone.service.ts's checkCongestionZoneAtJobStart) -- correct
      // even if the driver's assigned van on file has changed since (a van swap),
      // because it's keyed on the device identity that job actually started with,
      // not a live re-derivation from the driver's current profile.
      let activeJob = event.imei ? inProgress.find(j => j.gpsliveImei === event.imei) : undefined;
      let driverInitials = activeJob?.driverInitials;
      let matchedBy: "pinned_imei" | "plate_fallback" = "pinned_imei";

      if (!activeJob) {
        // Fallback for jobs that started with no device pinned -- no GPSLive key
        // configured at start time, or no matching device for that driver yet. Same
        // plate/initials guess this route always used, now only a safety net rather
        // than the primary path.
        matchedBy = "plate_fallback";
        const deviceName = event.deviceName || "";
        const drivers = await listDriverProfiles();
        const driverIndex = buildDriverMatchIndex(drivers);
        const matched = matchDriverByPlateAndName(guessPlateFromDeviceName(deviceName), deviceName, driverIndex);

        if (!matched) {
          log.debug("gpslive congestion webhook: no pinned job or driver matched", {
            deviceName, imei: event.imei, event_id: event.event_id
          });
          res.status(200).json({ ok: true, matched: false });
          return;
        }

        activeJob = inProgress.find(j => j.driverInitials === matched.initials);
        driverInitials = matched.initials;
      }

      if (!activeJob || !driverInitials) {
        // driverInitials is set as soon as either strategy identifies a driver, even
        // if (as here) that driver turns out to have no job in progress -- so this
        // correctly reports "matched: true, activeJob: false" for that case, not a
        // false "no match" just because the fallback path was the one that found them.
        res.status(200).json({ ok: true, matched: Boolean(driverInitials), activeJob: false });
        return;
      }

      const zone = isCongestion ? "congestion" : "tunnel";
      const alreadyFlagged = isCongestion ? activeJob.congestionZoneEnteredAt : activeJob.tunnelZoneEnteredAt;
      if (alreadyFlagged) {
        // Already notified for this job -- GPSLive fires "Zone In" on every pass
        // through the zone (and retries failed deliveries), not just the first.
        res.status(200).json({ ok: true, alreadyFlagged: true });
        return;
      }

      if (isCongestion) {
        await flagCongestionZoneEntry(activeJob.jobId, driverInitials, {
          title: "Entered Central London",
          body: "Congestion charge may apply -- add it on the Extra Charges step."
        });
      } else {
        await flagTunnelZoneEntry(activeJob.jobId, driverInitials, {
          title: "Entered a tunnel toll zone",
          body: "Tunnel charge may apply -- add it on the Extra Charges step."
        });
      }

      log.info(`${zone} zone entry detected via webhook`, {
        job_id: activeJob.jobId, driver: driverInitials, event_id: event.event_id, matched_by: matchedBy
      });
      res.status(200).json({ ok: true, flagged: true, zone });
    } catch (error) {
      log.error("gpslive congestion webhook failed", error);
      res.status(500).json({ error: { code: "WEBHOOK_PROCESSING_FAILED" } });
    }
  });

  return router;
}
