/**
 * Adapted from TMV-Chat-bot's dashboard/server/routes/jobs.route.ts. Same endpoints,
 * same filter/sort/CSV/PDF logic -- the source was already written with tmv-pwa
 * awareness (its own comments reference "tmv-pwa's own booking.service.ts"), so this
 * is mostly an import-path/data-source swap: getDriverByInitials(Sheets) ->
 * getDriverProfileByInitials(Mongo), jobsCollection/activityCollection raw queries ->
 * tmv-pwa's own jobs.repo.ts/activity.repo.ts functions.
 */
import { Router } from "express";
import { DateTime } from "luxon";
import { env } from "../../config/env";
import { getDriverProfileByInitials, listDriverProfiles } from "../../auth/driver-account.service";
import { createCalendarEvent, deleteCalendarEvent, getCalendarEvent, updateCalendarEvent } from "../../google/calendar";
import { parseCalendarEvent, syncBookingsForDate, withReassignedInitials } from "../../jobs/booking.service";
import { getJob, upsertJob, deleteJob, listJobsPage } from "../../db/jobs.repo";
import { appendActivity, deleteActivityForJob } from "../../db/activity.repo";
import { listEvidenceForJob, listEvidenceForJobs, deleteEvidenceForJob, getEvidence, deleteEvidence } from "../../db/evidence.repo";
import { listScenarioSubmissionsForJob, listScenarioSubmissionsForJobs, deleteScenarioSubmissionsForJob } from "../../db/scenario.repo";
import { deleteExceptionsForJob } from "../../db/exceptions.repo";
import { destroyEvidenceImage, publicIdFromCloudinaryUrl } from "../../storage/cloudinary";
import { JobStatus, Job } from "../../jobs/job.types";
import { WorkflowState } from "../../workflow/workflow.states";
import { log } from "../../utils/logger";
import { statusOf } from "../../utils/retry";
import { formatGBP, toPounds } from "../../utils/money";
import { formatLondonDate } from "./timezone";
import { normalizeMongoDataset } from "./normalize";
import { NormalizedJob } from "./types";
import { generateJobPdf } from "./pdf-generator";
import { getDashboardDataset, invalidateDashboardDataset } from "./dataset-cache";
import { sendPushToDriver } from "../../push/push.service";

function escapeCsvField(val: unknown): string {
  if (val === null || val === undefined) return "";
  let str = String(val);
  if (/^[=+\-@]/.test(str)) str = `'${str}`;
  if (/[",\n\r]/.test(str)) str = `"${str.replace(/"/g, '""')}"`;
  return str;
}

/**
 * Deleting a job used to only remove the `jobs` doc itself -- evidence, scenario
 * submissions, exceptions and activity rows for that jobId (and their Cloudinary
 * photos/signatures) were silently left behind, leaking storage on every delete.
 * Called from DELETE /:jobId after the Calendar event is confirmed gone, before the
 * job doc itself is deleted. Cloudinary deletes are best-effort (destroyEvidenceImage
 * never throws, just logs) so a transient Cloudinary error never blocks the actual
 * job deletion the admin asked for.
 */
async function deleteJobArtifacts(jobId: string, job: Job): Promise<void> {
  const [evidenceRecords, scenarioSubmissions] = await Promise.all([
    listEvidenceForJob(jobId),
    listScenarioSubmissionsForJob(jobId)
  ]);

  const destroyTasks: Promise<void>[] = [];
  for (const record of evidenceRecords) {
    if (record.cloudinaryPublicId) destroyTasks.push(destroyEvidenceImage(record.cloudinaryPublicId));
  }
  const signaturePublicId = publicIdFromCloudinaryUrl(job.signatureUrl);
  if (signaturePublicId) destroyTasks.push(destroyEvidenceImage(signaturePublicId));
  for (const submission of scenarioSubmissions) {
    for (const url of submission.photoUrls) {
      const publicId = publicIdFromCloudinaryUrl(url);
      if (publicId) destroyTasks.push(destroyEvidenceImage(publicId));
    }
    const submissionSignatureId = publicIdFromCloudinaryUrl(submission.signatureUrl);
    if (submissionSignatureId) destroyTasks.push(destroyEvidenceImage(submissionSignatureId));
  }
  await Promise.all(destroyTasks);

  await Promise.all([
    deleteEvidenceForJob(jobId),
    deleteScenarioSubmissionsForJob(jobId),
    deleteExceptionsForJob(jobId),
    deleteActivityForJob(jobId)
  ]);
}

export function dashboardJobsRoutes(): Router {
  const router = Router();

  // Jobs are a live mirror of Calendar, not standalone data -- a row written straight
  // into Mongo would be auto-cancelled by the next sync pass. So this creates a real
  // Calendar event, formatted exactly the way parseCalendarEvent() expects, and lets
  // the normal sync path pick it up. Also mirrors it into Mongo immediately (same
  // upsertJob() the real sync uses) so it appears in this dashboard right away instead
  // of waiting up to env.calendarSyncTtlMs for the background sync to notice.
  router.post("/", async (req, res) => {
    const body = req.body ?? {};
    const customerName = String(body.customerName ?? "").trim();
    const customerEmail = String(body.customerEmail ?? "").trim();
    const customerPhone = String(body.customerPhone ?? "").trim();
    const pickup = String(body.pickup ?? "").trim();
    const dropoff = String(body.dropoff ?? "").trim();
    const crewSize = Number(body.crewSize ?? 0);
    const price = Number(body.price ?? 0);
    const paidOnline = Boolean(body.paidOnline);
    const driverInitials = String(body.driverInitials ?? "").trim().toUpperCase();
    const start = String(body.start ?? "");
    const finish = String(body.finish ?? "");

    if (!customerName || !pickup || !dropoff || !start || !finish) {
      return res.status(400).json({
        error: { code: "VALIDATION_FAILED", message: "Customer name, pickup, drop-off, start and finish time are all required." }
      });
    }
    // The Y/N tag this writes into the Calendar title is the same one
    // parseCalendarEvent() reads to decide whether a booking is confirmed --
    // booking.service.ts now skips syncing anything tagged N, so a job created here
    // with the box unchecked would round-trip to nothing and never appear anywhere.
    // A job added by hand through this form is real, contracted work either way, so
    // require the box rather than silently creating a job that can never sync.
    if (!paidOnline) {
      return res.status(400).json({
        error: { code: "VALIDATION_FAILED", message: "Only confirmed bookings can be added -- check \"Paid online\" before saving." }
      });
    }
    if (!Number.isInteger(crewSize) || crewSize <= 0) {
      return res.status(400).json({ error: { code: "VALIDATION_FAILED", message: "Crew size must be a whole number greater than 0." } });
    }
    if (!Number.isFinite(price) || price <= 0) {
      return res.status(400).json({ error: { code: "VALIDATION_FAILED", message: "Price must be a number greater than 0." } });
    }
    const startDt = DateTime.fromISO(start, { zone: env.timezone });
    const finishDt = DateTime.fromISO(finish, { zone: env.timezone });
    if (!startDt.isValid || !finishDt.isValid || finishDt <= startDt) {
      return res.status(400).json({ error: { code: "VALIDATION_FAILED", message: "Start/finish time is invalid." } });
    }
    if (driverInitials && !/^[A-Z]{1,5}$/.test(driverInitials)) {
      return res.status(400).json({ error: { code: "VALIDATION_FAILED", message: "Driver initials must be 1-5 letters, e.g. JD." } });
    }

    if (driverInitials) {
      const driver = await getDriverProfileByInitials(driverInitials);
      if (!driver) {
        return res.status(400).json({
          error: {
            code: "VALIDATION_FAILED",
            message: `No driver with initials "${driverInitials}" on the roster. Add that driver first, or leave initials blank to leave the job unassigned.`
          }
        });
      }
      if (!driver.active) {
        return res.status(400).json({ error: { code: "VALIDATION_FAILED", message: `Driver "${driverInitials}" exists but is marked inactive.` } });
      }
    }

    // Reproduces the exact title shape parseTitle() parses: "<name> - <n> Men -
    // £<price> / Y-<initials>" (or "/ N" with no dash+initials, read as unassigned).
    const title =
      `${customerName} - ${crewSize} Men - £${price} / ${paidOnline ? "Y" : "N"}` +
      (driverInitials ? `-${driverInitials}` : "");
    const description = [
      `Client name: ${customerName}`,
      `Email: ${customerEmail}`,
      `Phone: ${customerPhone}`,
      `Pickup: ${pickup}`,
      `Drop-off: ${dropoff}`
    ].join("\n");

    // Round-trip through the exact parser production uses, instead of duplicating its
    // regexes here -- the two can never silently drift apart this way.
    const parsed = parseCalendarEvent({
      id: "dashboard-validation-check",
      status: "confirmed",
      summary: title,
      description,
      start: { dateTime: startDt.toISO()! },
      end: { dateTime: finishDt.toISO()! }
    });
    const mismatches: string[] = [];
    if (!parsed) mismatches.push("event");
    else {
      if (parsed.driverInitials !== driverInitials) mismatches.push("driver initials");
      if (parsed.crewSize !== crewSize) mismatches.push("crew size");
      if (parsed.price !== price) mismatches.push("price");
      if (parsed.paidOnline !== paidOnline) mismatches.push("paid online");
      if (parsed.customerName !== customerName) mismatches.push("customer name");
      if (parsed.customerEmail !== customerEmail) mismatches.push("customer email");
      if (parsed.customerPhone !== customerPhone) mismatches.push("customer phone");
      if (parsed.pickup !== pickup) mismatches.push("pickup address");
      if (parsed.dropoff !== dropoff) mismatches.push("drop-off address");
    }
    if (mismatches.length) {
      return res.status(400).json({
        error: {
          code: "VALIDATION_FAILED",
          message:
            `This job wouldn't be read back correctly (${mismatches.join(", ")}). ` +
            "Avoid colons, dashes, slashes or line breaks inside name/address fields — those characters " +
            "are part of the calendar format the sync parses."
        }
      });
    }

    try {
      const event = await createCalendarEvent({
        summary: title,
        description,
        start: { dateTime: startDt.toISO()! },
        end: { dateTime: finishDt.toISO()! }
      });
      // Sync immediately so the new job shows up here without waiting on the throttled
      // background sync.
      await syncBookingsForDate(startDt);

      if (event.id) {
        await mirrorNewJob(event.id, {
          driverInitials, customerName, customerEmail, customerPhone, pickup, dropoff,
          crewSize, price, paidOnline, bookedStart: startDt.toISO()!, bookedFinish: finishDt.toISO()!,
          rawTitle: title, rawDescription: description
        }).catch(err => log.warn("failed to mirror new job into Mongo (background sync will pick it up shortly)", { error: String(err) }));
      }
      invalidateDashboardDataset();

      // Only the reassign endpoint below used to fire this -- a job that had a driver
      // picked right at creation never got a push at all until the driver happened to
      // open the app and see it in their list. Best-effort: never blocks the response,
      // a driver's device being unreachable isn't a job-creation failure.
      if (driverInitials) {
        sendPushToDriver(driverInitials, {
          title: "New Job Assigned",
          body: `New job for ${customerName} — pickup at ${pickup}.`,
          url: "/?tab=jobs"
        }).catch(err => log.warn("failed to send new-job push", { error: String(err), driverInitials }));
      }

      return res.status(200).json({ ok: true });
    } catch (error) {
      log.error("dashboard add job failed", error);
      return res.status(500).json({ error: { code: "JOB_CREATE_FAILED", message: "Failed to create job." } });
    }
  });

  // Reassigns a job's driver.
  router.post("/:jobId/reassign", async (req, res) => {
    const jobId = String(req.params.jobId || "").trim();
    const driverInitials = String(req.body?.driverInitials ?? "").trim().toUpperCase();

    if (!driverInitials) {
      return res.status(400).json({ error: { code: "VALIDATION_FAILED", message: "A driver must be selected." } });
    }
    if (!/^[A-Z]{1,5}$/.test(driverInitials)) {
      return res.status(400).json({ error: { code: "VALIDATION_FAILED", message: "Driver initials must be 1-5 letters." } });
    }

    const driver = await getDriverProfileByInitials(driverInitials);
    if (!driver) {
      return res.status(400).json({ error: { code: "VALIDATION_FAILED", message: `No driver with initials "${driverInitials}" on the roster.` } });
    }
    if (!driver.active) {
      return res.status(400).json({ error: { code: "VALIDATION_FAILED", message: `Driver "${driverInitials}" exists but is marked inactive.` } });
    }

    try {
      const existing = await getJob(jobId);
      if (!existing) {
        return res.status(404).json({ error: { code: "JOB_NOT_FOUND", message: `Job ${jobId} not found.` } });
      }
      if (!existing.calendarEventId) {
        return res.status(409).json({
          error: { code: "NO_CALENDAR_EVENT", message: "This job has no linked Calendar event, so it can't be reassigned." }
        });
      }

      // Jobs are a live mirror of Calendar (see the POST "/" handler above), and the
      // background sync re-parses every event's title every ~2 minutes and treats it
      // as the source of truth for driverInitials -- writing the new driver into Mongo
      // alone would just get silently reverted on the next pass. So Calendar has to be
      // updated *first*: fetch the live title (not the possibly-stale rawTitle already
      // in Mongo), rewrite just its initials segment, and only touch Mongo once that
      // write has actually landed.
      const event = await getCalendarEvent(existing.calendarEventId).catch(() => null);
      const currentTitle = event?.summary || existing.rawTitle;
      const newTitle = currentTitle ? withReassignedInitials(currentTitle, driverInitials) : null;

      if (!newTitle) {
        return res.status(409).json({
          error: {
            code: "CALENDAR_TITLE_UNRECOGNISED",
            message: "Couldn't update the Calendar event -- its title doesn't match the expected format, so the driver initials can't be safely rewritten there."
          }
        });
      }

      try {
        await updateCalendarEvent(existing.calendarEventId, { summary: newTitle });
      } catch (calendarError) {
        log.error("reassign: failed to write driver initials back to Calendar", calendarError, { job_id: jobId });
        const status = statusOf(calendarError);
        const isPermissionError = status === 401 || status === 403;
        // 409, not 502 -- apiFetch (web/src/screens/admin/dashboard/api.ts) treats any
        // 5xx as "our infrastructure is broken" and replaces the body with a generic
        // "having a problem" message before this one ever reaches the admin. Only a 4xx
        // keeps the specific reason, which is the whole point of writing one.
        return res.status(409).json({
          error: {
            code: "CALENDAR_WRITE_FAILED",
            message: isPermissionError
              ? "No permission to change the Calendar event. Please enable Calendar write access for this app and try again."
              : "Failed to update the Calendar event, so the reassignment was not saved. Please try again."
          }
        });
      }

      const fromInitials = existing.driverInitials || "Unassigned";
      existing.driverInitials = driverInitials;
      existing.rawTitle = newTitle;
      existing.updatedAt = new Date().toISOString();
      await upsertJob(existing);

      await appendActivity({
        jobId, driver: "admin dashboard", action: "REASSIGNED",
        detail: `${fromInitials} -> ${driverInitials}`
      });
      invalidateDashboardDataset();

      sendPushToDriver(driverInitials, {
        title: "New Job Assigned",
        body: `Job #${jobId} has been assigned to you.`,
        url: `/?tab=jobs`
      }).catch(err => log.warn("failed to send job assignment push", { error: String(err) }));

      return res.status(200).json({ ok: true, driverInitials, driverName: driver.fullName });
    } catch (error) {
      log.error("dashboard reassign driver failed", error, { job_id: jobId });
      return res.status(500).json({ error: { code: "REASSIGN_FAILED", message: "Failed to reassign driver." } });
    }
  });

  // Permanently deletes a job. Jobs mirror Calendar (see the POST "/" handler above and
  // updateCalendarEvent's own comment) -- deleting only the Mongo doc would leave the
  // Calendar event live, and the next background sync would recreate the job right back
  // from it. So the Calendar event is deleted *first*, and Mongo is only touched once
  // that's confirmed gone (or was already gone).
  router.delete("/:jobId", async (req, res) => {
    const jobId = String(req.params.jobId || "").trim();

    try {
      const existing = await getJob(jobId);
      if (!existing) {
        return res.status(404).json({ error: { code: "JOB_NOT_FOUND", message: `Job ${jobId} not found.` } });
      }

      if (existing.calendarEventId) {
        try {
          await deleteCalendarEvent(existing.calendarEventId);
        } catch (calendarError) {
          log.error("delete job: failed to delete Calendar event", calendarError, { job_id: jobId });
          const status = statusOf(calendarError);
          const isPermissionError = status === 401 || status === 403;
          // 409, not 502 -- see the matching comment on the reassign route above.
          return res.status(409).json({
            error: {
              code: "CALENDAR_WRITE_FAILED",
              message: isPermissionError
                ? "No permission to delete the Calendar event. Please enable Calendar write access for this app and try again."
                : "Failed to delete the Calendar event, so the job was not deleted. Please try again."
            }
          });
        }
      }

      await deleteJobArtifacts(jobId, existing);
      await deleteJob(jobId);
      await appendActivity({
        jobId, driver: "admin dashboard", action: "DELETED",
        detail: `${existing.customerName || "Job"} (${existing.status})`
      });
      invalidateDashboardDataset();

      return res.status(200).json({ ok: true });
    } catch (error) {
      log.error("dashboard delete job failed", error, { job_id: jobId });
      return res.status(500).json({ error: { code: "DELETE_FAILED", message: "Failed to delete job." } });
    }
  });

  // Deletes one evidence photo (or signature-carrying record) -- Cloudinary asset
  // first, then the Mongo row, same order/best-effort behaviour as deleteJobArtifacts.
  // Purely our own storage, no Calendar involvement, so unlike job delete/reassign
  // there's nothing else to coordinate first.
  router.delete("/:jobId/evidence/:evidenceId", async (req, res) => {
    const jobId = String(req.params.jobId || "").trim();
    const evidenceId = String(req.params.evidenceId || "").trim();

    try {
      const record = await getEvidence(evidenceId);
      if (!record || record.jobId !== jobId) {
        return res.status(404).json({ error: { code: "EVIDENCE_NOT_FOUND", message: "Evidence photo not found." } });
      }

      if (record.cloudinaryPublicId) await destroyEvidenceImage(record.cloudinaryPublicId);
      await deleteEvidence(evidenceId);
      invalidateDashboardDataset();

      return res.status(200).json({ ok: true });
    } catch (error) {
      log.error("dashboard delete evidence photo failed", error, { job_id: jobId, evidence_id: evidenceId });
      return res.status(500).json({ error: { code: "DELETE_FAILED", message: "Failed to delete photo." } });
    }
  });

  router.post("/:jobId/review", async (req, res) => {
    const jobId = String(req.params.jobId || "").trim();
    const status = String(req.body?.status ?? "Pending").trim();
    const note = String(req.body?.note ?? "").trim();

    if (!["Pending", "Approved", "Flagged"].includes(status)) {
      return res.status(400).json({
        error: { code: "VALIDATION_FAILED", message: "Review status must be Pending, Approved or Flagged." }
      });
    }
    if (note.length > 2000) {
      return res.status(400).json({
        error: { code: "VALIDATION_FAILED", message: "Manager note must be 2000 characters or fewer." }
      });
    }

    try {
      const existing = await getJob(jobId);
      if (!existing) {
        return res.status(404).json({ error: { code: "JOB_NOT_FOUND", message: `Job ${jobId} not found.` } });
      }

      existing.managerReviewStatus = status as "Pending" | "Approved" | "Flagged";
      existing.managerReviewNote = note;
      existing.managerReviewedAt = new Date().toISOString();
      existing.updatedAt = existing.managerReviewedAt;
      await upsertJob(existing);

      await appendActivity({
        jobId,
        driver: "admin dashboard",
        action: "MANAGER_REVIEW_UPDATED",
        detail: note ? `${status}: ${note}` : status
      });
      // Invalidate before re-reading so this response reflects the review just saved,
      // instead of a cached pre-review snapshot.
      invalidateDashboardDataset();

      const { jobs } = await getDashboardDataset();
      const job = jobs.find(j => j.jobId.toUpperCase() === jobId.toUpperCase());

      return res.status(200).json({
        job,
        review: {
          status: existing.managerReviewStatus,
          note: existing.managerReviewNote,
          reviewedAt: existing.managerReviewedAt
        }
      });
    } catch (error) {
      log.error("dashboard manager review failed", error, { job_id: jobId });
      return res.status(500).json({ error: { code: "REVIEW_SAVE_FAILED", message: "Failed to save manager review." } });
    }
  });

  router.get("/export.csv", async (req, res) => {
    try {
      const { jobs: allJobs } = await getDashboardDataset();
      const jobs = applyFilters(allJobs, req.query);

      const headers = [
        "Job ID", "Calendar Event ID", "Driver", "Customer", "Phone", "Pickup", "Dropoff",
        "Booked Start (London)", "Actual Start (London)", "Actual Finish (London)",
        "Scheduled Minutes", "Actual Minutes", "Delay (Minutes)", "Delay Band", "Status",
        "Base Price (£)", "Extra Charges (£)", "Overtime (£)", "Total Charges (£)", "Amount Charged (£)",
        "Payment Method", "Payment Status", "Evidence Status", "Drive Folder"
      ];

      const rows = jobs.map(j => [
        escapeCsvField(j.jobId),
        escapeCsvField(j.calendarEventId),
        escapeCsvField(j.driverName),
        escapeCsvField(j.customerName),
        escapeCsvField(j.customerPhone || ""),
        escapeCsvField(j.pickup),
        escapeCsvField(j.dropoff),
        escapeCsvField(formatLondonDate(j.bookedStart)),
        escapeCsvField(formatLondonDate(j.actualStart)),
        escapeCsvField(formatLondonDate(j.actualFinish)),
        escapeCsvField(j.bookedMinutes),
        escapeCsvField(j.actualMinutes || ""),
        escapeCsvField(j.delayMinutes),
        escapeCsvField(j.delayBand),
        escapeCsvField(j.status),
        escapeCsvField(toPounds(j.basePrice).toFixed(2)),
        escapeCsvField(toPounds(j.extraCharges).toFixed(2)),
        escapeCsvField(toPounds(j.overtimeCharge).toFixed(2)),
        escapeCsvField(toPounds(j.totalCharges).toFixed(2)),
        escapeCsvField(toPounds(j.amountCharged).toFixed(2)),
        escapeCsvField(j.paymentMethod),
        escapeCsvField(j.paymentStatus),
        escapeCsvField(
          `Arr:${j.evidenceCompleteness.arrival} | Loaded:${j.evidenceCompleteness.vanLoaded} | Empty:${j.evidenceCompleteness.emptyVan} | Org:${j.evidenceCompleteness.organized} | Sig:${j.evidenceCompleteness.signature}`
        ),
        escapeCsvField(j.driveFolderUrl || "")
      ]);

      const csvContent = "﻿" + [headers.join(","), ...rows.map(r => r.join(","))].join("\r\n");

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="TMV-Jobs-${new Date().toISOString().slice(0, 10)}.csv"`);
      return res.status(200).send(csvContent);
    } catch (error) {
      return res.status(500).json({ error: { code: "CSV_EXPORT_FAILED", message: "Failed to generate CSV export." } });
    }
  });

  router.get("/:jobId", async (req, res) => {
    try {
      const jobId = String(req.params.jobId || "").trim();
      const { dataset, jobs } = await getDashboardDataset();
      const job = jobs.find(j => j.jobId.toUpperCase() === jobId.toUpperCase());

      if (!job) return res.status(404).json({ error: { code: "JOB_NOT_FOUND", message: `Job ${jobId} not found.` } });

      return res.status(200).json({ job, meta: { fetchedAt: dataset.fetchedAt } });
    } catch (error) {
      return res.status(500).json({ error: { code: "JOB_FETCH_FAILED", message: "Failed to load job details." } });
    }
  });

  router.get("/:jobId/report.pdf", async (req, res) => {
    try {
      const jobId = String(req.params.jobId || "").trim();
      const { jobs } = await getDashboardDataset();
      const job = jobs.find(j => j.jobId.toUpperCase() === jobId.toUpperCase());

      if (!job) return res.status(404).json({ error: { code: "JOB_NOT_FOUND", message: `Job ${jobId} not found.` } });

      const pdfBuffer = generateJobPdf(job);
      const dateStr = new Date().toISOString().slice(0, 10);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="TMV-Job-${job.jobId}-${dateStr}.pdf"`);
      return res.status(200).send(pdfBuffer);
    } catch (error) {
      return res.status(500).json({ error: { code: "PDF_GENERATION_FAILED", message: "Failed to generate PDF report." } });
    }
  });

  router.get("/", async (req, res) => {
    const { payMethod, payStatus, evidence } = req.query;
    // payMethod/payStatus/evidence need evidence-completeness data, which only exists
    // after normalizing (it's not a raw Job field), so they can't be pushed into the
    // Mongo query itself -- fall back to the old full-dataset path for these. Confirmed
    // unused by any current UI (SearchFilterBar.tsx, the only place that sends them, is
    // dead code, not imported anywhere), so this only affects one-off report generation,
    // not interactive Jobs Archive browsing.
    const usesLegacyFilters = [payMethod, payStatus, evidence].some(v => typeof v === "string" && v && v !== "ALL");

    if (usesLegacyFilters) {
      try {
        const { dataset, jobs: allJobs } = await getDashboardDataset();
        const filtered = applyFilters(allJobs, req.query);
        const sort = typeof req.query.sort === "string" ? req.query.sort : "bookedStart";
        const dir = req.query.dir === "desc" ? "desc" : "asc";
        const jobs = [...filtered].sort((a, b) => {
          let valA: any = (a as any)[sort];
          let valB: any = (b as any)[sort];
          if (valA === undefined || valA === null) valA = "";
          if (valB === undefined || valB === null) valB = "";
          if (typeof valA === "string") return dir === "asc" ? valA.localeCompare(valB) : valB.localeCompare(valA);
          return dir === "asc" ? valA - valB : valB - valA;
        });
        const page = Math.max(1, Number(req.query.page) || 1);
        const pageSize = Math.min(500, Math.max(1, Number(req.query.pageSize) || 25));
        const total = jobs.length;
        const totalPages = Math.ceil(total / pageSize);
        const startIndex = (page - 1) * pageSize;
        const paginatedItems = jobs.slice(startIndex, startIndex + pageSize);
        return res.status(200).json({
          items: paginatedItems,
          pagination: { page, pageSize, total, totalPages, hasMore: page < totalPages },
          meta: { fetchedAt: dataset.fetchedAt, durationMs: dataset.durationMs }
        });
      } catch (error) {
        return res.status(500).json({ error: { code: "JOBS_FETCH_FAILED", message: "Failed to fetch jobs list." } });
      }
    }

    // Fast path: filters/sorts/paginates in the Mongo query itself (listJobsPage),
    // instead of pulling the whole company's job history through the shared dashboard
    // cache on every request just to slice out one page. Evidence/activity/scenario/
    // exception joins are scoped to just this page's job IDs, not every job ever
    // recorded. Measured live: this took under 1s where the old path took 9-11s.
    try {
      const from = typeof req.query.from === "string" ? req.query.from : undefined;
      const to = typeof req.query.to === "string" ? req.query.to : undefined;
      const status = typeof req.query.status === "string" && req.query.status !== "ALL" ? req.query.status : undefined;
      const driverInitials = typeof req.query.driver === "string" && req.query.driver !== "ALL"
        ? req.query.driver.toUpperCase() : undefined;
      const q = typeof req.query.q === "string" ? req.query.q : undefined;
      const sort = typeof req.query.sort === "string" ? req.query.sort : undefined;
      // Earliest-first by default (Finished Jobs and report generation rely on this;
      // JobsPage.tsx sends its own explicit dir regardless).
      const dir = req.query.dir === "desc" ? "desc" : "asc";
      const page = Math.max(1, Number(req.query.page) || 1);
      const pageSize = Math.min(500, Math.max(1, Number(req.query.pageSize) || 25));

      // Search also matches by driver full name (not just initials/jobId/customer/
      // address), same as the old in-memory search -- resolve which initials match
      // the typed text so listJobsPage can fold them into its own $or.
      let qMatchedInitials: string[] | undefined;
      if (q?.trim()) {
        const term = q.trim().toLowerCase();
        const drivers = await listDriverProfiles();
        qMatchedInitials = drivers.filter(d => d.fullName?.toLowerCase().includes(term)).map(d => d.initials).filter(Boolean);
      }

      const { items: pageJobs, total } = await listJobsPage({
        from, to, status, driverInitials, q, qMatchedInitials, sort, dir, page, pageSize
      });

      const jobIds = pageJobs.map(j => j.jobId);
      // activity and exceptions are deliberately NOT fetched here -- confirmed neither
      // is read anywhere in JobsPage.tsx's list/card/table rendering (job.activity only
      // renders in JobDetailDrawer.tsx, which uses the separate GET /:jobId endpoint and
      // its own already-cached full dataset). Skipping them saves ~190-200ms each on
      // this connection -- close to a fixed per-round-trip floor, not proportional to
      // how little data actually comes back (confirmed live: both returned 0 docs for a
      // real page yet still cost ~190ms). normalizeMongoDataset() gets empty arrays for
      // both, which is safe: it only uses them to populate NormalizedJob.activity/
      // .exceptions, nothing else depends on them.
      const [pageEvidence, pageScenarios] = await Promise.all([
        listEvidenceForJobs(jobIds),
        listScenarioSubmissionsForJobs(jobIds)
      ]);

      const normalizedItems = await normalizeMongoDataset({
        jobs: pageJobs,
        evidence: pageEvidence,
        activity: [],
        scenarioSubmissions: pageScenarios,
        exceptions: [],
        fetchedAt: new Date().toISOString(),
        durationMs: 0
      });

      const totalPages = Math.ceil(total / pageSize);
      return res.status(200).json({
        items: normalizedItems,
        pagination: { page, pageSize, total, totalPages, hasMore: page < totalPages },
        meta: { fetchedAt: new Date().toISOString() }
      });
    } catch (error) {
      log.error("jobs list fetch failed", error);
      return res.status(500).json({ error: { code: "JOBS_FETCH_FAILED", message: "Failed to fetch jobs list." } });
    }
  });

  return router;
}

interface NewJobFields {
  driverInitials: string; customerName: string; customerEmail: string; customerPhone: string;
  pickup: string; dropoff: string; crewSize: number; price: number; paidOnline: boolean;
  bookedStart: string; bookedFinish: string; rawTitle: string; rawDescription: string;
}

async function mirrorNewJob(calendarEventId: string, fields: NewJobFields): Promise<void> {
  const now = new Date().toISOString();
  const bookedMinutes = Math.max(0, Math.round(
    (new Date(fields.bookedFinish).getTime() - new Date(fields.bookedStart).getTime()) / 60_000
  ));
  // Same jobId hash tmv-pwa's own sync uses (see jobs/booking.service.ts's
  // jobIdForEvent) -- if this write races the background sync, both agree on the same
  // _id and upsertJob() just overwrites in place rather than creating a duplicate.
  const crypto = await import("node:crypto");
  const jobId = `TMV-${crypto.createHash("sha1").update(calendarEventId).digest("hex").slice(0, 10).toUpperCase()}`;

  await upsertJob({
    jobId, calendarEventId,
    driverInitials: fields.driverInitials, customerName: fields.customerName,
    customerEmail: fields.customerEmail, customerPhone: fields.customerPhone,
    pickup: fields.pickup, dropoff: fields.dropoff, stopBy: "", floorFrom: "", floorTo: "", crewSize: fields.crewSize,
    vanSize: "", hireDurationText: "", extraRequest: "", inventory: "", extraChargeText: "",
    basePrice: fields.price, paidOnline: fields.paidOnline,
    bookedStart: fields.bookedStart, bookedFinish: fields.bookedFinish,
    actualStart: "", actualFinish: "", bookedMinutes, actualMinutes: 0, differenceMinutes: 0,
    delayStatus: "Waiting", extraCharges: [], overtimeMinutes: 0, overtimeCharge: 0,
    calculatedTotalCharges: fields.price, totalCharges: fields.price, amountCharged: 0, totalAdjustmentNote: "", paymentMethod: "",
    paymentStatus: fields.paidOnline ? "Paid Online" : "Pending",
    clientNamePostcode: "", clientConfirmedBy: "", signatureUrl: "",
    driveFolderId: "", driveFolderUrl: "",
    status: JobStatus.READY, currentState: WorkflowState.READY,
    rawTitle: fields.rawTitle, rawDescription: fields.rawDescription,
    createdAt: now, updatedAt: now
  });
}

function applyFilters(jobs: NormalizedJob[], query: Record<string, any>): NormalizedJob[] {
  let list = jobs;
  const { from, to, q, status, driver, payMethod, payStatus, evidence } = query;

  if (typeof from === "string" && from) list = list.filter(j => (j.actualStart || j.bookedStart) >= from);
  if (typeof to === "string" && to) list = list.filter(j => (j.actualStart || j.bookedStart) <= to);
  if (typeof status === "string" && status && status !== "ALL") list = list.filter(j => j.status === status);
  if (typeof driver === "string" && driver && driver !== "ALL") {
    const dLower = driver.toLowerCase();
    list = list.filter(j => j.driverInitials.toLowerCase() === dLower || j.driverName.toLowerCase().includes(dLower));
  }
  if (typeof payMethod === "string" && payMethod && payMethod !== "ALL") {
    list = list.filter(j => j.paymentMethod.toLowerCase().includes(payMethod.toLowerCase()));
  }
  if (typeof payStatus === "string" && payStatus && payStatus !== "ALL") {
    list = list.filter(j => j.paymentStatus.toLowerCase() === payStatus.toLowerCase());
  }
  if (typeof evidence === "string" && evidence && evidence !== "ALL") {
    const eLower = evidence.toLowerCase();
    if (eLower === "complete") {
      list = list.filter(j =>
        j.evidenceCompleteness.arrival === "COMPLETED" && j.evidenceCompleteness.vanLoaded === "COMPLETED" &&
        j.evidenceCompleteness.emptyVan === "COMPLETED" && j.evidenceCompleteness.organized === "COMPLETED" &&
        j.evidenceCompleteness.signature === "COMPLETED"
      );
    } else if (eLower === "missing") {
      list = list.filter(j =>
        j.evidenceCompleteness.arrival === "MISSING" || j.evidenceCompleteness.vanLoaded === "MISSING" ||
        j.evidenceCompleteness.emptyVan === "MISSING" || j.evidenceCompleteness.organized === "MISSING" ||
        j.evidenceCompleteness.signature === "MISSING"
      );
    } else if (eLower === "processing") {
      list = list.filter(j =>
        j.evidenceCompleteness.arrival === "PROCESSING" || j.evidenceCompleteness.vanLoaded === "PROCESSING" ||
        j.evidenceCompleteness.emptyVan === "PROCESSING" || j.evidenceCompleteness.organized === "PROCESSING"
      );
    } else if (eLower === "failed") {
      list = list.filter(j =>
        j.evidenceCompleteness.arrival === "FAILED" || j.evidenceCompleteness.vanLoaded === "FAILED" ||
        j.evidenceCompleteness.emptyVan === "FAILED" || j.evidenceCompleteness.organized === "FAILED"
      );
    }
  }
  if (typeof q === "string" && q.trim()) {
    const term = q.trim().toLowerCase();
    list = list.filter(j =>
      j.jobId.toLowerCase().includes(term) || j.customerName.toLowerCase().includes(term) ||
      (j.customerPhone && j.customerPhone.toLowerCase().includes(term)) ||
      (j.customerEmail && j.customerEmail.toLowerCase().includes(term)) ||
      j.pickup.toLowerCase().includes(term) || j.dropoff.toLowerCase().includes(term) ||
      j.driverName.toLowerCase().includes(term) || j.driverInitials.toLowerCase().includes(term)
    );
  }
  return list;
}
