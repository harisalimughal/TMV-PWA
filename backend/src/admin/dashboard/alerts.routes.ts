/**
 * GPSLive's own alert feed (Alerts > Notifications in their dashboard), proxied so
 * ops can see it without leaving this admin dashboard. Covers every alert type on the
 * account (Moving, Ignition On, Crash Detection, Zone In/Out, ...), not just
 * congestion -- the "category" field lets the UI separate congestion-zone events out
 * from the rest, same distinction gpslive-webhook.routes.ts makes for the real-time
 * driver notification.
 */
import { Request, Response, Router } from "express";
import { DateTime } from "luxon";
import {
  buildDriverMatchIndex, fetchGpsLiveAlertsForFleet, fetchGpsLiveNotifications,
  guessPlateFromDeviceName, matchDriverByPlateAndName
} from "../../integrations/gpslive";
import { listDriverProfiles } from "../../auth/driver-account.service";
import { dismiss, listDismissedIds } from "../../db/dismissals.repo";
import { log } from "../../utils/logger";

/** The frontend's DateRangePicker sends UTC-anchored ISO strings; GPSLive's
 *  /v1/alerts/custom wants "YYYY-MM-DD HH:mm:ss" and its own dt_tracker values are
 *  already treated as UTC elsewhere (see AlertsPage.tsx's formatGpsLiveTimestamp),
 *  so this converts as UTC rather than Europe/London to match that convention. */
function toGpsLiveDate(iso: string): string | null {
  const dt = DateTime.fromISO(iso, { zone: "utc" });
  return dt.isValid ? dt.toFormat("yyyy-MM-dd HH:mm:ss") : null;
}

export type AlertCategory = "congestion" | "tunnel" | "other";

export interface AlertRow {
  eventId: string;
  type: string;
  description: string;
  category: AlertCategory;
  deviceName: string | null;
  driverInitials: string | null;
  driverName: string | null;
  detectedAt: string;
}

function categorize(description: string): AlertCategory {
  if (description.includes("Congestion")) return "congestion";
  if (description.includes("Tunnels") || description.includes("Dartford")) return "tunnel";
  return "other";
}

export function dashboardAlertsRoutes(): Router {
  const router = Router();

  router.get("/", async (req: Request, res: Response) => {
    try {
      const from = typeof req.query.from === "string" ? toGpsLiveDate(req.query.from) : null;
      const to = typeof req.query.to === "string" ? toGpsLiveDate(req.query.to) : null;

      const [events, drivers, dismissed] = await Promise.all([
        from && to ? fetchGpsLiveAlertsForFleet(from, to) : fetchGpsLiveNotifications(),
        listDriverProfiles().catch(error => {
          log.warn("alerts route: driver lookup unavailable, showing alerts without driver match", { error: String(error) });
          return [];
        }),
        listDismissedIds("alert")
      ]);

      const driverIndex = buildDriverMatchIndex(drivers);

      const rows: AlertRow[] = events
        .filter(event => !dismissed.has(event.event_id))
        .map(event => {
        const deviceName = event.device?.name || null;
        const matched = deviceName
          ? matchDriverByPlateAndName(guessPlateFromDeviceName(deviceName), deviceName, driverIndex)
          : null;
        return {
          eventId: event.event_id,
          type: event.type,
          description: event.event_desc,
          category: categorize(event.event_desc || ""),
          deviceName,
          driverInitials: matched?.initials ?? null,
          driverName: matched?.fullName ?? null,
          detectedAt: event.dt_tracker
        };
      });

      return res.status(200).json({ rows });
    } catch (error) {
      log.error("dashboard alerts lookup failed", error);
      return res.status(502).json({ error: { code: "ALERTS_LOOKUP_FAILED", message: "Failed to fetch GPSLive alerts." } });
    }
  });

  router.post("/dismiss", async (req: Request, res: Response) => {
    const eventIds = Array.isArray(req.body?.eventIds) ? req.body.eventIds.filter((id: unknown) => typeof id === "string") : [];
    if (eventIds.length === 0) {
      return res.status(400).json({ error: { code: "NO_IDS", message: "No alert ids given to dismiss." } });
    }
    try {
      await dismiss("alert", eventIds);
      res.status(200).json({ dismissed: eventIds.length });
    } catch (error) {
      log.error("dashboard alerts dismiss failed", error);
      res.status(500).json({ error: { code: "ALERTS_DISMISS_FAILED", message: "Failed to remove the selected alerts." } });
    }
  });

  return router;
}
