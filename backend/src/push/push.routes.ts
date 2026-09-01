import { Router, Request, Response } from "express";
import { getVapidPublicKey } from "./vapid";
import {
  upsertPushSubscription,
  removePushSubscriptionByEndpoint,
  sendNotificationToSubscription,
  sendPushToDriver,
  broadcastPushNotification
} from "./push.service";
import { readSessionCookie, verifySessionToken } from "../auth/session";
import { getDriverAccount } from "../auth/driver-account.service";
import { requireAdminAuth } from "../auth/require-admin-auth";
import { readAdminSessionCookie, verifyAdminSessionToken } from "../auth/admin-session";
import { log } from "../utils/logger";

export function pushRoutes(): Router {
  const router = Router();

  // Public endpoint: returns the VAPID public key so clients can subscribe
  router.get("/vapid-public-key", async (_req: Request, res: Response) => {
    try {
      const publicKey = await getVapidPublicKey();
      res.json({ publicKey });
    } catch (error: any) {
      log.error("failed to get VAPID public key", error);
      res.status(500).json({ error: "Failed to load VAPID public key" });
    }
  });

  // Client subscription endpoint
  router.post("/subscribe", async (req: Request, res: Response) => {
    try {
      const { subscription, platform } = req.body;

      if (!subscription || !subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
        return res.status(400).json({ error: "Invalid push subscription object" });
      }

      // Admin dashboard and driver app share this one endpoint (same backend, two
      // origins) -- whichever session cookie is actually present on the request
      // settles which this device is. Checked in this order deliberately: an admin
      // browsing while also somehow holding a stale driver cookie should still count
      // as admin, since that's the app they're subscribing from.
      let role: "admin" | "driver" = "driver";
      let driverInitials: string | undefined = req.body.driverInitials;
      let driverEmail: string | undefined;

      const adminToken = readAdminSessionCookie(req);
      if (adminToken && verifyAdminSessionToken(adminToken)) {
        role = "admin";
        driverInitials = undefined;
      } else {
        const token = readSessionCookie(req);
        if (token) {
          const payload = verifySessionToken(token);
          if (payload?.email) {
            driverEmail = payload.email;
            const account = await getDriverAccount(payload.email);
            if (account?.initials) {
              driverInitials = account.initials;
            }
          }
        }
      }

      const userAgent = req.headers["user-agent"] || "";

      await upsertPushSubscription({
        endpoint: subscription.endpoint,
        keys: subscription.keys,
        role,
        driverInitials: driverInitials ? driverInitials.trim().toUpperCase() : undefined,
        driverEmail,
        platform: platform || (userAgent.includes("iPhone") || userAgent.includes("iPad") ? "ios" : userAgent.includes("Android") ? "android" : "desktop"),
        userAgent
      });

      res.json({ ok: true });
    } catch (error: any) {
      log.error("failed to save push subscription", error);
      res.status(500).json({ error: "Failed to save push subscription" });
    }
  });

  // Client unsubscription endpoint
  router.post("/unsubscribe", async (req: Request, res: Response) => {
    try {
      const { endpoint } = req.body;
      if (!endpoint || typeof endpoint !== "string") {
        return res.status(400).json({ error: "Missing subscription endpoint" });
      }

      await removePushSubscriptionByEndpoint(endpoint);
      res.json({ ok: true });
    } catch (error: any) {
      log.error("failed to remove push subscription", error);
      res.status(500).json({ error: "Failed to unsubscribe" });
    }
  });

  // Test push notification endpoint
  router.post("/test", async (req: Request, res: Response) => {
    try {
      const { subscription, driverInitials } = req.body;

      const payload = {
        title: "The Man Van",
        body: "Push notifications are working perfectly on your device!",
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        url: "/?tab=settings"
      };

      if (subscription?.endpoint && subscription?.keys) {
        const ok = await sendNotificationToSubscription(
          {
            endpoint: subscription.endpoint,
            keys: subscription.keys,
            createdAt: new Date(),
            updatedAt: new Date()
          },
          payload
        );
        return res.json({ ok });
      }

      if (driverInitials) {
        const result = await sendPushToDriver(driverInitials, payload);
        return res.json({ ok: true, result });
      }

      // Check authenticated driver session
      const token = readSessionCookie(req);
      if (token) {
        const session = verifySessionToken(token);
        if (session?.email) {
          const account = await getDriverAccount(session.email);
          if (account?.initials) {
            const result = await sendPushToDriver(account.initials, payload);
            return res.json({ ok: true, result });
          }
        }
      }

      res.status(400).json({ error: "No target device or driver specified for test" });
    } catch (error: any) {
      log.error("failed to send test push notification", error);
      res.status(500).json({ error: "Failed to send test push notification" });
    }
  });

  // Admin broadcast push endpoint
  router.post("/admin/broadcast", requireAdminAuth, async (req: Request, res: Response) => {
    try {
      const { title, body, url, driverInitials } = req.body;

      if (!title || !body) {
        return res.status(400).json({ error: "Title and body are required" });
      }

      const payload = {
        title,
        body,
        url: url || "/"
      };

      if (driverInitials) {
        const result = await sendPushToDriver(driverInitials, payload);
        return res.json({ ok: true, result });
      }

      const result = await broadcastPushNotification(payload);
      res.json({ ok: true, result });
    } catch (error: any) {
      log.error("admin push broadcast failed", error);
      res.status(500).json({ error: "Failed to broadcast push notification" });
    }
  });

  return router;
}

