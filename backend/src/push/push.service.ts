import webpush, { PushSubscription as WebPushSubscription } from "web-push";
import { initVapid } from "./vapid";
import {
  getSubscriptionsByDriver,
  getAllPushSubscriptions,
  getAdminPushSubscriptions,
  removePushSubscriptionByEndpoint,
  upsertPushSubscription
} from "../db/push.repo";
import { PushSubscriptionDoc } from "../db/mongo";
import { log } from "../utils/logger";

export interface PushNotificationPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  url?: string;
  tag?: string;
  data?: Record<string, any>;
}

export interface SendPushResult {
  total: number;
  sent: number;
  failed: number;
  pruned: number;
}

export async function sendNotificationToSubscription(
  sub: PushSubscriptionDoc,
  payload: PushNotificationPayload
): Promise<boolean> {
  await initVapid();

  const pushSubscription: WebPushSubscription = {
    endpoint: sub.endpoint,
    keys: {
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth
    }
  };

  const payloadString = JSON.stringify({
    title: payload.title || "The Man Van",
    body: payload.body || "",
    icon: payload.icon || "/icons/icon-192.png",
    // badge (the small Android status-bar icon) deliberately has no default here.
    // It's documented as monochrome-only -- the OS reads just the alpha channel to
    // build the shape, then tints it itself -- but icon-192.png is the full-color
    // marketing logo on an OPAQUE white canvas (see public/icons/README.md's own
    // note that it's a stand-in, not a real app icon). Every pixel has alpha=255, so
    // there's no shape to extract: it rendered as a solid white/tinted square.
    // Passing no badge lets the OS fall back to its own sensible default instead of
    // that broken square; only use this field once a real simplified, transparent
    // silhouette mark exists.
    badge: payload.badge,
    url: payload.url || "/",
    tag: payload.tag || `tmv-${Date.now()}`,
    data: {
      url: payload.url || "/",
      ...payload.data
    }
  });

  try {
    await webpush.sendNotification(pushSubscription, payloadString, {
      TTL: 60 * 60 * 24, // 24 hours
      urgency: "high"
    });
    return true;
  } catch (error: any) {
    const statusCode = error?.statusCode;
    // 404 (Not Found) or 410 (Gone) indicates the subscription is expired or cancelled by user
    if (statusCode === 404 || statusCode === 410) {
      log.info("pruning expired push subscription", {
        endpoint: sub.endpoint.slice(0, 35) + "...",
        statusCode
      });
      await removePushSubscriptionByEndpoint(sub.endpoint);
    } else {
      log.warn("push notification send failed", {
        error: error?.message || String(error),
        statusCode,
        endpoint: sub.endpoint.slice(0, 35) + "..."
      });
    }
    return false;
  }
}

export async function sendPushToDriver(
  driverInitials: string,
  payload: PushNotificationPayload
): Promise<SendPushResult> {
  const subscriptions = await getSubscriptionsByDriver(driverInitials);
  if (subscriptions.length === 0) {
    log.debug("no push subscriptions found for driver", { driverInitials });
    return { total: 0, sent: 0, failed: 0, pruned: 0 };
  }

  let sent = 0;
  let failed = 0;

  await Promise.all(
    subscriptions.map(async sub => {
      const ok = await sendNotificationToSubscription(sub, payload);
      if (ok) sent++;
      else failed++;
    })
  );

  log.info("sent push to driver", {
    driver: driverInitials,
    total: subscriptions.length,
    sent,
    failed
  });

  return { total: subscriptions.length, sent, failed, pruned: 0 };
}

export async function broadcastPushNotification(
  payload: PushNotificationPayload
): Promise<SendPushResult> {
  const subscriptions = await getAllPushSubscriptions();
  if (subscriptions.length === 0) {
    return { total: 0, sent: 0, failed: 0, pruned: 0 };
  }

  let sent = 0;
  let failed = 0;

  await Promise.all(
    subscriptions.map(async sub => {
      const ok = await sendNotificationToSubscription(sub, payload);
      if (ok) sent++;
      else failed++;
    })
  );

  log.info("broadcasted push notification", {
    total: subscriptions.length,
    sent,
    failed
  });

  return { total: subscriptions.length, sent, failed, pruned: 0 };
}

/**
 * Operational alerts for admin devices only (job completed, an exception needs a
 * human decision) -- never reaches a driver's phone, even one whose subscription has
 * no driverInitials recorded (unlike broadcastPushNotification, which is genuinely
 * everyone). Silently a no-op with total:0 if no admin has ever enabled push -- these
 * are all fire-and-forget best-effort calls from event handlers, not something a
 * request should ever fail over.
 */
export async function sendPushToAdmins(
  payload: PushNotificationPayload
): Promise<SendPushResult> {
  const subscriptions = await getAdminPushSubscriptions();
  if (subscriptions.length === 0) {
    return { total: 0, sent: 0, failed: 0, pruned: 0 };
  }

  let sent = 0;
  let failed = 0;

  await Promise.all(
    subscriptions.map(async sub => {
      const ok = await sendNotificationToSubscription(sub, payload);
      if (ok) sent++;
      else failed++;
    })
  );

  log.info("sent push to admins", {
    total: subscriptions.length,
    sent,
    failed
  });

  return { total: subscriptions.length, sent, failed, pruned: 0 };
}

export { upsertPushSubscription, removePushSubscriptionByEndpoint };

