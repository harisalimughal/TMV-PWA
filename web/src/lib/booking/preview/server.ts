/**
 * An in-memory implementation of the Booking OS contract over sample data. It is what Preview mode and the
 * dev/demo mock API run on. It applies the same kinds of rules the real server must (state tables, version
 * checks, overlap checks, idempotency) so the UI is built against realistic behaviour, but it is NOT the backend and
 * has no pricing engine: a price can only be a stored sample figure or a manual figure with a reason.
 */
import { DateTime } from "luxon";
import {
  ASSIGNMENT_TRANSITIONS, BOOKING_TRANSITIONS, canTransition, displayStatus, ENQUIRY_CATEGORIES, ENQUIRY_TRANSITIONS, enquiryInCategory, type EnquiryCategory
} from "../states";
import { LONDON, addMinutes, fromLondon, londonDay, londonDayBounds, minutesBetween, overlapConflicts, overlaps, type Occupied } from "../schedule";
import type {
  ActionId, AssignRequest, AssignResult, Assignment, AttentionItem, Booking, BookingActivity, BookingQuery, CommandCentreSummary, Conflict,
  Enquiry, EnquiryQuery, MoveRequest, MoveResult, Page, Recommendation, ResourceAvailability, ScheduleItem, ScheduleResponse, WriteError
} from "../types";
import type { BookingDraft } from "../validation";
import { scheduleWindow, validateStep } from "../validation";
import { SAMPLE_DRIVERS, createSampleStore, type SampleDriver } from "./sample";
import { createPreviewCalendar } from "./calendar";

export class ContractError extends Error {
  constructor(readonly status: number, readonly detail: WriteError) { super(detail.message); }
}
const fail = (status: number, code: string, message: string, fields?: Record<string, string>) => { throw new ContractError(status, { code, message, fields }); };

const OPEN_BOOKING = (b: Booking) => b.status === "confirmed" || b.status === "pending_payment";

export function createPreviewServer(nowFn: () => Date = () => new Date()) {
  const store = createSampleStore(nowFn());
  const keys = new Map<string, unknown>();
  let nextBooking = 3000, nextEnquiry = 200, nextAssignment = 500;
  const nowIso = () => nowFn().toISOString();

  /* ---------------------------------------------------------------- derived --- */
  const driverOf = (initials: string) => SAMPLE_DRIVERS.find(driver => driver.initials === initials);
  let onBookingChanged: (id: string) => void = () => {};
  const refresh = (booking: Booking): Booking => {
    onBookingChanged(booking.id);
    const open = OPEN_BOOKING(booking);
    const actions: ActionId[] = ["open_job"].filter(() => !!booking.jobId) as ActionId[];
    if (open) actions.push("edit", "reschedule", "cancel");
    if (open && booking.assignment?.status !== "confirmed") actions.push("assign");
    if (open && booking.assignment?.status === "confirmed" && booking.jobStatus !== "IN_PROGRESS") actions.push("reassign");
    if (booking.assignment?.status === "confirmed") actions.push("notify_driver");
    booking.allowedActions = actions;
    return booking;
  };
  const refreshEnquiry = (enquiry: Enquiry): Enquiry => {
    const actions: ActionId[] = [];
    const open = !["accepted", "declined", "expired", "closed"].includes(enquiry.status);
    if (open) actions.push("review", "close");
    if (open && enquiry.quotation?.pricingState !== "calculated") actions.push("calculate_quote");
    if (open && (enquiry.status === "new" || enquiry.status === "needs_info")) actions.push("request_info");
    if (open && enquiry.quotation?.pricingState === "calculated" && enquiry.quotation.versions.length) actions.push("confirm");
    if (open && enquiry.duplicateOf) actions.push("mark_duplicate");
    if (enquiry.bookingId) actions.push("open_job");
    enquiry.allowedActions = actions;
    return enquiry;
  };
  store.bookings.forEach(refresh); store.enquiries.forEach(refreshEnquiry);

  const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
  const bookingById = (id: string) => store.bookings.find(item => item.id === id) ?? fail(404, "not_found", "That booking does not exist.");
  const enquiryById = (id: string) => store.enquiries.find(item => item.id === id) ?? fail(404, "not_found", "That enquiry does not exist.");

  const occupiedList = (): Occupied[] => store.bookings.filter(b => OPEN_BOOKING(b) && b.assignment?.status === "confirmed").flatMap(b => [
    { bookingId: b.id, resourceId: b.assignment!.driverInitials, kind: "driver" as const, start: b.start, end: b.end },
    ...(b.assignment!.vehicle ? [{ bookingId: b.id, resourceId: b.assignment!.vehicle.registration, kind: "vehicle" as const, start: b.start, end: b.end }] : [])
  ]);

  const DAY_ABBR = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const rosterLabel = (days: number[]) => (days.length === 7 ? "every day" : `${DAY_ABBR[days[0] - 1]} to ${DAY_ABBR[days[days.length - 1] - 1]}`);

  /** Availability of one driver for a window, from shift, leave and existing assignments. Unknown shift data is unknown, never available. */
  function availabilityFor(driver: SampleDriver, start: string, end: string, ignoreBooking?: string): { state: ResourceAvailability["state"]; basis: string; conflicts: Conflict[] } {
    const conflicts: Conflict[] = [];
    const startLondon = DateTime.fromISO(start, { zone: "utc" }).setZone(LONDON);
    const date = startLondon.toISODate()!;
    if (driver.leave.includes(date)) return { state: "unavailable", basis: "On leave", conflicts: [{ kind: "driver_unavailable", severity: "blocking", message: `${driver.name} is on leave that day.`, resourceId: driver.initials }] };
    const overlap = overlapConflicts({ bookingId: ignoreBooking ?? "", start, end }, occupiedList(), driver.initials, "driver", null);
    if (overlap.length) return { state: "busy", basis: "Another booking overlaps", conflicts: overlap };
    if (!driver.shift) return { state: "unknown", basis: "No shift data on record", conflicts: [{ kind: "unknown_availability", severity: "warning", message: `No shift data for ${driver.name}: availability is not known.`, resourceId: driver.initials }] };
    const weekday = startLondon.weekday;
    if (!driver.shift.days.includes(weekday)) {
      const dayName = startLondon.toFormat("cccc");
      return { state: "off_shift", basis: `Not rostered on ${dayName}s`, conflicts: [{ kind: "outside_shift", severity: "blocking", message: `${driver.name} is not rostered on ${dayName}s (shift ${driver.shift.start} to ${driver.shift.end}, ${rosterLabel(driver.shift.days)}).`, resourceId: driver.initials }] };
    }
    const shiftStart = fromLondon(date, driver.shift.start)!, shiftEnd = fromLondon(date, driver.shift.end)!;
    if (Date.parse(start) < Date.parse(shiftStart) || Date.parse(end) > Date.parse(shiftEnd)) {
      return { state: "off_shift", basis: `Shift ${driver.shift.start} to ${driver.shift.end}`, conflicts: [{ kind: "outside_shift", severity: "blocking", message: `${driver.name} is outside their approved shift (${driver.shift.start} to ${driver.shift.end}).`, resourceId: driver.initials }] };
    }
    return { state: "available", basis: `Shift ${driver.shift.start} to ${driver.shift.end}`, conflicts };
  }

  function resourceRows(from: string, to: string): ResourceAvailability[] {
    const dayStart = from, dayEnd = to;
    return SAMPLE_DRIVERS.map(driver => {
      const mine = occupiedList().filter(o => o.kind === "driver" && o.resourceId === driver.initials && overlaps(o, { start: dayStart, end: dayEnd })).sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
      const next = occupiedList().filter(o => o.kind === "driver" && o.resourceId === driver.initials && Date.parse(o.start) >= nowFn().getTime()).sort((a, b) => Date.parse(a.start) - Date.parse(b.start))[0];
      const hours = mine.reduce((sum, o) => sum + minutesBetween(o.start, o.end) / 60, 0);
      // Same roster rules as the assignment check, for the first day of the window: a driver who is on leave or not
      // rostered that day is never shown as available.
      const firstDay = DateTime.fromISO(dayStart, { zone: "utc" }).setZone(LONDON);
      const onLeave = driver.leave.includes(firstDay.toISODate()!);
      const notRostered = !!driver.shift && !driver.shift.days.includes(firstDay.weekday);
      const state = !driver.shift ? "unknown" : onLeave ? "unavailable" : notRostered ? "off_shift" : mine.length ? "busy" : "available";
      const stale = driver.locationAgeMinutes === null ? null : driver.locationAgeMinutes;
      return {
        kind: "driver" as const, id: driver.initials, name: driver.name, state, basis: !driver.shift ? "No shift data on record" : onLeave ? "On leave" : notRostered ? `Not rostered on ${firstDay.toFormat("cccc")}s` : `Shift ${driver.shift.start} to ${driver.shift.end}`,
        location: stale === null ? null : { lat: driver.home.lat, lng: driver.home.lng, at: new Date(nowFn().getTime() - stale * 60000).toISOString(), place: driver.home.place },
        nextBookingAt: next?.start ?? null, todayHours: driver.shift ? Math.round(hours * 10) / 10 : null, vehicle: driver.vehicle
      };
    });
  }

  /* ------------------------------------------------------------------ lists --- */
  function paged<T>(all: T[], page = 1, pageSize = 25): Page<T> {
    const total = all.length, totalPages = Math.max(1, Math.ceil(total / pageSize)), safe = Math.min(Math.max(1, page), totalPages);
    return { items: clone(all.slice((safe - 1) * pageSize, safe * pageSize)), pagination: { page: safe, pageSize, total, totalPages, hasMore: safe < totalPages } };
  }
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "");

  function listEnquiries(query: EnquiryQuery = {}): Page<Enquiry> {
    let rows = [...store.enquiries];
    const q = norm(query.q ?? "");
    if (q) rows = rows.filter(e => [e.reference, e.customer.name, e.customer.phone ?? "", e.customer.email ?? "", e.pickup.postcode, e.dropoff.postcode].some(v => norm(v).includes(q)));
    if (query.category) rows = rows.filter(e => enquiryInCategory(e, query.category as EnquiryCategory));
    if (query.status) rows = rows.filter(e => e.status === query.status);
    if (query.pricing) rows = rows.filter(e => (e.quotation?.pricingState ?? "pending") === query.pricing);
    if (query.source) rows = rows.filter(e => e.source === query.source);
    if (query.from) rows = rows.filter(e => e.submittedAt >= query.from!);
    if (query.to) rows = rows.filter(e => e.submittedAt <= query.to!);
    if (query.movingFrom) rows = rows.filter(e => !!e.movingDate && e.movingDate >= query.movingFrom!);
    if (query.movingTo) rows = rows.filter(e => !!e.movingDate && e.movingDate <= query.movingTo!);
    rows.sort((a, b) => Date.parse(b.submittedAt) - Date.parse(a.submittedAt));
    return paged(rows, query.page, query.pageSize);
  }

  function enquiryCounts(): Record<EnquiryCategory, number> {
    return Object.fromEntries(ENQUIRY_CATEGORIES.map(c => [c.id, store.enquiries.filter(e => enquiryInCategory(e, c.id)).length])) as Record<EnquiryCategory, number>;
  }

  function listBookings(query: BookingQuery = {}): Page<Booking> {
    let rows = [...store.bookings];
    const q = norm(query.q ?? "");
    if (q) rows = rows.filter(b => [b.reference, b.customer.name, b.customer.phone ?? "", b.pickup.postcode, b.dropoff.postcode, b.assignment?.driverName ?? "", b.assignment?.driverInitials ?? ""].some(v => norm(v).includes(q)));
    if (query.status) rows = rows.filter(b => displayStatus(b) === query.status);
    if (query.driver) rows = rows.filter(b => b.assignment?.driverInitials === query.driver);
    if (query.van) rows = rows.filter(b => b.assignment?.vehicle?.registration === query.van);
    if (query.assignment === "unassigned") rows = rows.filter(b => OPEN_BOOKING(b) && b.assignment?.status !== "confirmed");
    if (query.assignment === "assigned") rows = rows.filter(b => b.assignment?.status === "confirmed");
    if (query.source) rows = rows.filter(b => b.source === query.source);
    if (query.from) rows = rows.filter(b => londonDay(b.start) >= query.from!);
    if (query.to) rows = rows.filter(b => londonDay(b.start) <= query.to!);
    if (query.submittedFrom) rows = rows.filter(b => b.createdAt >= query.submittedFrom!);
    if (query.submittedTo) rows = rows.filter(b => b.createdAt <= query.submittedTo!);
    const dir = query.dir === "desc" ? -1 : 1;
    const price = (b: Booking) => b.payments.agreedPence;
    const key: Record<string, (a: Booking, b: Booking) => number> = {
      date: (a, b) => a.start.localeCompare(b.start), created: (a, b) => a.createdAt.localeCompare(b.createdAt),
      customer: (a, b) => a.customer.name.localeCompare(b.customer.name), status: (a, b) => displayStatus(a).localeCompare(displayStatus(b)),
      // Unpriced bookings sort last in either direction: unknown is not the cheapest or the dearest.
      price: (a, b) => (price(a) === null ? (price(b) === null ? 0 : 1 / dir) : price(b) === null ? -1 / dir : (price(a)! - price(b)!))
    };
    rows.sort((a, b) => ((key[query.sort ?? "date"] ?? key.date)(a, b) * dir) || a.reference.localeCompare(b.reference));
    return paged(rows, query.page, query.pageSize);
  }

  /* ------------------------------------------------------------------ writes --- */
  const idempotent = <T,>(key: string | undefined, run: () => T): T => {
    if (!key) return run();
    if (keys.has(key)) return clone(keys.get(key) as T);
    const result = run();
    keys.set(key, clone(result));
    return result;
  };
  const log = (bookingId: string, type: string, text: string, actor: BookingActivity["actor"] = "admin", actorName = "You") => {
    (store.activity[bookingId] ??= []).push({ id: `${bookingId}-${(store.activity[bookingId]?.length ?? 0) + 1}`, at: nowIso(), actor, actorName, type, text });
  };
  const checkVersion = (record: { version: number }, version: number) => { if (record.version !== version) fail(409, "version_conflict", "This record changed since you opened it. Reload and try again."); };

  function createEnquiry(draft: BookingDraft, key?: string): Enquiry {
    return idempotent(key, () => {
      const errors = { ...validateStep("customer", draft), ...validateStep("requirements", draft) };
      if (Object.keys(errors).length) fail(422, "invalid", "Some details need fixing.", errors as Record<string, string>);
      const window = scheduleWindow(draft);
      const id = `enq-${++nextEnquiry}`;
      const enquiry: Enquiry = {
        id, reference: `ENQ-${nextEnquiry}`, status: "new", source: "staff", submittedAt: nowIso(),
        customer: { name: draft.customerName.trim(), phone: draft.phone.trim() || null, email: draft.email.trim() || null, customerId: draft.customerId || null },
        pickup: { line: draft.pickupAddress.trim(), postcode: draft.pickupPostcode.trim().toUpperCase() }, dropoff: { line: draft.dropoffAddress.trim(), postcode: draft.dropoffPostcode.trim().toUpperCase() },
        movingDate: draft.date || null, startTime: draft.startTime || null,
        requirements: { propertySize: draft.propertySize || null, vanType: draft.vanType || null, helpers: draft.helpers === "" ? null : Number(draft.helpers), estimatedHours: draft.hours === "" ? null : Number(draft.hours), pickupStairs: draft.pickupStairs || null, dropoffStairs: draft.dropoffStairs || null, inventory: draft.inventory || null, extras: draft.extras, notes: draft.notes || null },
        // There is no pricing engine here: a new enquiry has no price until a person enters one with a reason.
        quotation: { id: `Q-${id}`, pricingState: "unavailable", status: "draft", problem: "The pricing engine is not connected, so no price was calculated.", missingFields: [], versions: [], approvedVersionId: null },
        duplicateOf: null, duplicateReason: null, bookingId: null, history: [{ at: nowIso(), by: "You", text: window ? "Entered by staff" : "Entered by staff (no complete schedule)" }], allowedActions: [], version: 1
      };
      store.enquiries.unshift(refreshEnquiry(enquiry));
      return clone(enquiry);
    });
  }

  function addManualQuote(enquiryId: string, totalPence: number, reason: string, version: number): Enquiry {
    const enquiry = enquiryById(enquiryId);
    checkVersion(enquiry, version);
    if (!reason.trim()) fail(422, "reason_required", "A reason is required for a manual price.", { reason: "Enter the reason for this price." });
    if (!Number.isInteger(totalPence) || totalPence <= 0) fail(422, "invalid", "Enter a price above zero.", { price: "Enter a price above zero." });
    const quotation = enquiry.quotation ?? (enquiry.quotation = { id: `Q-${enquiry.id}`, pricingState: "unavailable", status: "draft", problem: null, missingFields: [], versions: [], approvedVersionId: null });
    const id = `QV-${enquiry.id}-${quotation.versions.length + 1}`;
    quotation.versions.push({ id, version: quotation.versions.length + 1, createdAt: nowIso(), createdBy: "You", ruleVersion: null, source: "manual", lines: [{ label: "Manual price", amountPence: totalPence, kind: "adjustment" }], totalPence, reason: reason.trim() });
    quotation.pricingState = "calculated"; quotation.problem = null; quotation.approvedVersionId = id;
    if (enquiry.status === "new" || enquiry.status === "needs_info") enquiry.status = "quoted";
    enquiry.history.push({ at: nowIso(), by: "You", text: `Manual price recorded: ${reason.trim()}` });
    enquiry.version += 1;
    return clone(refreshEnquiry(enquiry));
  }

  function confirmFromEnquiry(enquiryId: string, version: number, key?: string): Booking {
    return idempotent(key, () => {
      const enquiry = enquiryById(enquiryId);
      if (enquiry.bookingId) return clone(bookingById(enquiry.bookingId));
      checkVersion(enquiry, version);
      const approved = enquiry.quotation?.versions.find(v => v.id === enquiry.quotation?.approvedVersionId);
      if (!approved || approved.totalPence === null) fail(422, "no_price", "Record or calculate a price before confirming.");
      if (!enquiry.movingDate || !enquiry.startTime || !enquiry.requirements.estimatedHours) fail(422, "missing_schedule", "The date, start time and estimated hours are needed to confirm.");
      const start = fromLondon(enquiry.movingDate!, enquiry.startTime!);
      if (!start) fail(422, "invalid", "The start time is not valid.");
      const number = ++nextBooking;
      const booking: Booking = {
        id: `bk-${number}`, reference: `TMV-${number}`, status: "confirmed", source: enquiry.source, enquiryId: enquiry.id, jobId: null, customer: enquiry.customer, pickup: enquiry.pickup, dropoff: enquiry.dropoff, stops: [],
        start: start!, end: addMinutes(start!, Math.round(enquiry.requirements.estimatedHours! * 60)), requirements: enquiry.requirements, quotation: clone(enquiry.quotation), assignment: null, assignmentHistory: [], jobStatus: null,
        createdAt: nowIso(), payments: { agreedPence: approved!.totalPence, collectedPence: null, outstandingPence: null, state: "unknown" }, allowedActions: [], version: 1
      };
      store.bookings.push(refresh(booking));
      enquiry.status = "accepted"; enquiry.bookingId = booking.id; enquiry.version += 1; refreshEnquiry(enquiry);
      enquiry.history.push({ at: nowIso(), by: "You", text: `Confirmed as ${booking.reference}` });
      log(booking.id, "booking_created", "Booking created from enquiry"); log(booking.id, "booking_confirmed", "Booking confirmed");
      return clone(booking);
    });
  }

  function setEnquiryStatus(enquiryId: string, to: Enquiry["status"], version: number, note?: string): Enquiry {
    const enquiry = enquiryById(enquiryId);
    checkVersion(enquiry, version);
    if (!canTransition(ENQUIRY_TRANSITIONS, enquiry.status, to)) fail(409, "invalid_transition", `An enquiry that is ${enquiry.status.replace("_", " ")} cannot become ${to.replace("_", " ")}.`);
    enquiry.status = to; enquiry.version += 1; enquiry.history.push({ at: nowIso(), by: "You", text: note ?? `Marked ${to.replace("_", " ")}` });
    return clone(refreshEnquiry(enquiry));
  }

  function cancelBooking(bookingId: string, version: number, reason: string): Booking {
    const booking = bookingById(bookingId);
    checkVersion(booking, version);
    if (!reason.trim()) fail(422, "reason_required", "A reason is required to cancel.", { reason: "Enter the reason." });
    if (!canTransition(BOOKING_TRANSITIONS, booking.status, "cancelled")) fail(409, "invalid_transition", "This booking can no longer be cancelled.");
    if (booking.jobStatus === "IN_PROGRESS") fail(409, "job_started", "The job has started. Finish or stop it before cancelling.");
    if (booking.assignment?.status === "confirmed") {
      const released: Assignment = { ...booking.assignment, status: "released", releasedAt: nowIso(), reason: `Booking cancelled: ${reason.trim()}` };
      booking.assignmentHistory = booking.assignmentHistory.map(a => (a.id === released.id ? released : a));
      booking.assignment = null;
    }
    booking.status = "cancelled"; booking.version += 1; if (booking.jobId) booking.jobStatus = "CANCELLED";
    log(booking.id, "booking_cancelled", `Booking cancelled: ${reason.trim()}`);
    return clone(refresh(booking));
  }

  /* ------------------------------------------------------- assignment and moves --- */
  function conflictsFor(booking: Booking, start: string, end: string, driverInitials: string | null, vehicle: string | null): Conflict[] {
    const found: Conflict[] = [];
    if (driverInitials) {
      const driver = driverOf(driverInitials);
      if (!driver) return [{ kind: "driver_unavailable", severity: "blocking", message: "That driver is not on the roster.", resourceId: driverInitials }];
      found.push(...availabilityFor(driver, start, end, booking.id).conflicts);
    }
    if (vehicle) found.push(...overlapConflicts({ bookingId: booking.id, start, end }, occupiedList(), vehicle, "vehicle", null));
    const needed = booking.requirements.helpers;
    if (needed !== null && needed > 0) found.push({ kind: "crew_short", severity: "warning", message: `${needed} helper${needed === 1 ? "" : "s"} needed: helpers are not tracked as accounts, confirm the crew separately.` });
    return found;
  }

  function assign(request: AssignRequest, key?: string): AssignResult {
    return idempotent(key, () => {
      const booking = bookingById(request.bookingId);
      checkVersion(booking, request.version);
      if (!OPEN_BOOKING(booking)) fail(409, "invalid_transition", "Only an open booking can be assigned.");
      if (booking.jobStatus === "IN_PROGRESS") fail(409, "job_started", "The job is in progress and cannot be reassigned here.");
      const driver = driverOf(request.driverInitials) ?? fail(422, "invalid", "Choose a driver on the roster.");
      const vehicle = request.vehicleRegistration ?? driver.vehicle.registration;
      const conflicts = conflictsFor(booking, booking.start, booking.end, driver.initials, vehicle);
      if (conflicts.some(c => c.severity === "blocking")) return { ok: false, conflicts };
      if (booking.assignment?.status === "confirmed" && !request.reason?.trim()) fail(422, "reason_required", "A reason is required to reassign.", { reason: "Enter the reason for the change." });
      if (booking.assignment?.status === "confirmed") {
        const released: Assignment = { ...booking.assignment, status: "released", releasedAt: nowIso(), reason: request.reason!.trim() };
        booking.assignmentHistory = booking.assignmentHistory.map(a => (a.id === released.id ? released : a));
      }
      const created: Assignment = { id: `AS-${++nextAssignment}`, status: "confirmed", driverInitials: driver.initials, driverName: driver.name, vehicle: { registration: vehicle, category: driver.vehicle.category }, assignedAt: nowIso(), assignedBy: "You", releasedAt: null, reason: request.reason?.trim() || null };
      if (!canTransition(ASSIGNMENT_TRANSITIONS, "proposed", "confirmed")) fail(500, "internal", "Assignment table is inconsistent.");
      booking.assignment = created; booking.assignmentHistory.push(created); booking.jobStatus = booking.jobStatus ?? "READY"; booking.jobId = booking.jobId ?? `TMV-JOB-${booking.reference.slice(4)}`;
      booking.version += 1;
      log(booking.id, "driver_assigned", `${driver.name} assigned${request.reason ? `: ${request.reason.trim()}` : ""}`);
      log(booking.id, "driver_notified", "Driver notification queued (delivery is not tracked in preview)", "notification", "System");
      return { ok: true, conflicts, booking: clone(refresh(booking)) };
    });
  }

  function move(request: MoveRequest, key?: string): MoveResult {
    const run = () => {
      const booking = bookingById(request.bookingId);
      checkVersion(booking, request.version);
      if (!OPEN_BOOKING(booking)) fail(409, "invalid_transition", "Only an open booking can be moved.");
      if (booking.jobStatus === "IN_PROGRESS") fail(409, "job_started", "The job has started and cannot be moved.");
      if (!(Date.parse(request.end) > Date.parse(request.start))) fail(422, "invalid", "The end must be after the start.");
      const driver = request.driverInitials === undefined ? booking.assignment?.driverInitials ?? null : request.driverInitials;
      const vehicle = booking.assignment?.vehicle?.registration ?? null;
      const conflicts = conflictsFor(booking, request.start, request.end, driver, vehicle);
      if (conflicts.some(c => c.severity === "blocking") || request.dryRun) return { ok: !conflicts.some(c => c.severity === "blocking"), conflicts } as MoveResult;
      booking.start = request.start; booking.end = request.end; booking.version += 1;
      if (request.driverInitials !== undefined && request.driverInitials !== booking.assignment?.driverInitials) {
        const result = assign({ bookingId: booking.id, driverInitials: request.driverInitials ?? "", vehicleRegistration: null, version: booking.version, reason: "Moved on the calendar" });
        return { ok: result.ok, conflicts: result.conflicts, booking: result.booking };
      }
      log(booking.id, "booking_rescheduled", "Booking rescheduled");
      return { ok: true, conflicts, booking: clone(refresh(booking)) };
    };
    return request.dryRun ? run() : idempotent(key, run);
  }

  function recommendations(bookingId: string): Recommendation[] {
    const booking = bookingById(bookingId);
    const rows = SAMPLE_DRIVERS.map(driver => {
      const result = availabilityFor(driver, booking.start, booking.end, booking.id);
      const sameDayHours = occupiedList().filter(o => o.kind === "driver" && o.resourceId === driver.initials && londonDay(o.start) === londonDay(booking.start)).reduce((sum, o) => sum + minutesBetween(o.start, o.end) / 60, 0);
      const vehicleConflicts = overlapConflicts({ bookingId: booking.id, start: booking.start, end: booking.end }, occupiedList(), driver.vehicle.registration, "vehicle", null);
      const hard = [...result.conflicts, ...vehicleConflicts].filter(c => c.severity === "blocking");
      const warnings = [...result.conflicts, ...vehicleConflicts].filter(c => c.severity === "warning").map(c => c.message);
      const reasons: string[] = [];
      if (result.state === "available") reasons.push(`Free for the whole job (${result.basis.toLowerCase()})`);
      if (driver.vehicle.category.toLowerCase().startsWith((booking.requirements.vanType ?? "").split(" ")[0].toLowerCase()) && booking.requirements.vanType) reasons.push(`Vehicle matches the ${booking.requirements.vanType.toLowerCase()} requirement`);
      if (sameDayHours > 0) reasons.push(`${Math.round(sameDayHours * 10) / 10} h already booked that day`); else if (result.state === "available") reasons.push("No other work that day");
      if (driver.locationAgeMinutes !== null && driver.locationAgeMinutes > 120) warnings.push("Last known location is more than 2 hours old");
      return {
        driverInitials: driver.initials, driverName: driver.name, vehicle: driver.vehicle, eligible: hard.length === 0, reasons, warnings, hardViolations: hard,
        travelMinutes: null,                    // no routing data in preview: shown as not available
        workloadHoursToday: driver.shift ? Math.round(sameDayHours * 10) / 10 : null
      } satisfies Recommendation;
    });
    // Eligible first, then fewest warnings, then lightest workload that day. The order is explained by the reasons shown.
    return rows.sort((a, b) => Number(b.eligible) - Number(a.eligible) || a.warnings.length - b.warnings.length || (a.workloadHoursToday ?? 99) - (b.workloadHoursToday ?? 99));
  }

  /* --------------------------------------------------------------- read models --- */
  function schedule(from: string, to: string): ScheduleResponse {
    const items: ScheduleItem[] = store.bookings.filter(b => b.status !== "cancelled" && overlaps(b, { start: from, end: to })).map(b => ({
      bookingId: b.id, reference: b.reference, customerName: b.customer.name, route: `${b.pickup.postcode} to ${b.dropoff.postcode}`, start: b.start, end: b.end, displayStatus: displayStatus(b),
      driverInitials: b.assignment?.status === "confirmed" ? b.assignment.driverInitials : null, vehicleRegistration: b.assignment?.vehicle?.registration ?? null, version: b.version
    }));
    const conflicts: ScheduleResponse["conflicts"] = [];
    for (const b of store.bookings.filter(x => OPEN_BOOKING(x) && x.assignment?.status === "confirmed" && overlaps(x, { start: from, end: to }))) {
      for (const c of conflictsFor(b, b.start, b.end, b.assignment!.driverInitials, b.assignment!.vehicle?.registration ?? null)) if (c.kind !== "crew_short") conflicts.push({ ...c, bookingId: b.id });
    }
    const unavailable = SAMPLE_DRIVERS.flatMap(driver => driver.leave.map(date => { const bounds = londonDayBounds(date); return { resourceId: driver.initials, start: bounds.start, end: bounds.end, reason: "On leave" }; })).filter(u => overlaps(u, { start: from, end: to }));
    return { from, to, fetchedAt: nowIso(), items: clone(items), unavailable, resources: resourceRows(from, to), conflicts };
  }

  function summary(from: string, to: string): CommandCentreSummary {
    const inRange = (iso: string) => iso >= from && iso < to;
    const today = londonDayBounds(londonDay(nowIso()));
    const live = store.bookings.filter(b => b.status === "confirmed" || b.status === "completed");
    const scheduled = live.filter(b => inRange(b.start));
    const priced = scheduled.filter(b => b.payments.agreedPence !== null);
    const revenue = priced.reduce((sum, b) => sum + (b.payments.agreedPence as number), 0);
    const unpriced = scheduled.length - priced.length;
    const driversWithShifts = SAMPLE_DRIVERS.filter(d => d.shift);
    const days = Math.max(1, Math.round(minutesBetween(from, to) / 1440));
    let availableHours = 0;
    for (let i = 0; i < days; i++) {
      const date = DateTime.fromISO(from, { zone: "utc" }).setZone(LONDON).plus({ days: i });
      for (const d of driversWithShifts) if (d.shift!.days.includes(date.weekday) && !d.leave.includes(date.toISODate()!)) availableHours += (Number(d.shift!.end.slice(0, 2)) * 60 + Number(d.shift!.end.slice(3)) - Number(d.shift!.start.slice(0, 2)) * 60 - Number(d.shift!.start.slice(3))) / 60;
    }
    const worked = scheduled.filter(b => b.assignment?.status === "confirmed" && driverOf(b.assignment.driverInitials)?.shift).reduce((sum, b) => sum + minutesBetween(b.start, b.end) / 60, 0);
    const enquiriesIn = store.enquiries.filter(e => inRange(e.submittedAt));
    const attention: AttentionItem[] = [];
    for (const e of store.enquiries.filter(x => x.status === "new")) attention.push({ id: `a-${e.id}`, kind: "unreviewed_enquiry", title: `${e.reference} not reviewed`, detail: `${e.customer.name}, received ${DateTime.fromISO(e.submittedAt).setZone(LONDON).toFormat("d LLL HH:mm")}`, targetId: e.id, target: "enquiry", action: "review", at: e.submittedAt });
    for (const e of store.enquiries.filter(x => x.status === "needs_info")) attention.push({ id: `a-${e.id}`, kind: "missing_information", title: `${e.reference} is missing information`, detail: (e.quotation?.missingFields ?? []).join(", ") || "Details needed", targetId: e.id, target: "enquiry", action: "request_info", at: e.submittedAt });
    for (const e of store.enquiries.filter(x => x.status === "awaiting_customer")) attention.push({ id: `a-${e.id}`, kind: "awaiting_customer", title: `${e.reference} awaiting the customer`, detail: e.customer.name, targetId: e.id, target: "enquiry", action: "review", at: e.submittedAt });
    for (const b of store.bookings.filter(x => OPEN_BOOKING(x) && x.assignment?.status !== "confirmed" && Date.parse(x.start) >= nowFn().getTime() && Date.parse(x.start) < nowFn().getTime() + 72 * 3600000)) attention.push({ id: `a-${b.id}`, kind: "awaiting_assignment", title: `${b.reference} needs a driver`, detail: `${b.customer.name}, ${DateTime.fromISO(b.start).setZone(LONDON).toFormat("ccc d LLL HH:mm")}`, targetId: b.id, target: "booking", action: "assign", at: b.start });
    for (const c of schedule(from, to).conflicts.filter(x => x.severity === "blocking")) { const b = bookingById(c.bookingId); attention.push({ id: `c-${b.id}-${c.kind}`, kind: "conflict", title: `${b.reference} has a conflict`, detail: c.message, targetId: b.id, target: "booking", action: "assign", at: b.start }); }
    const trendDays = Math.min(days, 14);
    const trend = Array.from({ length: trendDays }, (_, i) => {
      const date = DateTime.fromISO(from, { zone: "utc" }).setZone(LONDON).plus({ days: days - trendDays + i }).toISODate()!;
      return { day: date, enquiries: store.enquiries.filter(e => londonDay(e.submittedAt) === date).length, confirmed: store.bookings.filter(b => londonDay(b.createdAt) === date && b.status !== "cancelled").length };
    });
    return {
      from, to, generatedAt: nowIso(), sample: true,
      newEnquiries: { value: store.enquiries.filter(e => e.status === "new").length },
      confirmedBookings: { value: scheduled.length },
      todaysJobs: { value: store.bookings.filter(b => b.status !== "cancelled" && overlaps(b, today)).length },
      unassignedBookings: { value: store.bookings.filter(b => OPEN_BOOKING(b) && b.assignment?.status !== "confirmed" && Date.parse(b.end) >= nowFn().getTime()).length },
      bookingRevenuePence: priced.length === 0 ? { value: null, unavailableReason: scheduled.length ? "No booking in this period has a recorded price." : "No bookings in this period." } : { value: revenue, knownOnly: unpriced > 0, unpricedBookings: unpriced },
      driverUtilizationPct: driversWithShifts.length && availableHours > 0 ? { value: Math.round((worked / availableHours) * 100) } : { value: null, unavailableReason: "No shift data is on record." },
      conversion: { enquiries: { value: enquiriesIn.length }, confirmed: { value: enquiriesIn.filter(e => e.bookingId).length } },
      trend,
      workload: SAMPLE_DRIVERS.map(d => ({ driverInitials: d.initials, driverName: d.name, hours: d.shift ? Math.round(scheduled.filter(b => b.assignment?.status === "confirmed" && b.assignment.driverInitials === d.initials).reduce((s, b) => s + minutesBetween(b.start, b.end) / 60, 0) * 10) / 10 : null })),
      attention: attention.sort((a, b) => a.at.localeCompare(b.at)).slice(0, 12)
    };
  }

  const calendar = createPreviewCalendar({ bookings: () => store.bookings, now: nowFn });
  onBookingChanged = calendar.queue;

  return {
    listEnquiries, enquiryCounts, getEnquiry: (id: string) => clone(enquiryById(id)), listBookings, getBooking: (id: string) => clone(bookingById(id)),
    activity: (id: string) => clone(store.activity[bookingById(id).id] ?? []), createEnquiry, addManualQuote, confirmFromEnquiry,
    closeEnquiry: (id: string, version: number) => setEnquiryStatus(id, "closed", version, "Closed"), requestInfo: (id: string, version: number, note: string) => setEnquiryStatus(id, "needs_info", version, `Information requested: ${note}`),
    cancelBooking, assign, move, recommendations, schedule, summary, calendar,
    drivers: () => clone(SAMPLE_DRIVERS), availability: (from: string, to: string) => clone(resourceRows(from, to))
  };
}
export type PreviewServer = ReturnType<typeof createPreviewServer>;
