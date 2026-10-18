import { Router, type Request } from "express";
import { DateTime } from "luxon";
import { listJobs, getJob } from "../db/jobs.repo";
import { listActivityForJob } from "../db/activity.repo";
import { listDriverProfiles } from "../auth/driver-account.service";
import { bookingFromJob, londonDate, resourceAvailability, scheduleItem } from "./legacy";
import { BookingError, allEnquiries, createEnquiry, getEnquiry, updateEnquiry } from "./enquiries.repo";
import { displayStatus, ENQUIRY_CATEGORIES, enquiryInCategory, type EnquiryCategory } from "./states";
import type { Booking, CommandCentreSummary, Enquiry } from "./types";

const unsupported = () => new BookingError(409, "operation_unavailable", "This Booking OS operation is not connected. Manage existing jobs from Jobs; no booking or Calendar data was changed.");
const text = (req: Request, key: string) => typeof req.query[key] === "string" ? req.query[key] as string : "";
export function page<T>(items: T[], req: Request) {
  const pageSize = Math.max(1, Math.min(100, Math.trunc(Number(req.query.pageSize) || 25)));
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const current = Math.max(1, Math.min(totalPages, Math.trunc(Number(req.query.page) || 1)));
  return { items: items.slice((current - 1) * pageSize, current * pageSize), pagination: { page: current, pageSize, total: items.length, totalPages, hasMore: current < totalPages } };
}
const windowOf = (req: Request) => {
  const from = text(req, "from"), to = text(req, "to");
  if (!DateTime.fromISO(from).isValid || !DateTime.fromISO(to).isValid || Date.parse(from) >= Date.parse(to)) throw new BookingError(422, "validation_failed", "Choose a valid date range.");
  return { from: new Date(from).toISOString(), to: new Date(to).toISOString() };
};
const bookingsAndDrivers = async () => {
  const [jobs, drivers] = await Promise.all([listJobs(), listDriverProfiles()]);
  return { bookings: jobs.map(j => bookingFromJob(j, drivers)), drivers };
};

export function bookingSummary(bookings: Booking[], enquiries: Enquiry[], from: string, to: string): CommandCentreSummary {
  const inRange = (iso: string) => iso >= from && iso < to;
  const current = bookings.filter(b => inRange(b.start));
  const newEnquiries = enquiries.filter(e => inRange(e.submittedAt));
  const today = DateTime.now().setZone("Europe/London").toISODate();
  const unknown = (unavailableReason: string) => ({ value: null, unavailableReason });
  return { from, to, generatedAt: new Date().toISOString(), sample: false,
    newEnquiries: { value: newEnquiries.length }, confirmedBookings: unknown("Legacy jobs do not record when a booking was confirmed. Existing scheduled jobs are available in All Bookings."),
    todaysJobs: { value: bookings.filter(b => londonDate(b.start) === today && b.status !== "cancelled").length },
    unassignedBookings: { value: current.filter(b => b.status === "confirmed" && !b.assignment).length },
    bookingRevenuePence: unknown("Legacy jobs do not contain approved Booking OS quotations. Charges and receipts remain available in Jobs and driver reports."),
    driverUtilizationPct: unknown("Driver shifts and leave are not recorded."),
    conversion: { enquiries: { value: newEnquiries.length }, confirmed: unknown("Legacy jobs have no enquiry attribution.") },
    trend: null, workload: null,
    attention: [
      ...current.filter(b => b.status === "confirmed" && !b.assignment).map(b => ({ id: `unassigned:${b.id}`, kind: "awaiting_assignment" as const, title: "Job has no assigned driver", detail: b.customer.name, targetId: b.id, target: "booking" as const, action: "open_job" as const, at: b.start })),
      ...enquiries.filter(e => e.status === "new").map(e => ({ id: `enquiry:${e.id}`, kind: "unreviewed_enquiry" as const, title: "New enquiry", detail: e.customer.name, targetId: e.id, target: "enquiry" as const, action: "review" as const, at: e.submittedAt }))
    ] };
}

export function dashboardBookingRoutes(): Router {
  const router = Router();
  router.get("/bookings/summary", async (req, res, next) => {
    try { const { from, to } = windowOf(req); const [{ bookings }, enquiries] = await Promise.all([bookingsAndDrivers(), allEnquiries()]); res.json(bookingSummary(bookings, enquiries, from, to)); } catch (e) { next(e); }
  });
  router.get("/bookings", async (req, res, next) => {
    try {
      let { bookings } = await bookingsAndDrivers();
      const q = text(req, "q").toLowerCase();
      bookings = bookings.filter(b => (!q || [b.id, b.customer.name, b.customer.email, b.customer.phone, b.pickup.line, b.dropoff.line, b.assignment?.driverName, b.assignment?.driverInitials].some(v => v?.toLowerCase().includes(q))) &&
        (!req.query.status || displayStatus(b) === req.query.status) && (!req.query.driver || b.assignment?.driverInitials === req.query.driver) &&
        (!req.query.van || b.assignment?.vehicle?.registration === req.query.van) && (!req.query.source || b.source === req.query.source) &&
        (!req.query.assignment || (req.query.assignment === "assigned" ? !!b.assignment : b.status === "confirmed" && !b.assignment)) &&
        (!req.query.from || londonDate(b.start) >= text(req, "from")) && (!req.query.to || londonDate(b.start) <= text(req, "to")) &&
        (!req.query.submittedFrom || b.createdAt >= text(req, "submittedFrom")) && (!req.query.submittedTo || b.createdAt <= text(req, "submittedTo")));
      const sort = text(req, "sort"), direction = req.query.dir === "desc" ? -1 : 1;
      bookings.sort((a, b) => direction * (String(sort === "createdAt" ? a.createdAt : sort === "customer" ? a.customer.name : a.start).localeCompare(String(sort === "createdAt" ? b.createdAt : sort === "customer" ? b.customer.name : b.start)) || a.id.localeCompare(b.id)));
      res.json(page(bookings, req));
    } catch (e) { next(e); }
  });
  router.get("/bookings/:id/activity", async (req, res, next) => {
    try {
      const id = String(req.params.id);
      if (!await getJob(id)) throw new BookingError(404, "not_found", "That booking does not exist.");
      const rows = await listActivityForJob(id);
      res.json({ items: rows.map((r, i) => ({ id: `${id}:${i}:${r.timestamp}`, at: r.timestamp, actor: "system", actorName: r.driver || "System", type: r.action, text: [r.action, r.detail].filter(Boolean).join(": ") })) });
    } catch (e) { next(e); }
  });
  router.get("/bookings/:id", async (req, res, next) => {
    try { const [job, drivers] = await Promise.all([getJob(String(req.params.id)), listDriverProfiles()]); if (!job) throw new BookingError(404, "not_found", "That booking does not exist."); res.json(bookingFromJob(job, drivers)); } catch (e) { next(e); }
  });
  router.get("/schedule", async (req, res, next) => {
    try {
      const { from, to } = windowOf(req), { bookings, drivers } = await bookingsAndDrivers();
      const visible = bookings.filter(b => b.start < to && b.end > from && b.status !== "cancelled");
      const conflicts = visible.flatMap((b, i) => visible.slice(i + 1).flatMap(other => {
        if (b.start >= other.end || b.end <= other.start) return [];
        const driver = b.assignment && b.assignment.driverInitials === other.assignment?.driverInitials;
        const van = b.assignment?.vehicle && b.assignment.vehicle.registration === other.assignment?.vehicle?.registration;
        return driver || van ? [{ bookingId: b.id, kind: driver ? "driver_overlap" : "vehicle_overlap", severity: "blocking", message: "Existing jobs overlap.", withBookingId: other.id }] : [];
      }));
      res.json({ from, to, fetchedAt: new Date().toISOString(), items: visible.map(scheduleItem), unavailable: [], resources: resourceAvailability(drivers, bookings, from, to), conflicts });
    } catch (e) { next(e); }
  });
  router.get("/availability/drivers", async (req, res, next) => {
    try { const { from, to } = windowOf(req), { bookings, drivers } = await bookingsAndDrivers(); res.json({ items: resourceAvailability(drivers, bookings, from, to) }); } catch (e) { next(e); }
  });
  router.get("/enquiries/counts", async (_req, res, next) => {
    try { const rows = await allEnquiries(); res.json(Object.fromEntries(ENQUIRY_CATEGORIES.map(c => [c.id, rows.filter(e => enquiryInCategory(e, c.id)).length]))); } catch (e) { next(e); }
  });
  router.get("/enquiries", async (req, res, next) => {
    try {
      const q = text(req, "q").toLowerCase(), category = text(req, "category");
      if (category && !ENQUIRY_CATEGORIES.some(c => c.id === category)) throw new BookingError(422, "validation_failed", "Choose a valid enquiry category.");
      const rows = (await allEnquiries()).filter(e => (!q || [e.reference, e.customer.name, e.customer.phone, e.customer.email, e.pickup.postcode, e.dropoff.postcode].some(s => s?.toLowerCase().includes(q))) &&
        (!category || enquiryInCategory(e, category as EnquiryCategory)) && (!req.query.status || e.status === req.query.status) && (!req.query.source || e.source === req.query.source) &&
        (!req.query.pricing || (e.quotation?.pricingState || "pending") === req.query.pricing) && (!req.query.from || e.submittedAt >= text(req, "from")) && (!req.query.to || e.submittedAt <= text(req, "to")) &&
        (!req.query.movingFrom || (e.movingDate && e.movingDate >= text(req, "movingFrom"))) && (!req.query.movingTo || (e.movingDate && e.movingDate <= text(req, "movingTo"))))
        .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt) || a.id.localeCompare(b.id));
      res.json(page(rows, req));
    } catch (e) { next(e); }
  });
  router.post("/enquiries", async (req, res, next) => { try { res.status(201).json(await createEnquiry(req.body?.draft, req.body?.idempotencyKey)); } catch (e) { next(e); } });
  router.get("/enquiries/:id", async (req, res, next) => { try { res.json(await getEnquiry(String(req.params.id))); } catch (e) { next(e); } });
  router.post(["/enquiries/:id/manual-quote", "/enquiries/:id/close", "/enquiries/:id/request-info"], async (req, res, next) => {
    try { res.json(await updateEnquiry(String(req.params.id), req.body?.version, req.path.split("/").pop()!, req.body || {})); } catch (e) { next(e); }
  });
  router.post("/enquiries/:id/quotations", (_req, _res, next) => next(new BookingError(422, "pricing_unavailable", "Automated quotation pricing is not connected. Record a manual quotation with a reason.")));
  router.all(["/bookings", "/bookings/:id/cancel", "/schedule/moves", "/assignments", "/dispatch/recommendations"], (_req, _res, next) => next(unsupported()));
  // Keep the existing service-account Calendar integration unchanged. These proposed
  // OAuth/config endpoints cannot replace it without a separate integration design.
  router.all(["/integrations/google-calendar", "/integrations/google-calendar/*"], (_req, res) => res.status(501).json({ error: { code: "calendar_setup_unavailable", message: "Calendar sync uses the existing server service account. Booking OS Calendar setup is not connected; current sync settings are unchanged." } }));
  router.use((error: unknown, _req: Request, res: import("express").Response, next: import("express").NextFunction) => {
    if (!(error instanceof BookingError)) { next(error); return; }
    res.status(error.status).json({ error: { code: error.code, message: error.message, ...(error.fields ? { fields: error.fields } : {}) } });
  });
  return router;
}
