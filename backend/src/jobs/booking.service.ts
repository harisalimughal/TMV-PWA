import crypto from "node:crypto";
import { calendar_v3 } from "googleapis";
import { DateTime } from "luxon";
import { env } from "../config/env";
import { listCalendarEvents } from "../google/calendar";
import { exceptionWrite, commitWrites, jobToBookingRow, jobWrite, listJobs, SheetWrite, getDriverSpace, getSetting } from "../google/sheets";
import { enqueue } from "../queue/queue.service";
// Note: the original also imported createChatMessage (../google/chat) and
// jobAssignmentPushMessage (../chat/cards) here, but never actually called either --
// dead imports carried over from copy-paste in the source file. Dropped since neither
// applies to this project (no Google Chat integration here).
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
   * basePrice was re-read from the Calendar title on every sync, including mid-job.
   * Ops editing the title while the driver sat on the totals step silently changed the
   * price under them, and the audit trail could not show which figure applied.
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
    driveFolderId: existing?.driveFolderId ?? "",
    driveFolderUrl: existing?.driveFolderUrl ?? "",
    status: existing?.status ?? JobStatus.READY,
    currentState: existing?.currentState ?? WorkflowState.READY,
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };
}

/** True when nothing except the "Updated" stamp differs, so the write can be skipped. */
function isUnchanged(next: Job, existing?: Job): boolean {
  if (!existing) return false;
  const a = jobToBookingRow(next);
  const b = jobToBookingRow(existing);
  return Object.keys(a).every(key => key === "Updated" || String(a[key] ?? "") === String(b[key] ?? ""));
}

export async function syncBookingsForDate(date = DateTime.now().setZone(env.timezone)): Promise<Job[]> {
  const start = date.startOf("day");
  const end = date.endOf("day");
  const [events, existingJobs] = await Promise.all([
    // showDeleted so cancellations are visible; without it a cancelled booking simply
    // vanished from the result set and stayed READY in Sheets forever.
    listCalendarEvents(start.toUTC().toISO()!, end.toUTC().toISO()!, { showDeleted: true }),
    listJobs()
  ]);
  const existingByEvent = new Map(existingJobs.map(j => [j.calendarEventId, j]));
  const synced: Job[] = [];
  const writes: SheetWrite[] = [];
  const seenEventIds = new Set<string>();
  const newAssignments: Job[] = [];
  for (const event of events) {
    if (event.id) seenEventIds.add(event.id);

    if (event.status === "cancelled") {
      const existing = event.id ? existingByEvent.get(event.id) : undefined;
      if (existing) writes.push(...reconcileDisappeared(existing, "cancelled in Calendar"));
      continue;
    }

    const parsed = parseCalendarEvent(event);
    if (!parsed) continue;
    const existing = existingByEvent.get(parsed.calendarEventId);
    const job = toJob(parsed, existing);
    synced.push(job);

    if (!isUnchanged(job, existing)) writes.push(jobWrite(job));
  }

  // A booking that was on this date and is no longer returned has been moved or
  // deleted. Anything not yet started is cancelled; anything started is escalated.
  const dateKey = start.toFormat("yyyy-LL-dd");
  for (const existing of existingJobs) {
    if (seenEventIds.has(existing.calendarEventId)) continue;
    if (!existing.bookedStart.startsWith(dateKey)) continue;
    if (existing.status === JobStatus.COMPLETED || existing.status === JobStatus.CANCELLED) continue;
    writes.push(...reconcileDisappeared(existing, "no longer present in Calendar for this date"));
  }

  // One batched write for the whole day instead of one round trip per booking.
  await commitWrites(writes);

  return synced;
}

/**
 * A booking that has left the Calendar.
 *
 * Not started -> cancel it, so it stops appearing in driver results. Already started ->
 * never auto-cancel: work has happened and there may be evidence, charges and a
 * payment. Raise an exception for a human instead.
 */
function reconcileDisappeared(existing: Job, reason: string): SheetWrite[] {
  if (existing.actualStart) {
    log.warn("started job disappeared from Calendar", { job_id: existing.jobId, reason });
    return [
      exceptionWrite({
        jobId: existing.jobId,
        type: "STARTED_JOB_BOOKING_DISAPPEARED",
        detail: `${reason}. The job is ${existing.status} and was not auto-cancelled. Needs a human decision.`
      })
    ];
  }

  log.info("cancelling booking", { job_id: existing.jobId, reason });
  return [
    jobWrite({
      ...existing,
      status: JobStatus.CANCELLED,
      currentState: "CANCELLED",
      updatedAt: new Date().toISOString()
    }),
    exceptionWrite({ jobId: existing.jobId, type: "BOOKING_CANCELLED", detail: reason })
  ];
}

async function scheduleNotification(job: Job): Promise<void> {
  if (!job.customerEmail && !job.customerPhone) return;

  const offsetStr = await getSetting("CLIENT_NOTIFICATION_OFFSET_MINUTES", "60");
  const offsetMinutes = Math.max(0, parseInt(offsetStr, 10) || 60);
  if (offsetMinutes === 0) return;

  const startDt = DateTime.fromISO(job.bookedStart).setZone(env.timezone);
  const delaySeconds = Math.max(
    0,
    Math.round((startDt.toMillis() - Date.now()) / 1000) - offsetMinutes * 60
  );

  // Dedupe ID includes bookedStart and initials so rescheduling or reassigning schedules a fresh task
  const dedupeId = `client-notif-${job.jobId}-${startDt.toMillis()}-${job.driverInitials || "unassigned"}`;
  
  await enqueue(
    { type: "SEND_CLIENT_NOTIFICATION", jobId: job.jobId },
    { delaySeconds, dedupeId }
  );
  
  log.info("client notification scheduled", {
    job_id: job.jobId,
    delay_seconds: delaySeconds,
    offset_minutes: offsetMinutes,
    dedupe_id: dedupeId
  });
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
    // Sequential: each pass reads and writes Bookings, so overlapping them would
    // fight over row indices.
    results.push(...(await syncBookingsForDate(day)));
  }
  return results;
}
