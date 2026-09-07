/**
 * GPSLive's own alert feed (Alerts > Notifications in their dashboard), proxied so
 * ops can see it without leaving this admin dashboard. Covers every alert type on the
 * account (Moving, Ignition On, Crash Detection, Zone In/Out, ...), not just
 * congestion -- the "category" field lets the UI separate congestion-zone events out
 * from the rest, same distinction gpslive-webhook.routes.ts makes for the real-time
 * driver notification.
 */
import { Request, Response, Router } from "express";
import {
  buildDriverMatchIndex, fetchGpsLiveNotifications, guessPlateFromDeviceName, matchDriverByPlateAndName
} from "../../integrations/gpslive";
import { listDriverProfiles } from "../../auth/driver-account.service";
import { log } from "../../utils/logger";

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

  router.get("/", async (_req: Request, res: Response) => {
    try {
      const [events, drivers] = await Promise.all([
        fetchGpsLiveNotifications(),
        listDriverProfiles().catch(error => {
          log.warn("alerts route: driver lookup unavailable, showing alerts without driver match", { error: String(error) });
          return [];
        })
      ]);

      const driverIndex = buildDriverMatchIndex(drivers);

      const rows: AlertRow[] = events.map(event => {
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

  return router;
}
