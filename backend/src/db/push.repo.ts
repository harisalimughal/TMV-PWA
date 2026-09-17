import { pushSubscriptionsCollection, PushSubscriptionDoc } from "./mongo";
import { log } from "../utils/logger";

export interface SaveSubscriptionInput {
  endpoint: string;
  /** Resolved server-side (push/push.routes.ts) from the session cookie actually
   *  present on the request -- see PushSubscriptionDoc's role field. */
  role?: "admin" | "driver";
  driverInitials?: string;
  driverEmail?: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  userAgent?: string;
  platform?: "ios" | "android" | "desktop" | "unknown";
}

export async function upsertPushSubscription(input: SaveSubscriptionInput): Promise<void> {
  const collection = await pushSubscriptionsCollection();
  const now = new Date();

  await collection.updateOne(
    { endpoint: input.endpoint },
    {
      $set: {
        keys: input.keys,
        role: input.role || "driver",
        driverInitials: input.driverInitials,
        driverEmail: input.driverEmail,
        userAgent: input.userAgent,
        platform: input.platform || "unknown",
        updatedAt: now
      },
      $setOnInsert: {
        createdAt: now
      }
    },
    { upsert: true }
  );

  log.info("push subscription upserted", {
    role: input.role,
    driver: input.driverInitials,
    platform: input.platform,
    endpoint: input.endpoint.slice(0, 35) + "..."
  });
}

export async function removePushSubscriptionByEndpoint(endpoint: string): Promise<boolean> {
  const collection = await pushSubscriptionsCollection();
  const result = await collection.deleteOne({ endpoint });
  const deleted = (result.deletedCount ?? 0) > 0;
  if (deleted) {
    log.info("push subscription removed", { endpoint: endpoint.slice(0, 35) + "..." });
  }
  return deleted;
}

export async function getSubscriptionsByDriver(driverInitials: string): Promise<PushSubscriptionDoc[]> {
  const collection = await pushSubscriptionsCollection();
  return collection.find({ driverInitials: driverInitials.trim().toUpperCase() }).toArray();
}

export async function getAllPushSubscriptions(): Promise<PushSubscriptionDoc[]> {
  const collection = await pushSubscriptionsCollection();
  return collection.find({}).toArray();
}

/** Targets for admin-only alerts (job completed, exceptions raised) -- never a
 *  driver's device, even one that happens to have no driverInitials recorded. */
export async function getAdminPushSubscriptions(): Promise<PushSubscriptionDoc[]> {
  const collection = await pushSubscriptionsCollection();
  return collection.find({ role: "admin" }).toArray();
}

/** Every driver device -- i.e. every subscription except an admin's. Used for the
 *  "Broadcast to All Active Drivers" action (SendBroadcastPushModal); getAllPushSubscriptions
 *  is the true "everyone including admins" set and was being used there by mistake,
 *  so a broadcast an admin sent to "all drivers" also landed on their own device.
 *  role is optional (see PushSubscriptionDoc) and defaults to "driver" server-side at
 *  subscribe time, so `{ $ne: "admin" }` (not `role: "driver"`) also covers any older
 *  subscription written before that field existed. */
export async function getDriverPushSubscriptions(): Promise<PushSubscriptionDoc[]> {
  const collection = await pushSubscriptionsCollection();
  return collection.find({ role: { $ne: "admin" } }).toArray();
}

/** Used by the admin Factory Reset action (maintenance.routes.ts). Every device --
 *  admin and driver alike -- re-subscribes on its own next app load/login (App.tsx's
 *  auto-prompt for drivers, the manual Enable button for admins); nothing needs to be
 *  re-created here. */
export async function deleteAllPushSubscriptions(): Promise<number> {
  const collection = await pushSubscriptionsCollection();
  const result = await collection.deleteMany({});
  return result.deletedCount ?? 0;
}

export async function countActiveSubscriptions(): Promise<{ total: number; drivers: number }> {
  const collection = await pushSubscriptionsCollection();
  const [total, driverInitialsList] = await Promise.all([
    collection.countDocuments(),
    collection.distinct("driverInitials")
  ]);
  return {
    total,
    drivers: driverInitialsList.filter(Boolean).length
  };
}

