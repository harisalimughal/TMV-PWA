import { env } from "../config/env";
import { JOB_COMPLETION_EMAIL_TEMPLATE, JOB_STARTED_MESSAGE_TEMPLATE, REVIEW_REQUEST_EMAIL_TEMPLATE } from "../notifications/message";
import { DEFAULT_CUSTOMER_CONFIRMATION_TEXT } from "../workflow/workflow.engine";
import { DAMAGE_CATEGORIES } from "../workflow/scenario.spec";

export interface SettingFieldSpec {
  key: string;
  label: string;
  /** "password" renders masked with a reveal toggle -- used for API keys/tokens the
   *  admin can rotate from the API Settings page, so they don't sit as plaintext on
   *  screen by default. */
  type: "text" | "textarea" | "number" | "password";
  fallback: string;
  hint?: string;
}

const CREW_RATE_KEY_RE = /^CREW_RATE_([1-9]\d*)_MAN$/;

/**
 * The exact set of keys workflow.engine.ts actually reads via getSetting() -- the
 * single source of truth for what the /admin Settings screen can edit. Adding a new
 * admin-editable setting means adding both a getSetting() call site and a row here.
 */
export const SETTINGS_SPEC: SettingFieldSpec[] = [
  {
    key: "CUSTOMER_CONFIRMATION_TEXT",
    label: "Customer Confirmation Text",
    type: "textarea",
    fallback: DEFAULT_CUSTOMER_CONFIRMATION_TEXT,
    hint: "Shown to the customer just before they sign at the end of the job."
  },
  {
    key: "JOB_COMPLETION_EMAIL_TEXT",
    label: "Job Completion Email",
    type: "textarea",
    fallback: JOB_COMPLETION_EMAIL_TEMPLATE,
    hint: "Sent automatically when a job is marked complete. Placeholders: {customerName} {companyName} {pickup} {dropoff} {driverPhone} {vanRegistration} {driver_name} {job_time} {job_date}"
  },
  {
    key: "REVIEW_REQUEST_EMAIL_TEXT",
    label: "Review Request Email",
    type: "textarea",
    fallback: REVIEW_REQUEST_EMAIL_TEMPLATE,
    hint: "Sent only if the driver opts in on the review step. Placeholders: {NAME} {customerName} {companyName} {pickup} {dropoff} {driverPhone} {vanRegistration} {driver_name} {job_time} {job_date}"
  },
  { key: "CREW_RATE_1_MAN", label: "Crew Rate — 1 Man (£)", type: "number", fallback: String(env.crewRate1Man) },
  { key: "CREW_RATE_2_MAN", label: "Crew Rate — 2 Man (£)", type: "number", fallback: String(env.crewRate2Man) },
  { key: "CREW_RATE_3_MAN", label: "Crew Rate — 3 Man (£)", type: "number", fallback: String(env.crewRate3Man) },
  { key: "PACKING_RATE", label: "Packing Rate (£)", type: "number", fallback: String(env.packingRate) },
  {
    key: "PACKING_BILLING_UNIT",
    label: "Packing Billing Unit",
    type: "text",
    fallback: env.packingBillingUnit,
    hint: "\"Per hour\" or \"Per 30 minutes\" -- anything containing \"hour\" is treated as hourly."
  },
  {
    key: "CREW_BILLING_UNIT",
    label: "Crew Billing Unit",
    type: "text",
    fallback: env.crewBillingUnit,
    hint: "\"Per hour\" or \"Per 30 minutes\" -- anything containing \"hour\" is treated as hourly."
  },
  {
    key: "OVERTIME_RATE_PER_30",
    label: "Overtime Rate per 30 min (£)",
    type: "number",
    fallback: String(env.overtimeRatePer30Minutes),
    hint: "Leave blank to use the relevant crew/packing rate above instead."
  },
  { key: "OVERTIME_GRACE_MINS", label: "Overtime Grace (minutes)", type: "number", fallback: String(env.overtimeGraceMinutes) },
  { key: "CONGESTION_CHARGE", label: "Congestion Charge (£)", type: "number", fallback: String(env.congestionCharge) },
  { key: "TUNNEL_CHARGE", label: "Tunnel Charge (£)", type: "number", fallback: String(env.tunnelCharge) },
  {
    key: "JOB_STARTED_MESSAGE_TEXT",
    label: "Customer Message — On My Way",
    type: "textarea",
    fallback: JOB_STARTED_MESSAGE_TEMPLATE,
    hint: "Sent by SMS when the driver starts a job. Placeholders: {customerName} {companyName} {pickup} " +
      "{dropoff} {driverPhone} {vanRegistration}."
  },
  {
    key: "CLIENT_NOTIFICATION_OFFSET_MINUTES",
    label: "Client Notification — Minutes Before Job",
    type: "number",
    fallback: "60",
    hint: "Ported from the classic dashboard's Settings tab for parity -- tmv-pwa doesn't run the scheduled " +
      "client-reminder job this configured, so changing it currently has no effect."
  },
  {
    key: "LIABILITY_DAMAGE_CATEGORIES",
    label: "Liability Damage Categories",
    type: "textarea",
    fallback: JSON.stringify(DAMAGE_CATEGORIES),
    hint: "JSON array used by the driver Liability Report category picker."
  },
  /**
   * Live-overridable integration credentials -- surfaced on the admin API Settings
   * page. Saving one here takes effect immediately (every call site resolves it via
   * getSetting() at request time, see config/live-settings.ts), no redeploy or VPS
   * access needed. The .env.production value on the server stays the fallback: if
   * nothing is ever saved here, behaviour is unchanged from today.
   */
  {
    key: "FIRETEXT_API_KEY",
    label: "Firetext API Key",
    type: "password",
    fallback: env.firetextApiKey,
    hint: "firetext.co.uk API key for the customer \"your move has started\" SMS. Blank disables SMS sending."
  },
  {
    key: "FIRETEXT_SENDER_ID",
    label: "Firetext Sender ID",
    type: "text",
    fallback: env.firetextSenderId,
    hint: "Shown as the text's \"from\". 3-11 alphanumeric characters (e.g. TheManVan), or a full international " +
      "number -- not a UK 07... mobile number, which Firetext rejects."
  },
  {
    key: "GPS_API",
    label: "GPSLive API Key",
    type: "password",
    fallback: env.gpsApiKey,
    hint: "gpslive.app API key for Live Fleet tracking, congestion/tunnel zone detection and the Alerts feed."
  },
  {
    key: "TMV_GPSLIVE_WEBHOOK_TOKEN",
    label: "GPSLive Webhook Token",
    type: "password",
    fallback: env.gpsLiveWebhookToken,
    hint: "The random path segment in the webhook URL registered on GPSLive (Settings > Webhooks): " +
      "/api/webhooks/gpslive/<this value>. Changing it invalidates the URL already configured there -- " +
      "update GPSLive's webhook to match, or zone-crossing pushes stop arriving."
  }
];

export function crewRateKey(crewSize: number): string {
  return `CREW_RATE_${crewSize}_MAN`;
}

export function crewRateLabel(crewSize: number): string {
  return `Crew Rate — ${crewSize} Man (£)`;
}

export function isCustomSettingKey(key: string): boolean {
  const match = CREW_RATE_KEY_RE.exec(key);
  if (!match) return false;
  const crewSize = Number(match[1]);
  return Number.isInteger(crewSize) && crewSize >= 4 && crewSize <= 12;
}

export function customSettingSpec(key: string): SettingFieldSpec | null {
  if (!isCustomSettingKey(key)) return null;
  const crewSize = Number(CREW_RATE_KEY_RE.exec(key)?.[1]);
  return {
    key,
    label: crewRateLabel(crewSize),
    type: "number",
    fallback: String(env.crewRate3Man),
    hint: "Custom crew-size rate. Used when the driver records this crew size during overtime."
  };
}
