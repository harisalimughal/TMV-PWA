import { env } from "../config/env";
import { JOB_COMPLETION_EMAIL_TEMPLATE, JOB_STARTED_MESSAGE_TEMPLATE, REVIEW_REQUEST_EMAIL_TEMPLATE } from "../notifications/message";
import { DEFAULT_CUSTOMER_CONFIRMATION_TEXT } from "../workflow/workflow.engine";

export interface SettingFieldSpec {
  key: string;
  label: string;
  type: "text" | "textarea" | "number";
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
  {
    key: "JOB_STARTED_MESSAGE_TEXT",
    label: "Customer Message — On My Way",
    type: "textarea",
    fallback: JOB_STARTED_MESSAGE_TEMPLATE,
    hint: "Ported from the classic dashboard's Settings tab for parity -- not currently sent by tmv-pwa's own " +
      "workflow (no \"On my way\" step exists there yet). Placeholders: {customerName} {companyName} {pickup} " +
      "{dropoff} {driverPhone} {vanRegistration}."
  },
  {
    key: "CLIENT_NOTIFICATION_OFFSET_MINUTES",
    label: "Client Notification — Minutes Before Job",
    type: "number",
    fallback: "60",
    hint: "Ported from the classic dashboard's Settings tab for parity -- tmv-pwa doesn't run the scheduled " +
      "client-reminder job this configured, so changing it currently has no effect."
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
