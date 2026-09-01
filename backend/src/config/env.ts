import "dotenv/config";
import { GoogleAuth, JWT } from "google-auth-library";
import { log } from "../utils/logger";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function numberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) throw new Error(`${name} must be a number`);
  return parsed;
}

function enumEnv<T extends string>(name: string, allowed: readonly T[], fallback: T): T {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  if (!(allowed as readonly string[]).includes(raw)) {
    throw new Error(`${name} must be one of: ${allowed.join(", ")}. Received: ${raw}`);
  }
  return raw as T;
}

function boolEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw == null) return fallback;
  return ["1", "true", "yes", "on"].includes(raw.toLowerCase());
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: numberEnv("PORT", 8080),
  /** Everything -- driver accounts, jobs/bookings/evidence, settings -- lives here.
   * Required at startup; there's no meaningful fallback for "no database". */
  mongoUri: required("MONGODB_URI"),
  mongoDbName: process.env.MONGODB_DB_NAME?.trim() || "tmv_pwa",
  calendarId: process.env.GOOGLE_CALENDAR_ID?.trim() || "primary",
  serviceAccountEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim() || "",
  serviceAccountPrivateKey: (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
  impersonatedUser: process.env.GOOGLE_WORKSPACE_IMPERSONATED_USER?.trim() || "",

  timezone: process.env.TMV_TIMEZONE?.trim() || "Europe/London",
  overtimeRatePer30Minutes: numberEnv("TMV_OVERTIME_RATE_PER_30_MINUTES", 55),
  overtimeGraceMinutes: numberEnv("TMV_OVERTIME_GRACE_MINUTES", 0),
  congestionCharge: numberEnv("TMV_CONGESTION_CHARGE", 18),
  tunnelCharge: numberEnv("TMV_TUNNEL_CHARGE", 13),
  maxImageBytes: numberEnv("TMV_MAX_IMAGE_BYTES", 10 * 1024 * 1024),
  notificationFromName: process.env.TMV_NOTIFICATION_FROM_NAME?.trim() || "The Man Van",
  vapidPublicKey: process.env.VAPID_PUBLIC_KEY?.trim() || "",
  vapidPrivateKey: process.env.VAPID_PRIVATE_KEY?.trim() || "",
  vapidSubject: process.env.VAPID_SUBJECT?.trim() || "mailto:operations@themanvan.co.uk",
  bootstrapOnStart: boolEnv("BOOTSTRAP_ON_START", true),
  syncSecret: process.env.SYNC_SECRET?.trim() || "",

  // Caching / throttling. Safe to lower to 0 to disable.
  calendarSyncTtlMs: numberEnv("TMV_CALENDAR_SYNC_TTL_MS", 120_000),

  // Hard ceilings so a slow Google call can never hold a driver on a spinner.
  mediaDownloadTimeoutMs: numberEnv("TMV_MEDIA_DOWNLOAD_TIMEOUT_MS", 15_000),
  emailTimeoutMs: numberEnv("TMV_EMAIL_TIMEOUT_MS", 5_000),
  smsTimeoutMs: numberEnv("TMV_SMS_TIMEOUT_MS", 5_000),

  /**
   * Firetext (firetext.co.uk) sends the "your move has started" customer SMS, alongside
   * the equivalent email. Both blank (the default) means SMS sending is simply skipped
   * -- same as a job with no customerEmail already skips the email.
   */
  firetextApiKey: process.env.FIRETEXT_API_KEY?.trim() || "",
  /** Sender ID shown as the "from" on the text -- 3-11 alphanumeric characters, no spaces. */
  firetextSenderId: process.env.FIRETEXT_SENDER_ID?.trim() || "",

  /** GPSLive (gpslive.app) live van tracking, for the admin dashboard's Live Fleet
   * page (admin/dashboard/*). Blank means fetchGpsLiveDevices() just returns an empty
   * fleet -- same "not configured yet" pattern as the other optional integrations. */
  gpsApiKey: process.env.GPS_API?.trim() || "",
  gpsTimeoutMs: numberEnv("TMV_GPS_TIMEOUT_MS", 5_000),

  // ---------------------------------------------------------------------------
  // Background processing
  // ---------------------------------------------------------------------------

  /**
   * "cloud-tasks" is the only production-safe value. "inline" runs handlers in-process
   * after the response and is for local development only; work is lost if the process
   * exits, which is precisely what Cloud Tasks exists to prevent.
   */
  queueDriver: enumEnv("TMV_QUEUE_DRIVER", ["cloud-tasks", "inline"] as const, "inline"),
  /**
   * Explicit opt-in for running the inline driver in production. Cloud Run recycles
   * instances routinely, which is why inline is refused there by default. A single
   * long-lived host (e.g. a VPS container that only restarts on crash/redeploy) doesn't
   * have that problem as long as the SWEEP_STALE_EVIDENCE reaper is cron-triggered to
   * recover anything lost on the restarts it does have.
   */
  allowInlineInProduction: boolEnv("TMV_ALLOW_INLINE_IN_PRODUCTION", false),
  gcpProject: process.env.GOOGLE_CLOUD_PROJECT?.trim() || process.env.GCP_PROJECT?.trim() || "",
  tasksLocation: process.env.TMV_TASKS_LOCATION?.trim() || "europe-west2",
  tasksQueue: process.env.TMV_TASKS_QUEUE?.trim() || "tmv-bot-tasks",
  /** Base URL Cloud Tasks calls back. */
  workerBaseUrl: process.env.TMV_WORKER_BASE_URL?.trim().replace(/\/+$/, "") || "",
  /** Service account Cloud Tasks uses to mint the OIDC token on worker calls. */
  tasksServiceAccountEmail: process.env.TMV_TASKS_SERVICE_ACCOUNT_EMAIL?.trim() || "",
  /** Fallback worker auth for environments without an OIDC signer. */
  workerSharedSecret: process.env.TMV_WORKER_SHARED_SECRET?.trim() || "",
  enqueueTimeoutMs: numberEnv("TMV_ENQUEUE_TIMEOUT_MS", 3_000),

  /** Attempts before evidence is marked FAILED and the driver is asked to re-upload. */
  evidenceMaxAttempts: numberEnv("TMV_EVIDENCE_MAX_ATTEMPTS", 5),
  /** How long evidence may sit in RECEIVED/PROCESSING before the reaper re-drives it. */
  evidenceStaleMs: numberEnv("TMV_EVIDENCE_STALE_MS", 300_000),
  /** Upper bound on background Drive work per task, so a task cannot run forever. */
  imageTaskTimeoutMs: numberEnv("TMV_IMAGE_TASK_TIMEOUT_MS", 120_000),

  /**
   * General-purpose HMAC signing key: driver session tokens, any signed one-off links
   * (e.g. a photo-upload confirmation link). Required in production -- without it,
   * anything "signed" by this process could be forged.
   */
  signatureLinkSecret: process.env.TMV_SIGNATURE_LINK_SECRET?.trim() || "",

  /**
   * Shared with TMV-Chat-bot -- it signs driver password-setup links (from the admin
   * dashboard's Add/Edit Driver flow), this project only verifies them (see
   * auth/setup-token.ts). Must be the identical value in both projects' env files, or
   * every link this app issues will fail to verify. Blank here just means the
   * /complete-setup route refuses with a clear "not configured" error -- login and
   * everything else keep working.
   */
  driverSetupLinkSecret: process.env.DRIVER_SETUP_LINK_SECRET?.trim() || "",

  /**
   * Shared password for tmv-pwa's own /admin screens (driver roster + settings --
   * see auth/admin.routes.ts). A single, unhashed, ops-known password is intentional
   * here: there's one admin, not a multi-user system with its own accounts. Blank
   * means every /admin request is refused with "not configured", not "always allow".
   */
  adminPassword: process.env.TMV_ADMIN_PASSWORD?.trim() || "",

  /**
   * Evidence photos (arrival/loaded/empty-van/signature) upload here instead of Google
   * Drive. Standard Cloudinary SDK auto-config format: cloudinary://<key>:<secret>@<cloud>.
   * Blank until the client provides it -- storage/cloudinary.ts only throws when an
   * upload is actually attempted, same "not configured yet" pattern as the other
   * pending-credential fields above. Everything else (auth, job list, workflow state)
   * works without it.
   */
  cloudinaryUrl: process.env.CLOUDINARY_URL?.trim() || "",

  /**
   * Crew hourly/overtime rate fallbacks -- overridable per-key from the /admin
   * Settings screen (see db/settings.repo.ts, admin/settings-spec.ts) without a
   * redeploy. These env values are only what workflow.engine.ts falls back to when no
   * override has been saved.
   */
  crewRate1Man: numberEnv("TMV_CREW_RATE_1_MAN", 45),
  crewRate2Man: numberEnv("TMV_CREW_RATE_2_MAN", 55),
  crewRate3Man: numberEnv("TMV_CREW_RATE_3_MAN", 65),
  packingRate: numberEnv("TMV_PACKING_RATE", 95),
  /** "Per hour" or "Per 30 minutes" -- anything containing "hour" is treated as hourly. */
  packingBillingUnit: process.env.TMV_PACKING_BILLING_UNIT?.trim() || "Per hour",
  crewBillingUnit: process.env.TMV_CREW_BILLING_UNIT?.trim() || "Per 30 minutes",

  /** This app's own public URL, for building absolute links in emails (password reset).
   * Falls back to the production domain since that's the only place this app is
   * actually deployed; override for local dev via .env if testing the email link. */
  appUrl: (process.env.APP_URL?.trim() || "https://chat.themanvan.co.uk").replace(/\/+$/, "")
};

export const SCOPES = {
  // Read-write: needed if this app ever writes Calendar events directly. Requires the
  // service account to have edit (not just view) access on the calendar.
  CALENDAR: ["https://www.googleapis.com/auth/calendar"],
  GMAIL: ["https://www.googleapis.com/auth/gmail.send"],
  // Still used by google/drive.ts's Chat-media download path (see its TODO(pwa) note) --
  // that whole path needs a PWA-specific replacement, at which point this can likely go.
  CHAT_BOT: ["https://www.googleapis.com/auth/chat.bot"],
  CLOUD_TASKS: ["https://www.googleapis.com/auth/cloud-platform"]
} as const;

/**
 * Auth clients are cached per (scopes, subject).
 *
 * google-auth-library caches access tokens on the client *instance*. The previous
 * implementation constructed a fresh JWT for every single Google call and threw it
 * away, forcing a signed token exchange with oauth2.googleapis.com on each one —
 * roughly 35 of them per photo upload. Reusing the instance removes all of them
 * after the first, which is the largest single latency win in this patch.
 */
const authClients = new Map<string, Promise<any>>();

function authKey(scopes: readonly string[], subject: string): string {
  return `${[...scopes].sort().join(",")}::${subject}`;
}

async function buildAuth(scopes: readonly string[], subject: string): Promise<any> {
  if (env.serviceAccountEmail && env.serviceAccountPrivateKey) {
    return new JWT({
      email: env.serviceAccountEmail,
      key: env.serviceAccountPrivateKey,
      scopes: [...scopes],
      subject: subject || undefined
    });
  }
  const auth = new GoogleAuth({ scopes: [...scopes] });
  return auth.getClient();
}

export interface AuthOptions {
  /**
   * Domain-wide-delegation subject. Opt-in per call site.
   *
   * Previously this was read from env.impersonatedUser for *every* scope set, so
   * configuring an impersonated user for Gmail silently made Sheets, Drive and Calendar
   * impersonate too — which breaks the documented "share the file with the service
   * account" setup and would fail outright against cloud-platform.
   */
  impersonate?: boolean;
}

export function createGoogleAuth(scopes: readonly string[], options: AuthOptions = {}): Promise<any> {
  const subject = options.impersonate ? env.impersonatedUser : "";
  const key = authKey(scopes, subject);
  let existing = authClients.get(key);
  if (!existing) {
    existing = buildAuth(scopes, subject).catch(error => {
      // Never cache a failed construction, or the process is poisoned until restart.
      authClients.delete(key);
      throw error;
    });
    authClients.set(key, existing);
  }
  return existing;
}

/**
 * Pre-fetches access tokens at boot so the first driver interaction of a cold
 * Cloud Run instance is not the one that pays for the token exchanges.
 */
export async function warmupAuth(): Promise<void> {
  const sets: Array<{ scopes: readonly string[]; options?: AuthOptions }> = [
    { scopes: SCOPES.CALENDAR }
  ];
  if (env.queueDriver === "cloud-tasks") sets.push({ scopes: SCOPES.CLOUD_TASKS });
  if (env.impersonatedUser) {
    sets.push({ scopes: SCOPES.GMAIL, options: { impersonate: true } });
    // Calendar event writes (if any) impersonate this same user via domain-wide
    // delegation — see google/calendar.ts's writeClient().
    sets.push({ scopes: SCOPES.CALENDAR, options: { impersonate: true } });
  }

  await Promise.all(
    sets.map(async ({ scopes, options }) => {
      try {
        const client = await createGoogleAuth(scopes, options);
        await client.getAccessToken();
      } catch (error) {
        log.warn("auth warmup failed for scope set", { scopes: scopes.join(","), error: String(error) });
      }
    })
  );
}
