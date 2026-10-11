import crypto from "node:crypto";
import { Request, Response, Router } from "express";
import { getGpsLiveWebhookToken } from "../config/live-settings";
import { ingestGpsWebhook } from "../gps/gps.ingest";
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
    try {
    const expectedToken = await getGpsLiveWebhookToken();
    if (!expectedToken || !tokenMatches(String(req.params.token), expectedToken)) {
      res.status(404).end();
      return;
    }

      const batch = Array.isArray(req.body) ? req.body : [req.body];
      if (batch.length > 100) { res.status(413).json({ error: { code: "WEBHOOK_BATCH_TOO_LARGE" } }); return; }
      const results = [];
      const receivedAt = new Date().toISOString();
      for (const event of batch) results.push(await ingestGpsWebhook(event, receivedAt));
      res.status(200).json({ ok: true, results });
    } catch (error) {
      log.error("gpslive congestion webhook failed", error);
      res.status(500).json({ error: { code: "WEBHOOK_PROCESSING_FAILED" } });
    }
  });

  return router;
}
