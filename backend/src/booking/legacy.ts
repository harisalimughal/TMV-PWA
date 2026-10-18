import { createHash } from "node:crypto";
import { DateTime } from "luxon";
import type { Job, DriverProfile } from "../jobs/job.types";
import type { Booking, ResourceAvailability, ScheduleItem } from "./types";
import { displayStatus } from "./states";
import { driverVisible } from "../admin/driver-scope";

/** A read projection. No job is copied into a second collection or rewritten. */
export function bookingFromJob(job: Job, drivers: DriverProfile[] = []): Booking {
  const initials = job.status === "COMPLETED" ? job.reportIdentity?.initials || job.timeBilling?.driverInitials || job.driverInitials : job.driverInitials;
  const driver = drivers.find(d => d.initials === initials);
  const assigned = !!initials && initials !== "UNASSIGNED";
  return {
    id: job.jobId, reference: job.jobId, source: "other", enquiryId: null, jobId: job.jobId,
    status: job.status === "CANCELLED" ? "cancelled" : job.status === "COMPLETED" ? "completed" : "confirmed",
    customer: { name: job.customerName, email: job.customerEmail || null, phone: job.customerPhone || null, customerId: null },
    pickup: { line: job.pickup, postcode: "" }, dropoff: { line: job.dropoff, postcode: "" },
    stops: job.stopBy ? [{ line: job.stopBy, postcode: "" }] : [], start: job.bookedStart, end: job.bookedFinish,
    requirements: { propertySize: null, vanType: job.vanSize || null, helpers: null,
      estimatedHours: job.bookedMinutes > 0 ? job.bookedMinutes / 60 : null, pickupStairs: job.floorFrom || null,
      dropoffStairs: job.floorTo || null, inventory: job.inventory || null, extras: [], notes: job.extraRequest || null },
    quotation: null,
    assignment: assigned ? { id: `current:${job.jobId}`, status: "confirmed", driverInitials: initials,
      driverName: (job.status === "COMPLETED" ? job.reportIdentity?.name : null) || driver?.fullName || initials, vehicle: job.status !== "COMPLETED" && driver?.vanRegistration ? { registration: driver.vanRegistration, category: "Not recorded" } : null,
      assignedAt: "", assignedBy: "Not recorded", releasedAt: null, reason: null } : null,
    assignmentHistory: [], jobStatus: job.status, createdAt: job.createdAt,
    // paidOnline is a Calendar flag, not a payment receipt or ledger.
    payments: { agreedPence: null, collectedPence: null, outstandingPence: null, state: "unknown" },
    allowedActions: ["open_job"], version: parseInt(createHash("sha256").update(JSON.stringify([job.updatedAt, job.driverInitials, job.bookedStart, job.bookedFinish, job.status])).digest("hex").slice(0, 12), 16)
  };
}

export function resourceAvailability(drivers: DriverProfile[], bookings: Booking[], from: string, to: string): ResourceAvailability[] {
  return drivers.filter(d => d.active && driverVisible(d.initials)).map(d => {
    const mine = bookings.filter(b => b.assignment?.driverInitials === d.initials && !["cancelled", "completed"].includes(b.status));
    const busy = mine.some(b => b.start < to && b.end > from);
    return { kind: "driver", id: d.initials, name: d.fullName, state: busy ? "busy" : "unknown",
      basis: busy ? "An existing job overlaps this window" : "Shift and leave availability are not recorded",
      location: null, nextBookingAt: mine.filter(b => b.start >= from).sort((a, b) => a.start.localeCompare(b.start))[0]?.start || null,
      todayHours: null, vehicle: d.vanRegistration ? { registration: d.vanRegistration, category: "Not recorded" } : null };
  });
}

export function scheduleItem(b: Booking): ScheduleItem {
  return { allowedActions: [], bookingId: b.id, reference: b.reference, customerName: b.customer.name, route: `${b.pickup.line} → ${b.dropoff.line}`,
    start: b.start, end: b.end, displayStatus: displayStatus(b), driverInitials: b.assignment?.driverInitials || null,
    vehicleRegistration: b.assignment?.vehicle?.registration || null, version: b.version };
}

export function londonDate(iso: string): string { return DateTime.fromISO(iso, { zone: "Europe/London" }).toISODate() || ""; }
