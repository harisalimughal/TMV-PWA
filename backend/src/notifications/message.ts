import { DateTime } from "luxon";
import { env } from "../config/env";
import { DriverProfile, Job } from "../jobs/job.types";

/**
 * The "I'm on the way" message, shared verbatim between the email body
 * (google/gmail.ts) and the SMS body (integrations/firetext.ts) -- one admin-editable
 * block of text (see /admin's Settings tab), not two templates that can drift apart.
 * Sent when the driver taps Start Job, after previewing and confirming it themselves
 * (see workflow.engine.ts's SEND_ON_MY_WAY_MESSAGE). This is only the fallback shown
 * until an admin overrides it.
 */
export const JOB_STARTED_MESSAGE_TEMPLATE =
  "I am your driver, I'm on the way. My number is {driverPhone} and van registration number is {vanRegistration}.";

/**
 * The customer review-request email, sent only if the driver opts in on the "Do you
 * want to take a review from the client?" step near the end of the job (see
 * workflow.engine.ts's SEND_REVIEW_EMAIL).
 */
export const REVIEW_REQUEST_EMAIL_TEMPLATE =
  "Hi {NAME},\n\n" +
  "Your driver mentioned how smoothly everything went and asked us to say a big THANK YOU for being so kind and easy to work with! 😊\n\n" +
  "If you have a moment, we’d really appreciate it if you could leave us a quick 5-star ⭐⭐⭐⭐⭐ review. Your review will be featured on The Man Van website and helps our drivers build their reputation and get more work — so it genuinely means a lot to us.\n\n" +
  "Thanks again for choosing The Man Van and for making the move such a pleasure! 🤗\n\n" +
  "Review us here 👉 https://g.page/Themanvan/review?gm";

/**
 * Sent automatically when a job is marked COMPLETED (see workflow.engine.ts's
 * COMPLETE_JOB). Admin-editable via /ops Messaging tab. Falls back to this default
 * until overridden in the Settings sheet.
 */
export const JOB_COMPLETION_EMAIL_TEMPLATE =
  "Hi {customerName}, your move with {companyName} today has been completed. " +
  "Thank you for choosing us — it was a pleasure helping you. " +
  "If you have any questions or concerns about your move, please don't hesitate to get in touch.";

/**
 * Flat placeholder substitution — a plain block of text an admin edits as a whole,
 * not a templating engine with conditionals. Shared by every customer-facing
 * message template in the app, not just the "job started" one.
 *
 * Available placeholders:
 *   {customerName}     — customer's name from the booking
 *   {companyName}      — company name from TMV_NOTIFICATION_FROM_NAME env var
 *   {pickup}           — pickup address
 *   {dropoff}          — drop-off address
 *   {driverPhone}      — driver's phone number
 *   {vanRegistration}  — van registration plate
 *   {driver_name}      — driver's full name
 *   {job_time}         — booked start time formatted as "9:00 AM"
 *   {job_date}         — booked date formatted as "Monday 25 Aug"
 *   {booking_date}     — alias for {job_date}
 */
export function renderMessageTemplate(
  template: string,
  job: Job,
  driver: Pick<DriverProfile, "phone" | "vanRegistration" | "fullName"> | { phone?: string; vanRegistration?: string; fullName?: string } = {}
): string {
  const bookedStartDt = job.bookedStart
    ? DateTime.fromISO(job.bookedStart).setZone(env.timezone)
    : null;
  const jobTime = bookedStartDt?.isValid ? bookedStartDt.toFormat("h:mm a") : "";
  const jobDate = bookedStartDt?.isValid ? bookedStartDt.toFormat("cccc d LLL") : "";

  return template
    .replace(/\{customerName\}/g, job.customerName || "there")
    .replace(/\{NAME\}/g, job.customerName || "there")
    .replace(/\{companyName\}/g, env.notificationFromName)
    .replace(/\{pickup\}/g, job.pickup || "")
    .replace(/\{dropoff\}/g, job.dropoff || "")
    .replace(/\{driverPhone\}/g, driver.phone || "")
    .replace(/\{vanRegistration\}/g, driver.vanRegistration || "")
    .replace(/\{driver_name\}/g, driver.fullName || "")
    .replace(/\{job_time\}/g, jobTime)
    .replace(/\{job_date\}/g, jobDate)
    .replace(/\{booking_date\}/g, jobDate);
}
