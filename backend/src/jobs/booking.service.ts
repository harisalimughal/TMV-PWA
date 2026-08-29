import crypto from "node:crypto";
import { calendar_v3 } from "googleapis";
import { DateTime } from "luxon";
import { env } from "../config/env";
import { listCalendarEvents } from "../google/calendar";
import { listJobs, upsertJob } from "../db/jobs.repo";
import { recordException } from "../db/exceptions.repo";
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

function field(description: string, labels: string[]): string {
  const lines = htmlToText(description).split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  for (const label of labels) {
    const regex = new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*[:=-]\\s*(.+)$`, "i");
    const found = lines.find(line => regex.test(line));
    if (found) return found.match(regex)?.[1]?.trim() || "";
  }
  return "";
}

function parseTitle(title: string): { crewSize: number; price: number; paidOnline: boolean; driverInitials: string } {
  const crew = Number(title.match(/(\d+)\s*(?:men|man|people|person)/i)?.[1] ?? 0);
  const price = Number(title.match(/(?:£\s*(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s*£)/)?.slice(1).find(Boolean) ?? 0);
  const paidFlag = title.match(/\/\s*([YN])(?:\s*-|\b)/i)?.[1]?.toUpperCase() ?? "N";
  const driverInitials = title.match(/\/\s*[YN]\s*-\s*([A-Z]{1,5})\b/i)?.[1]?.toUpperCase() ?? "";
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

  const customerName = field(description, ["Client name", "Customer", "Name"]);
  const customerEmail = field(description, ["Email", "Email address", "Client email"]);
  const customerPhone = field(description, ["Phone", "Phone number", "Telephone", "Mobile"]);
  const pickup = field(description, ["Pickup", "Pickup address", "From"]);
  const dropoff = field(description, ["Drop-off", "Dropoff", "Drop off", "Drop-off address", "To"]);

  return {
    calendarEventId: event.id,
    driverInitials: parsedTitle.driverInitials,
    customerName,
    customerEmail,
    customerPhone,
    pickup,
    dropoff,
    crewSize: parsedTitle.crewSize,
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

  return {
    jobId: jobIdForEvent(parsed.calendarEventId),
    calendarEventId: parsed.calendarEventId,
    driverInitials: parsed.driverInitials,
    customerName: parsed.customerName,
    customerEmail: parsed.customerEmail,
    customerPhone: parsed.customerPhone,
    pickup: parsed.pickup,
    dropoff: parsed.dropoff,
    crewSize,
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
    totalCharges: existing?.totalCharges ?? basePrice,
    paymentMethod: existing?.paymentMethod ?? "",
    paymentStatus: existing?.paymentStatus ?? (paidOnline ? "Paid Online" : "Pending"),
    clientNamePostcode: existing?.clientNamePostcode ?? "",
    clientConfirmedBy: existing?.clientConfirmedBy ?? "",
    signatureUrl: existing?.signatureUrl ?? "",
    driveFolderId: "",
    driveFolderUrl: "",
    status: existing?.status ?? JobStatus.READY,
    currentState: existing?.currentState ?? WorkflowState.READY,
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
    "crewSize", "basePrice", "paidOnline", "bookedStart", "bookedFinish", "bookedMinutes", "status"
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

  return synced;
}

async function reconcileDisappeared(existing: Job, reason: string): Promise<Job | null> {
  if (existing.actualStart) {
    log.error("started job disappeared from Calendar; needs a human decision", {
      job_id: existing.jobId, reason, status: existing.status
    });
    // Surfaced on the admin dashboard's Exceptions page (TMV-Chat-bot reads this same
    // Mongo collection) -- previously only logged, invisible to ops unless someone
    // happened to grep the container logs.
    await recordException({
      jobId: existing.jobId,
      type: "STARTED_JOB_BOOKING_DISAPPEARED",
      detail: `${reason}. The job is ${existing.status} and was not auto-cancelled. Needs a human decision.`,
      timestamp: new Date().toISOString()
    }).catch(err => log.warn("failed to record exception", { job_id: existing.jobId, error: String(err) }));
    return null;
  }

  log.info("cancelling booking", { job_id: existing.jobId, reason });
  return { ...existing, status: JobStatus.CANCELLED, currentState: "CANCELLED", updatedAt: new Date().toISOString() };
}

/**
 * Syncs yesterday through the day after tomorrow.
 *
 * A today-only window meant an edit to tomorrow's booking never landed until the
 * morning, and a job moved to a different day left a stale row on the original date
 * that nothing ever revisited.
 */
export async function syncTodayBookings(): Promise<Job[]> {
  const today = DateTime.now().setZone(env.timezone);
  const days = [today.minus({ days: 1 }), today, today.plus({ days: 1 }), today.plus({ days: 2 })];
  const results: Job[] = [];
  for (const day of days) {
    // Sequential: each pass reads and writes jobs for that date, so overlapping them
    // would race on the same documents.
    results.push(...(await syncBookingsForDate(day)));
  }
  return results;
}
