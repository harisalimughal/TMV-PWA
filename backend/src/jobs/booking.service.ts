import crypto from "node:crypto";
import { calendar_v3 } from "googleapis";
import { DateTime } from "luxon";
import { env } from "../config/env";
import { listCalendarEvents } from "../google/calendar";
import { listJobs, upsertJob } from "../db/jobs.repo";
import { recordException } from "../db/exceptions.repo";
import { sendPushToAdmins, sendPushToDriver } from "../push/push.service";
import { Job, JobStatus, ParsedCalendarBooking } from "./job.types";
import { WorkflowState } from "../workflow/workflow.states";
import { log } from "../utils/logger";

/**
 * Google Calendar's rich-text description editor (the Bold/Italic/link toolbar) saves
 * line breaks as HTML <br>/<div> tags and auto-linkifies emails into <a> tags instead of
 * plain "\n"-separated text. Normalise back to plain lines before parsing, so a
 * rich-text description parses the same as a plain-text one.
 */
function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

/* ---------------------------------------------------------------------------
 * Field label vocabulary.
 *
 * The booking form that feeds Google Calendar isn't consistent about which label it
 * writes -- a phone number turns up as "Phone Number:", "Phone:", "Call:" or "Mob:";
 * a pickup as "Move From:", "Pick address:", "Collection:" or bare "From:". It also
 * stacks several synonym labels with no value and puts the real value a line or two
 * further down. These lists (most specific first) plus the stacked-label skip in
 * field() cover the variants seen in real events. Add to a list; don't reorder past a
 * more-specific entry.
 * ------------------------------------------------------------------------- */
const NAME_LABELS = ["Client name", "Customer name", "Full name", "Contact name", "Customer", "Client", "Name"];
const EMAIL_LABELS = ["Email address", "Client email address", "Client email", "Customer email", "E-mail", "E mail", "Email"];
const PHONE_LABELS = [
  "Phone number", "Contact number", "Mobile number", "Telephone number", "Contact telephone",
  "Telephone", "Contact", "Phone", "Mobile", "Number", "Mob", "Cell", "Call", "Tel"
];
const PICKUP_LABELS = [
  "Pick up address", "Pickup address", "Pick address", "Collection address", "Move from address",
  "Loading address", "Address from", "Move From", "Pickup", "Pick up", "Collection", "Load from",
  "From address", "Pick", "From"
];
const DROPOFF_LABELS = [
  "Drop-off address", "Drop off address", "Dropoff address", "Delivery address", "Move to address",
  "Unloading address", "Address to", "Move To", "Drop-off", "Drop off", "Dropoff", "Delivery",
  "Deliver to", "Deliver", "Destination", "Unload to", "To address", "Drop", "To"
];
const FLOOR_FROM_LABELS = ["Floor from", "From floor", "Pickup floor", "Floor at pickup", "Floors from"];
const FLOOR_TO_LABELS = ["Floor to", "To floor", "Dropoff floor", "Drop off floor", "Delivery floor", "Floor at dropoff", "Floors to"];
const COMBINED_FLOOR_LABELS = ["Floor from and to", "Floors from and to", "Floor from & to", "Floor", "Floors", "Stairs"];
const HELPERS_LABELS = ["Number of helpers", "Number of men", "No of helpers", "Helpers", "Men", "Crew", "Movers"];
const VAN_SIZE_LABELS = ["Van size", "Vehicle size", "Van type", "Van"];
const HIRE_DURATION_LABELS = ["Duration of van hire", "Hire duration", "Booking duration", "Duration", "Hours booked"];
const EXTRA_REQUEST_LABELS = ["Extra request", "Extra requests", "Additional requests", "Special requests", "Extras", "Notes", "Additional notes"];
const INVENTORY_LABELS = ["Inventory item", "Inventory items", "Inventory list", "Inventory", "Items", "Item list", "Goods"];
const EXTRA_CHARGE_LABELS = ["Any extra charge", "Extra charge", "Extra charges", "Overtime rate", "Additional charge"];

/** Every label the form is known to emit -- including the ones we don't map to a Job
 *  field ("Van Size:", "Inventory item:", ...). Used only to recognise a line as
 *  "a label, not a value" while scanning forward for a stacked value. */
const ALL_LABELS = new Set(
  [
    ...NAME_LABELS, ...EMAIL_LABELS, ...PHONE_LABELS, ...PICKUP_LABELS, ...DROPOFF_LABELS,
    ...FLOOR_FROM_LABELS, ...FLOOR_TO_LABELS, ...COMBINED_FLOOR_LABELS,
    ...HELPERS_LABELS, ...VAN_SIZE_LABELS, ...HIRE_DURATION_LABELS,
    ...EXTRA_REQUEST_LABELS, ...INVENTORY_LABELS, ...EXTRA_CHARGE_LABELS,
    "Move from", "Move to", "From", "To", "Pick", "Drop", "Pick up", "Drop off",
    "Move date", "Date"
  ].map(l => l.toLowerCase())
);

/** A "Label: value" line where the label reads like a word (no leading digit), so a
 *  numbered address line ("119 Queens Road, LONDON: SE15 2EZ") is never mistaken for
 *  one. Group 1 = label text, group 2 = whatever follows the colon/equals. */
const LABEL_LINE = /^([A-Za-z][A-Za-z /&'().+-]{0,28})\s*[:=]\s*(.*)$/;

function field(description: string, labels: string[]): string {
  const lines = htmlToText(description).split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const own = labels.map(l => l.toLowerCase());
  for (const label of labels) {
    const regex = new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*[:=-]\\s*(.*)$`, "i");
    for (let i = 0; i < lines.length; i++) {
      const found = lines[i].match(regex);
      if (!found) continue;
      const inlineValue = (found[1] ?? "").trim();
      if (inlineValue) return inlineValue;
      // No value on the label line. The form stacks synonym labels ("Phone Number:",
      // "Phone:", "Call:", "Mob:") before the value, so walk forward past any further
      // bare recognised-label lines to reach it.
      for (let j = i + 1; j < lines.length && j <= i + 8; j++) {
        const lm = lines[j].match(LABEL_LINE);
        if (!lm) return lines[j]; // plain line -> the value
        const head = lm[1].trim().toLowerCase();
        const val = lm[2].trim();
        if (!val) {
          if (ALL_LABELS.has(head)) continue; // bare recognised label -> keep scanning
          return ""; // "Word:" we don't recognise -> value is absent
        }
        if (own.includes(head)) return val; // "Mob: 07919..." satisfies a phone lookup
        if (ALL_LABELS.has(head)) return ""; // a *different* field's label+value -> ours is missing
        return lines[j]; // some other "X: y" -> take the whole line
      }
      return "";
    }
  }
  return "";
}

/** Split a combined floor value like "From: 02 flight of stairs / To: 01 flight of
 *  stairs" (or "2nd floor / ground floor") into its two halves. */
function splitCombinedFloor(v: string): { from: string; to: string } {
  const labelled = v.match(/from\s*[:=-]?\s*(.*?)\s*(?:\/|,|;|\||\bthen\b)\s*to\s*[:=-]?\s*(.*)$/i);
  if (labelled) return { from: labelled[1].trim(), to: labelled[2].trim() };
  const plain = v.match(/^(.*?)\s*(?:\/|\||;)\s*(.*)$/);
  if (plain) return { from: plain[1].trim(), to: plain[2].trim() };
  return { from: v.trim(), to: "" };
}

function parseTitle(title: string): { crewSize: number; price: number; paidOnline: boolean; driverInitials: string } {
  const crew = Number(title.match(/(\d+)\s*(?:men|man|people|person)/i)?.[1] ?? 0);
  const price = Number(title.match(/(?:£\s*(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s*£)/)?.slice(1).find(Boolean) ?? 0);
  const paidFlag = title.match(/\/\s*([YN])(?:\s*-|\b)/i)?.[1]?.toUpperCase() ?? "N";
  const driverInitials = title.match(/\/\s*[YN]\s*-\s*([A-Z]{1,2})/i)?.[1]?.toUpperCase() ?? "";
  return { crewSize: crew, price, paidOnline: paidFlag === "Y", driverInitials };
}

export function parseCalendarEvent(event: calendar_v3.Schema$Event): ParsedCalendarBooking | null {
  if (!event.id || event.status === "cancelled") return null;
  const title = event.summary ?? "";
  const description = event.description ?? "";
  const parsedTitle = parseTitle(title);
  const bookedStart = event.start?.dateTime || event.start?.date || "";
  const bookedFinish = event.end?.dateTime || event.end?.date || "";
  if (!bookedStart || !bookedFinish) return null;

  // Title carries a "/Y-XX" or "/N-XX" confirmation tag (Y = confirmed, N = tentative
  // -- see parseTitle). An unconfirmed (N) booking, or one with no tag at all, is not
  // synced into a Job: it isn't real work yet and shouldn't appear on a driver's list
  // or the admin dashboard. Once ops flips the tag to Y in Calendar, the next sync
  // pass (background interval, or a driver/admin request triggering syncIfStale)
  // parses this same event again and it lands normally -- nothing else has to happen.
  if (!parsedTitle.paidOnline) return null;

  const customerName = field(description, NAME_LABELS);
  const customerEmail = field(description, EMAIL_LABELS);
  const customerPhone = field(description, PHONE_LABELS);
  const pickup = field(description, PICKUP_LABELS);
  const dropoff = field(description, DROPOFF_LABELS);

  let floorFrom = field(description, FLOOR_FROM_LABELS);
  let floorTo = field(description, FLOOR_TO_LABELS);
  // The form sometimes writes both floors on one line ("Floor From and To: From: 2nd
  // / To: ground") rather than two separate labelled lines.
  if (!floorFrom && !floorTo) {
    const combined = field(description, COMBINED_FLOOR_LABELS);
    if (combined) {
      const split = splitCombinedFloor(combined);
      floorFrom = split.from;
      floorTo = split.to;
    }
  }

  const vanSize = field(description, VAN_SIZE_LABELS);
  const hireDurationText = field(description, HIRE_DURATION_LABELS);
  const extraRequest = field(description, EXTRA_REQUEST_LABELS);
  const inventory = field(description, INVENTORY_LABELS);
  const extraChargeText = field(description, EXTRA_CHARGE_LABELS);

  // Crew size comes from the title ("2 Men ..."); fall back to "Number of helpers:"
  // in the description when the title omits it.
  const helpersRaw = field(description, HELPERS_LABELS);
  const helpersCrew = Number(helpersRaw.match(/(\d+)/)?.[1] ?? 0);
  const crewSize = parsedTitle.crewSize || helpersCrew;

  return {
    calendarEventId: event.id,
    driverInitials: parsedTitle.driverInitials,
    customerName,
    customerEmail,
    customerPhone,
    pickup,
    dropoff,
    floorFrom,
    floorTo,
    crewSize,
    vanSize,
    hireDurationText,
    extraRequest,
    inventory,
    extraChargeText,
    price: parsedTitle.price,
    paidOnline: parsedTitle.paidOnline,
    bookedStart,
    bookedFinish,
    rawTitle: title,
    rawDescription: description
  };
}

function jobIdForEvent(eventId: string): string {
  return `TMV-${crypto.createHash("sha1").update(eventId).digest("hex").slice(0, 10).toUpperCase()}`;
}

function minutesBetween(start: string, finish: string): number {
  const s = DateTime.fromISO(start);
  const f = DateTime.fromISO(finish);
  return Math.max(0, Math.round(f.diff(s, "minutes").minutes));
}

function toJob(parsed: ParsedCalendarBooking, existing?: Job): Job {
  const now = new Date().toISOString();

  /*
   * Commercial terms freeze the moment work begins.
   *
   * basePrice was re-read from the Calendar title on every sync. Ops editing the title
   * while the driver sat on the totals step would silently change the price under them.
   */
  const started = Boolean(existing?.actualStart);
  const basePrice = started ? existing!.basePrice : parsed.price;
  const crewSize = started ? existing!.crewSize : parsed.crewSize;
  const paidOnline = started ? existing!.paidOnline : parsed.paidOnline;
  const bookedStart = started ? existing!.bookedStart : parsed.bookedStart;
  const bookedFinish = started ? existing!.bookedFinish : parsed.bookedFinish;
  const carriedAmountCharged =
    existing?.amountCharged ??
    (existing?.calculatedTotalCharges !== undefined ? existing.totalCharges : 0);
  const carriedTotalCharges =
    existing?.amountCharged === undefined && existing?.calculatedTotalCharges !== undefined
      ? existing.calculatedTotalCharges
      : existing?.totalCharges ?? basePrice;

  return {
    jobId: jobIdForEvent(parsed.calendarEventId),
    calendarEventId: parsed.calendarEventId,
    driverInitials: parsed.driverInitials,
    customerName: parsed.customerName,
    customerEmail: parsed.customerEmail,
    customerPhone: parsed.customerPhone,
    pickup: parsed.pickup,
    dropoff: parsed.dropoff,
    floorFrom: parsed.floorFrom,
    floorTo: parsed.floorTo,
    crewSize,
    vanSize: parsed.vanSize,
    hireDurationText: parsed.hireDurationText,
    extraRequest: parsed.extraRequest,
    inventory: parsed.inventory,
    extraChargeText: parsed.extraChargeText,
    basePrice,
    paidOnline,
    bookedStart,
    bookedFinish,
    actualStart: existing?.actualStart ?? "",
    actualFinish: existing?.actualFinish ?? "",
    bookedMinutes: minutesBetween(bookedStart, bookedFinish),
    actualMinutes: existing?.actualMinutes ?? 0,
    differenceMinutes: existing?.differenceMinutes ?? 0,
    delayStatus: existing?.delayStatus ?? "Waiting",
    extraCharges: existing?.extraCharges ?? [],
    overtimeMinutes: existing?.overtimeMinutes ?? 0,
    overtimeCharge: existing?.overtimeCharge ?? 0,
    calculatedTotalCharges: existing?.calculatedTotalCharges,
    totalCharges: carriedTotalCharges,
    amountCharged: carriedAmountCharged,
    totalAdjustmentNote: existing?.totalAdjustmentNote ?? "",
    paymentMethod: existing?.paymentMethod ?? "",
    paymentStatus: existing?.paymentStatus ?? (paidOnline ? "Paid Online" : "Pending"),
    clientNamePostcode: existing?.clientNamePostcode ?? "",
    clientConfirmedBy: existing?.clientConfirmedBy ?? "",
    // Cleared when the booked start actually moves, so a rescheduled job reminds the
    // driver again for its real new time instead of staying silent forever.
    reminderSentAt: existing?.bookedStart === bookedStart ? existing?.reminderSentAt : undefined,
    signatureUrl: existing?.signatureUrl ?? "",
    driveFolderId: "",
    driveFolderUrl: "",
    status: existing?.status ?? JobStatus.READY,
    currentState: existing?.currentState ?? WorkflowState.READY,
    rawTitle: parsed.rawTitle,
    rawDescription: parsed.rawDescription,
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };
}

/** True when nothing meaningful differs from the stored doc, so the write (and its
 * updatedAt bump) can be skipped. Compares the fields a Calendar-driven resync can
 * actually change; workflow-owned fields (currentState, charges, payment, etc.) are
 * deliberately excluded since toJob() already carries those through unchanged from
 * `existing` and comparing them here would be comparing a value to itself. */
function isUnchanged(next: Job, existing?: Job): boolean {
  if (!existing) return false;
  const keys: Array<keyof Job> = [
    "driverInitials", "customerName", "customerEmail", "customerPhone", "pickup", "dropoff",
    "floorFrom", "floorTo", "vanSize", "hireDurationText", "extraRequest", "inventory", "extraChargeText",
    "crewSize", "basePrice", "paidOnline", "bookedStart", "bookedFinish", "bookedMinutes", "status",
    "rawTitle", "rawDescription"
  ];
  return keys.every(key => String(next[key] ?? "") === String(existing[key] ?? ""));
}

export async function syncBookingsForDate(date = DateTime.now().setZone(env.timezone)): Promise<Job[]> {
  const start = date.startOf("day");
  const end = date.endOf("day");
  const [events, existingJobs] = await Promise.all([
    // showDeleted so cancellations are visible; without it a cancelled booking simply
    // vanished from the result set and stayed READY forever.
    listCalendarEvents(start.toUTC().toISO()!, end.toUTC().toISO()!, { showDeleted: true }),
    listJobs()
  ]);
  const existingByEvent = new Map(existingJobs.map(j => [j.calendarEventId, j]));
  const synced: Job[] = [];
  const writes: Job[] = [];
  const seenEventIds = new Set<string>();
  // Jobs newly assigned to a driver this pass (a brand-new job with a driver already on
  // the title, or an existing one whose driver initials just changed) -- notified once
  // the write batch below actually lands, not signalled anywhere before this.
  const newlyAssigned: Job[] = [];

  for (const event of events) {
    if (event.id) seenEventIds.add(event.id);

    if (event.status === "cancelled") {
      const existing = event.id ? existingByEvent.get(event.id) : undefined;
      if (existing) {
        const reconciled = await reconcileDisappeared(existing, "cancelled in Calendar");
        if (reconciled) writes.push(reconciled);
      }
      continue;
    }

    const parsed = parseCalendarEvent(event);
    if (!parsed) continue;
    const existing = existingByEvent.get(parsed.calendarEventId);
    const job = toJob(parsed, existing);
    synced.push(job);

    if (!isUnchanged(job, existing)) writes.push(job);
    if (job.driverInitials && job.driverInitials !== existing?.driverInitials) {
      newlyAssigned.push(job);
    }
  }

  // A booking that was on this date and is no longer returned has been moved or
  // deleted. Anything not yet started is cancelled; anything started is escalated
  // (logged, not auto-cancelled -- there may be evidence, charges and a payment).
  //
  // "On this date" is checked by properly parsing bookedStart and comparing its
  // calendar day *in env.timezone*, not by string-prefix-matching the raw stored
  // value against a "yyyy-LL-dd" key -- bookedStart is stored verbatim from whatever
  // offset Google Calendar's API happens to return for this calendar (observed: some
  // events come back "+05:00", not this app's own Europe/London), so a bare string
  // like "2026-08-31T01:41:00+05:00" can represent an instant that's actually Aug 30
  // in London. A naive .startsWith(dateKey) check missed that this job WAS still on
  // Calendar for Aug 30 (its real day), instead running it through the Aug 31 pass --
  // where it legitimately isn't present -- and cancelling a live booking that was
  // never actually gone. Bug found live: a real job assigned to a driver got silently
  // cancelled the moment a sync ran.
  for (const existing of existingJobs) {
    if (seenEventIds.has(existing.calendarEventId)) continue;
    const existingDay = DateTime.fromISO(existing.bookedStart, { setZone: true }).setZone(env.timezone);
    if (!existingDay.isValid || !existingDay.hasSame(date, "day")) continue;
    if (existing.status === JobStatus.COMPLETED || existing.status === JobStatus.CANCELLED) continue;
    const reconciled = await reconcileDisappeared(existing, "no longer present in Calendar for this date");
    if (reconciled) writes.push(reconciled);
  }

  await Promise.all(writes.map(upsertJob));

  for (const job of newlyAssigned) {
    sendPushToDriver(job.driverInitials, {
      title: "New Job Assigned",
      body: `New job for ${job.customerName || "a customer"} — pickup at ${job.pickup || "TBC"}.`,
      url: "/?tab=jobs"
    }).catch(err => log.warn("failed to send new-job push", { error: String(err), driverInitials: job.driverInitials, job_id: job.jobId }));
  }

  return synced;
}

async function reconcileDisappeared(existing: Job, reason: string): Promise<Job | null> {
  if (existing.actualStart) {
    log.warn("calendar sync skipped auto-cancel for started job", {
      job_id: existing.jobId, reason, status: existing.status
    });
    // Surfaced on the admin dashboard's Exceptions page (TMV-Chat-bot reads this same
    // Mongo collection) -- previously only logged, invisible to ops unless someone
    // happened to grep the container logs.
    await recordException({
      jobId: existing.jobId,
      type: "STARTED_JOB_BOOKING_DISAPPEARED",
      detail: `${reason}. The job is ${existing.status} and was not auto-cancelled.`,
      timestamp: new Date().toISOString()
    }).catch(err => log.warn("failed to record exception", { job_id: existing.jobId, error: String(err) }));
    sendPushToAdmins({
      title: "Exception: Review Job Booking",
      body: `Job ${existing.jobId} for ${existing.customerName || "a customer"} is no longer present in Calendar and was not auto-cancelled.`,
      url: "/?section=exceptions"
    }).catch(err => log.warn("failed to send exception push", { job_id: existing.jobId, error: String(err) }));
    return null;
  }

  log.info("cancelling booking", { job_id: existing.jobId, reason });
  return { ...existing, status: JobStatus.CANCELLED, currentState: "CANCELLED", updatedAt: new Date().toISOString() };
}

/**
 * Syncs five days back through five days ahead.
 *
 * A today-only window meant an edit to tomorrow's booking never landed until the
 * morning, and a job moved to a different day left a stale row on the original date
 * that nothing ever revisited. The wider window also backfills newer stored fields
 * like rawTitle/rawDescription for recent jobs without a one-off admin sync.
 */
export async function syncTodayBookings(): Promise<Job[]> {
  const today = DateTime.now().setZone(env.timezone);
  const days = Array.from({ length: 11 }, (_, index) => today.plus({ days: index - 5 }));
  const results: Job[] = [];
  for (const day of days) {
    // Sequential: each pass reads and writes jobs for that date, so overlapping them
    // would race on the same documents.
    results.push(...(await syncBookingsForDate(day)));
  }
  return results;
}
