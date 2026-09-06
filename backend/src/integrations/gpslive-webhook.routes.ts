import crypto from "node:crypto";
import { Request, Response, Router } from "express";
import { env } from "../config/env";
import { listDriverProfiles } from "../auth/driver-account.service";
import { listJobs } from "../db/jobs.repo";
import { flagCongestionZoneEntry } from "../jobs/congestion-zone.service";
import { buildDriverMatchIndex, guessPlateFromDeviceName, matchDriverByPlateAndName } from "./gpslive";
import { JobStatus } from "../jobs/job.types";
import { log } from "../utils/logger";

/**
 * One event from GPSLive's account-level Webhooks feature (Settings > Webhooks,
 * "Alerts" type). That feature forwards every alert on the account, not just the
 * ones we care about -- the client's existing "CHARGES - ALERTS" rule (type "Zone In
 * or Out") also covers a separate Tunnels zone we deliberately ignore below, plus
 * Crash Detection/Engine Idle/Ignition On/Moving alerts from other rules entirely.
 * Undocumented beyond what a live payload showed us; treat every field as possibly
 * absent.
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
    if (!env.gpsLiveWebhookToken || !tokenMatches(String(req.params.token), env.gpsLiveWebhookToken)) {
      res.status(404).end();
      return;
    }

    const event = req.body as GpsLiveWebhookEvent;

    try {
      // event_desc's zone name also covers a separate "Tunnels-Black-Silver" zone
      // under the same alert rule, which this substring check deliberately excludes
      // -- that's a different charge (tunnel toll, not congestion).
      if (event.type !== "zone_in" || !event.event_desc?.includes("Congestion")) {
        res.status(200).json({ ok: true, ignored: true });
        return;
      }

      const deviceName = event.deviceName || "";
      const drivers = await listDriverProfiles();
      const driverIndex = buildDriverMatchIndex(drivers);
      const matched = matchDriverByPlateAndName(guessPlateFromDeviceName(deviceName), deviceName, driverIndex);

      if (!matched) {
        log.debug("gpslive congestion webhook: no driver matched", { deviceName, event_id: event.event_id });
        res.status(200).json({ ok: true, matched: false });
        return;
      }

      const jobs = await listJobs();
      const activeJob = jobs.find(j => j.driverInitials === matched.initials && j.status === JobStatus.IN_PROGRESS);

      if (!activeJob) {
        res.status(200).json({ ok: true, matched: true, activeJob: false });
        return;
      }

      if (activeJob.congestionZoneEnteredAt) {
        // Already notified for this job -- GPSLive fires "Zone In" on every pass
        // through the zone (and retries failed deliveries), not just the first.
        res.status(200).json({ ok: true, alreadyFlagged: true });
        return;
      }

      await flagCongestionZoneEntry(activeJob.jobId, matched.initials, {
        title: "Entered Central London",
        body: "Congestion charge may apply -- add it on the Extra Charges step."
      });

      log.info("congestion zone entry detected via webhook", {
        job_id: activeJob.jobId, driver: matched.initials, event_id: event.event_id
      });
      res.status(200).json({ ok: true, flagged: true });
    } catch (error) {
      log.error("gpslive congestion webhook failed", error);
      res.status(500).json({ error: { code: "WEBHOOK_PROCESSING_FAILED" } });
    }
  });

  return router;
}
