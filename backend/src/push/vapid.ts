import webpush from "web-push";
import { env } from "../config/env";
import { getSetting, setSetting } from "../db/settings.repo";
import { log } from "../utils/logger";

let cachedVapidKeys: { publicKey: string; privateKey: string } | null = null;

export async function initVapid(): Promise<{ publicKey: string; privateKey: string }> {
  if (cachedVapidKeys) {
    return cachedVapidKeys;
  }

  let publicKey = env.vapidPublicKey;
  let privateKey = env.vapidPrivateKey;

  // If not provided in environment, look up in database
  if (!publicKey || !privateKey) {
    const [dbPublic, dbPrivate] = await Promise.all([
      getSetting("vapid_public_key", ""),
      getSetting("vapid_private_key", "")
    ]);

    if (dbPublic && dbPrivate) {
      publicKey = dbPublic;
      privateKey = dbPrivate;
      log.info("loaded VAPID keys from database settings");
    } else {
      // Auto-generate fresh keys and persist to database
      const generated = webpush.generateVAPIDKeys();
      publicKey = generated.publicKey;
      privateKey = generated.privateKey;

      await Promise.all([
        setSetting("vapid_public_key", publicKey),
        setSetting("vapid_private_key", privateKey)
      ]);

      log.info("generated new VAPID keys and stored in database settings");
    }
  }

  webpush.setVapidDetails(
    env.vapidSubject || "mailto:operations@themanvan.co.uk",
    publicKey,
    privateKey
  );

  cachedVapidKeys = { publicKey, privateKey };
  return cachedVapidKeys;
}

export async function getVapidPublicKey(): Promise<string> {
  const keys = await initVapid();
  return keys.publicKey;
}
