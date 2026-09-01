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
import { getDriverProfileByInitials } from "../../auth/driver-account.service";
import { createCalendarEvent } from "../../google/calendar";
import { parseCalendarEvent, syncBookingsForDate } from "../../jobs/booking.service";
import { getJob, upsertJob } from "../../db/jobs.repo";
import { appendActivity } from "../../db/activity.repo";
import { JobStatus } from "../../jobs/job.types";
import { WorkflowState } from "../../workflow/workflow.states";
import { log } from "../../utils/logger";
import { formatGBP, toPounds } from "../../utils/money";
import { normalizeMongoDataset } from "./normalize";
import { formatLondonDate } from "./timezone";
import { NormalizedJob } from "./types";
import { generateJobPdf } from "./pdf-generator";
import { readMongoDataset } from "./read";
import { sendPushToDriver } from "../../push/push.service";

function escapeCsvField(val: unknown): string {
  if (val === null || val === undefined) return "";
  let str = String(val);
  if (/^[=+\-@]/.test(str)) str = `'${str}`;
  if (/[",\n\r]/.test(str)) str = `"${str.replace(/"/g, '""')}"`;
  return str;
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
          crewSize, price, paidOnline, bookedStart: startDt.toISO()!, bookedFinish: finishDt.toISO()!
        }).catch(err => log.warn("failed to mirror new job into Mongo (background sync will pick it up shortly)", { error: String(err) }));
      }

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
      const fromInitials = existing.driverInitials || "Unassigned";
      existing.driverInitials = driverInitials;
      existing.updatedAt = new Date().toISOString();
      await upsertJob(existing);

      await appendActivity({
        jobId, driver: "admin dashboard", action: "REASSIGNED",
        detail: `${fromInitials} -> ${driverInitials}`
      });

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

  router.get("/export.csv", async (req, res) => {
    try {
      const dataset = await readMongoDataset();
      let jobs = await normalizeMongoDataset(dataset);
      jobs = applyFilters(jobs, req.query);

      const headers = [
        "Job ID", "Calendar Event ID", "Driver", "Customer", "Phone", "Pickup", "Dropoff",
        "Booked Start (London)", "Actual Start (London)", "Actual Finish (London)",
        "Scheduled Minutes", "Actual Minutes", "Delay (Minutes)", "Delay Band", "Status",
        "Base Price (£)", "Extra Charges (£)", "Overtime (£)", "Total (£)",
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
      const dataset = await readMongoDataset();
      const jobs = await normalizeMongoDataset(dataset);
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
      const dataset = await readMongoDataset();
      const jobs = await normalizeMongoDataset(dataset);
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
    try {
      const dataset = await readMongoDataset();
      let jobs = await normalizeMongoDataset(dataset);
      jobs = applyFilters(jobs, req.query);

      const sort = typeof req.query.sort === "string" ? req.query.sort : "bookedStart";
      const dir = req.query.dir === "asc" ? "asc" : "desc";

      jobs.sort((a, b) => {
        let valA: any = (a as any)[sort];
        let valB: any = (b as any)[sort];
        if (valA === undefined || valA === null) valA = "";
        if (valB === undefined || valB === null) valB = "";
        if (typeof valA === "string") return dir === "asc" ? valA.localeCompare(valB) : valB.localeCompare(valA);
        return dir === "asc" ? valA - valB : valB - valA;
      });

      const page = Math.max(1, Number(req.query.page) || 1);
      const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 25));
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
  });

  return router;
}

interface NewJobFields {
  driverInitials: string; customerName: string; customerEmail: string; customerPhone: string;
  pickup: string; dropoff: string; crewSize: number; price: number; paidOnline: boolean;
  bookedStart: string; bookedFinish: string;
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
    pickup: fields.pickup, dropoff: fields.dropoff, crewSize: fields.crewSize,
    basePrice: fields.price, paidOnline: fields.paidOnline,
    bookedStart: fields.bookedStart, bookedFinish: fields.bookedFinish,
    actualStart: "", actualFinish: "", bookedMinutes, actualMinutes: 0, differenceMinutes: 0,
    delayStatus: "Waiting", extraCharges: [], overtimeMinutes: 0, overtimeCharge: 0,
    totalCharges: fields.price, paymentMethod: "",
    paymentStatus: fields.paidOnline ? "Paid Online" : "Pending",
    clientNamePostcode: "", clientConfirmedBy: "", signatureUrl: "",
    driveFolderId: "", driveFolderUrl: "",
    status: JobStatus.READY, currentState: WorkflowState.READY,
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
