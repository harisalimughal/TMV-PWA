import { env, sanitizeSenderId } from "./env";
import { getSetting } from "../db/settings.repo";

/**
 * Live-overridable integration credentials -- the admin API Settings page (see
 * admin/settings-spec.ts) writes these to the same Mongo `settings` collection every
 * other admin-editable value already uses. Each getter here resolves the current
 * effective value at call time: an admin-saved override if one exists, otherwise the
 * env var this process booted with (env.ts).
 *
 * This intentionally does NOT touch .env.production or restart the container -- a
 * saved override takes effect on the very next call, no redeploy needed, and if
 * nothing is ever saved here behaviour is byte-for-byte what it was before this
 * existed. Rotating a leaked/expired key from the file instead of this page still
 * works exactly as before; a value saved here simply takes priority over it.
 */

export function getFiretextApiKey(): Promise<string> {
  return getSetting("FIRETEXT_API_KEY", env.firetextApiKey);
}

export async function getFiretextSenderId(): Promise<string> {
  const value = await getSetting("FIRETEXT_SENDER_ID", env.firetextSenderId);
  return sanitizeSenderId(value, env.firetextSenderId);
}

export function getGpsApiKey(): Promise<string> {
  return getSetting("GPS_API", env.gpsApiKey);
}

export function getGpsLiveWebhookToken(): Promise<string> {
  return getSetting("TMV_GPSLIVE_WEBHOOK_TOKEN", env.gpsLiveWebhookToken);
}
