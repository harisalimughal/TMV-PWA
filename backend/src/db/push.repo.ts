import { pushSubscriptionsCollection, PushSubscriptionDoc } from "./mongo";
import { log } from "../utils/logger";

export interface SaveSubscriptionInput {
  endpoint: string;
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

