import { getSetting } from "../db/settings.repo";
import { DriverProfile, Job } from "../jobs/job.types";
import { JOB_STARTED_MESSAGE_TEMPLATE, REVIEW_REQUEST_EMAIL_TEMPLATE, renderMessageTemplate } from "./message";

export type MessageAudience = "customer" | "driver";
export type MessageChannel = "SMS" | "Email" | "Push";

export interface MessageDef {
  id: string;
  audience: MessageAudience;
  channel: MessageChannel;
  label: string;
  hint: string;
  /** Settings key holding "true"/"false". Missing (never toggled) falls back to
   *  defaultEnabled -- an admin who never opens Messaging keeps today's behaviour. */
  enabledKey: string;
  defaultEnabled: boolean;
  /** Push only: a separate editable title, alongside the body. SMS/Email have no
   *  concept of a title, just the body text. */
  titleKey?: string;
  titleFallback?: string;
  bodyKey: string;
  bodyFallback: string;
  variables: string[];
}

const SHARED_VARIABLES = ["{customerName}", "{companyName}", "{pickup}", "{dropoff}", "{driverPhone}", "{vanRegistration}", "{driver_name}", "{job_date}"];

/**
 * Every message the app sends to a customer or a driver, in one place -- what used to
 * be a handful of hardcoded strings scattered across reminder.service.ts,
 * booking.service.ts, congestion-zone.service.ts and admin/dashboard/jobs.routes.ts,
 * each with no way to turn it off short of a code change. The admin Messaging tab
 * (Customer/Driver) is a straight render of this list: each entry's enabledKey gates
 * whether the send call sites actually fire (see message-catalog.ts's isMessageEnabled,
 * checked at every call site before sending), and bodyKey/titleKey are plain
 * getSetting()-backed text an admin can edit the same way the 3 original templates
 * already worked.
 *
 * Adding a new message type anywhere in the app means adding a row here AND gating
 * that call site with isMessageEnabled -- this list is the source of truth for what
 * the Messaging tab shows, not a description of it.
 */
export const MESSAGE_CATALOG: MessageDef[] = [
  // ---- Customer-facing --------------------------------------------------------
  {
    id: "CUSTOMER_JOB_STARTED_SMS",
    audience: "customer",
    channel: "SMS",
    label: "Job Started — SMS",
    hint: "Sent by SMS the moment the driver taps Start Job. Same wording as the email below (one admin-editable message, both channels).",
    enabledKey: "MSG_ENABLED_CUSTOMER_JOB_STARTED_SMS",
    defaultEnabled: true,
    bodyKey: "JOB_STARTED_MESSAGE_TEXT",
    bodyFallback: JOB_STARTED_MESSAGE_TEMPLATE,
    variables: SHARED_VARIABLES
  },
  {
    id: "CUSTOMER_JOB_STARTED_EMAIL",
    audience: "customer",
    channel: "Email",
    label: "Job Started — Email",
    hint: "Sent by email the moment the driver taps Start Job. Same wording as the SMS above.",
    enabledKey: "MSG_ENABLED_CUSTOMER_JOB_STARTED_EMAIL",
    defaultEnabled: true,
    bodyKey: "JOB_STARTED_MESSAGE_TEXT",
    bodyFallback: JOB_STARTED_MESSAGE_TEMPLATE,
    variables: SHARED_VARIABLES
  },
  {
    id: "CUSTOMER_REVIEW_REQUEST_EMAIL",
    audience: "customer",
    channel: "Email",
    label: "Review Request Email",
    hint: "Sent only if the driver opts in on the \"ask for a review?\" step near the end of the job.",
    enabledKey: "MSG_ENABLED_CUSTOMER_REVIEW_REQUEST_EMAIL",
    defaultEnabled: true,
    bodyKey: "REVIEW_REQUEST_EMAIL_TEXT",
    bodyFallback: REVIEW_REQUEST_EMAIL_TEMPLATE,
    variables: ["{NAME}", ...SHARED_VARIABLES]
  },

  // ---- Driver-facing -----------------------------------------------------------
  {
    id: "DRIVER_JOB_ASSIGNMENT_EMAIL",
    audience: "driver",
    channel: "Email",
    label: "Job Assignment Email",
    hint: "Emails the driver when a job is assigned to them (new booking, manual creation, or reassignment). " +
      "Off by default -- drivers see assigned jobs in the app; this existed briefly as an always-on email until the client asked for it to stop, and is now an opt-in toggle instead of a code change.",
    enabledKey: "MSG_ENABLED_DRIVER_JOB_ASSIGNMENT_EMAIL",
    defaultEnabled: false,
    bodyKey: "DRIVER_JOB_ASSIGNMENT_EMAIL_TEXT",
    bodyFallback:
      "You have a new job assigned.\n\n" +
      "Customer: {customerName}\n" +
      "Pickup: {pickup}\n" +
      "Drop-off: {dropoff}\n" +
      "Booked: {job_date}\n" +
      "Job ID: {jobId}\n",
    variables: ["{customerName}", "{pickup}", "{dropoff}", "{job_date}", "{jobId}"]
  },
  {
    id: "DRIVER_JOB_ASSIGNED_PUSH",
    audience: "driver",
    channel: "Push",
    label: "Job Assigned Push",
    hint: "Pushed when a job is newly assigned to a driver -- a fresh Calendar booking, a manually created job, or a reassignment.",
    enabledKey: "MSG_ENABLED_DRIVER_JOB_ASSIGNED_PUSH",
    defaultEnabled: true,
    titleKey: "DRIVER_JOB_ASSIGNED_PUSH_TITLE",
    titleFallback: "New Job Assigned",
    bodyKey: "DRIVER_JOB_ASSIGNED_PUSH_BODY",
    bodyFallback: "New job for {customerName} — pickup at {pickup}.",
    variables: ["{customerName}", "{pickup}", "{dropoff}", "{job_date}", "{jobId}"]
  },
  {
    id: "DRIVER_JOB_REMINDER_PUSH",
    audience: "driver",
    channel: "Push",
    label: "Job Reminder Push",
    hint: "Pushed shortly before a job's booked start (see the Minutes Before Job setting).",
    enabledKey: "MSG_ENABLED_DRIVER_JOB_REMINDER_PUSH",
    defaultEnabled: true,
    titleKey: "DRIVER_JOB_REMINDER_PUSH_TITLE",
    titleFallback: "Job starting soon",
    bodyKey: "DRIVER_JOB_REMINDER_PUSH_BODY",
    bodyFallback: "{customerName} - pickup at {pickup} in about {leadMinutes} min.",
    variables: ["{customerName}", "{pickup}", "{dropoff}", "{leadMinutes}"]
  },
  {
    id: "DRIVER_CONGESTION_ZONE_PUSH",
    audience: "driver",
    channel: "Push",
    label: "Congestion Zone Push",
    hint: "Pushed when the driver's van enters the Congestion Charge zone during a job (or the job starts with the van already inside it).",
    enabledKey: "MSG_ENABLED_DRIVER_CONGESTION_ZONE_PUSH",
    defaultEnabled: true,
    titleKey: "DRIVER_CONGESTION_ZONE_PUSH_TITLE",
    titleFallback: "Congestion Charge Zone",
    bodyKey: "DRIVER_CONGESTION_ZONE_PUSH_BODY",
    bodyFallback: "Congestion charge may apply -- add it on the Extra Charges step.",
    variables: []
  },
  {
    id: "DRIVER_TUNNEL_ZONE_PUSH",
    audience: "driver",
    channel: "Push",
    label: "Tunnel Zone Push",
    hint: "Pushed when the driver's van enters a tunnel toll zone during a job (or the job starts with the van already inside it).",
    enabledKey: "MSG_ENABLED_DRIVER_TUNNEL_ZONE_PUSH",
    defaultEnabled: true,
    titleKey: "DRIVER_TUNNEL_ZONE_PUSH_TITLE",
    titleFallback: "Tunnel Toll Zone",
    bodyKey: "DRIVER_TUNNEL_ZONE_PUSH_BODY",
    bodyFallback: "Tunnel charge may apply -- add it on the Extra Charges step.",
    variables: []
  }
];

export function findMessageDef(id: string): MessageDef | undefined {
  return MESSAGE_CATALOG.find(m => m.id === id);
}

/** Unknown id fails OPEN (treated as enabled) -- this only ever guards a send that
 *  would otherwise have happened unconditionally, so a typo'd/removed id should never
 *  silently swallow a message. */
export async function isMessageEnabled(id: string): Promise<boolean> {
  const def = findMessageDef(id);
  if (!def) return true;
  const value = await getSetting(def.enabledKey, def.defaultEnabled ? "true" : "false");
  return value !== "false";
}

export async function getMessageBody(
  id: string,
  job?: Job,
  driver?: Pick<DriverProfile, "phone" | "vanRegistration" | "fullName">,
  extra?: Record<string, string>
): Promise<string> {
  const def = findMessageDef(id);
  if (!def) return "";
  const raw = await getSetting(def.bodyKey, def.bodyFallback);
  return job ? renderMessageTemplate(raw, job, driver, extra) : raw;
}

export async function getMessageTitle(
  id: string,
  job?: Job,
  driver?: Pick<DriverProfile, "phone" | "vanRegistration" | "fullName">,
  extra?: Record<string, string>
): Promise<string> {
  const def = findMessageDef(id);
  if (!def?.titleKey) return def?.titleFallback || "";
  const raw = await getSetting(def.titleKey, def.titleFallback || "");
  return job ? renderMessageTemplate(raw, job, driver, extra) : raw;
}
