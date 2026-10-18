/**
 * Fictional sample data for the Bookings preview mode and the dev/demo mock API. Everything here is invented:
 * names, addresses, prices and shifts. Dates are relative to "now" (London days), so the board is never stale.
 * Prices are sample figures and are NOT the output of any pricing rule.
 */
import { DateTime } from "luxon";
import { LONDON, fromLondon } from "../schedule";
import type { Address, Assignment, Booking, BookingStatus, CustomerRef, Enquiry, EnquiryStatus, PricingState, QuoteLine, Quotation, Requirements } from "../types";

export interface SampleDriver {
  initials: string; name: string;
  /** null = no shift data on record (availability is unknown, not available). */
  shift: { start: string; end: string; days: number[] } | null;
  leave: string[];                     // London dates
  vehicle: { registration: string; category: string };
  home: { lat: number; lng: number; place: string };
  /** Minutes since the last position was recorded, to show a stale location. */
  locationAgeMinutes: number | null;
}

export const SAMPLE_DRIVERS: SampleDriver[] = [
  { initials: "AR", name: "Aragao", shift: { start: "08:00", end: "18:00", days: [1, 2, 3, 4, 5] }, leave: [], vehicle: { registration: "LK19 ABC", category: "Large van" }, home: { lat: 51.5365, lng: -0.0598, place: "Hackney" }, locationAgeMinutes: 4 },
  { initials: "KA", name: "Caio", shift: { start: "08:00", end: "18:00", days: [1, 2, 3, 4, 5] }, leave: [], vehicle: { registration: "LK19 ABD", category: "Large van" }, home: { lat: 51.4613, lng: -0.1156, place: "Brixton" }, locationAgeMinutes: 190 },
  { initials: "HE", name: "Henrique", shift: { start: "07:00", end: "17:00", days: [1, 2, 3, 4, 5, 6] }, leave: [], vehicle: { registration: "LK20 XYZ", category: "Medium van" }, home: { lat: 51.5074, lng: -0.1278, place: "Westminster" }, locationAgeMinutes: 8 },
  { initials: "MK", name: "Maico", shift: { start: "09:00", end: "19:00", days: [1, 2, 3, 4, 5] }, leave: [], vehicle: { registration: "LK21 QRS", category: "Luton van" }, home: { lat: 51.5555, lng: -0.2796, place: "Wembley" }, locationAgeMinutes: 12 },
  { initials: "RF", name: "Rafael", shift: null, leave: [], vehicle: { registration: "LK18 MNO", category: "Medium van" }, home: { lat: 51.4545, lng: -0.9781, place: "Reading" }, locationAgeMinutes: null },
  { initials: "TI", name: "Tiago", shift: { start: "08:00", end: "18:00", days: [1, 2, 3, 4, 5] }, leave: [], vehicle: { registration: "LK22 TUV", category: "Large van" }, home: { lat: 51.5123, lng: 0.0187, place: "Canning Town" }, locationAgeMinutes: 6 }
];

const NAMES = ["Harriet Quinn", "Delphine Moreau", "Oluwaseun Adeyemi", "Priya Raman", "Tomasz Wrona", "Imogen Hartley", "Callum Reid", "Nadia Farouk", "Bertrand Leclerc", "Ruth Okafor", "Marcus Bell", "Sofia Lindqvist"];
const STREETS: Array<[string, string]> = [["14 Alder Row, Hackney", "E8 3QP"], ["52 Marlow Court, Brixton", "SW9 8EJ"], ["7 Quay Lane, Canary Wharf", "E14 9SH"], ["31 Fenwick Road, Peckham", "SE15 4AB"], ["9 Linden Mews, Ealing", "W5 2PL"], ["88 Harbour Walk, Greenwich", "SE10 9NN"], ["3 Orchard Close, Walthamstow", "E17 7HT"], ["120 Station Parade, Clapham", "SW4 7DQ"], ["5 Kiln Yard, Bermondsey", "SE1 3TY"], ["46 Elm Park, Highbury", "N5 2RB"]];

const address = (index: number): Address => ({ line: STREETS[index % STREETS.length][0], postcode: STREETS[index % STREETS.length][1] });

function quote(total: number | null, state: PricingState, status: Quotation["status"], by = "Sample", problem: string | null = null, missing: string[] = []): Quotation {
  const lines: QuoteLine[] = total === null ? [] : [
    { label: "Base charge", amountPence: Math.round(total * 0.5), kind: "base" },
    { label: "Van", amountPence: Math.round(total * 0.2), kind: "van" },
    { label: "Helpers", amountPence: Math.round(total * 0.2), kind: "helpers" },
    { label: "Additional services", amountPence: total - Math.round(total * 0.5) - Math.round(total * 0.2) - Math.round(total * 0.2), kind: "extra" }
  ];
  return {
    id: `Q-${Math.random().toString(36).slice(2, 8)}`, pricingState: state, status, problem, missingFields: missing, approvedVersionId: null,
    versions: total === null ? [] : [{ id: `QV-${Math.random().toString(36).slice(2, 8)}`, version: 1, createdAt: new Date().toISOString(), createdBy: by, ruleVersion: null, source: "sample", lines, totalPence: total, reason: null }]
  };
}

const requirements = (vanType: string | null, helpers: number | null, hours: number | null, extra: Partial<Requirements> = {}): Requirements => ({
  propertySize: "2 bed flat", vanType, helpers, estimatedHours: hours, pickupStairs: "Ground floor", dropoffStairs: "First floor", inventory: "Sofa, bed, wardrobe, 20 boxes", extras: [], notes: null, ...extra
});

export interface SampleStore { enquiries: Enquiry[]; bookings: Booking[]; activity: Record<string, Array<{ id: string; at: string; actor: "system" | "admin" | "driver" | "notification"; actorName: string; type: string; text: string }>> }

/** Builds the sample board around `now`. Deterministic for a given day. */
export function createSampleStore(now: Date): SampleStore {
  const today = DateTime.fromJSDate(now, { zone: LONDON }).startOf("day");
  const day = (offset: number) => today.plus({ days: offset }).toISODate()!;
  const at = (offset: number, time: string) => fromLondon(day(offset), time)!;
  const hoursLater = (iso: string, h: number) => new Date(Date.parse(iso) + h * 3600000).toISOString();
  const ago = (hours: number) => new Date(now.getTime() - hours * 3600000).toISOString();
  const customer = (i: number): CustomerRef => ({ name: NAMES[i % NAMES.length], phone: `07700 900${String(100 + i).slice(-3)}`, email: `${NAMES[i % NAMES.length].toLowerCase().replace(/[^a-z]+/g, ".")}@example.test`, customerId: null });

  const assign = (id: string, driver: SampleDriver, assignedAt: string): Assignment => ({ id: `AS-${id}`, status: "confirmed", driverInitials: driver.initials, driverName: driver.name, vehicle: driver.vehicle, assignedAt, assignedBy: "Sample dispatcher", releasedAt: null, reason: null });
  const driver = (initials: string) => SAMPLE_DRIVERS.find(item => item.initials === initials)!;

  let counter = 2040;
  const booking = (spec: { offset: number; time: string; hours: number; status: BookingStatus; driver?: string; job?: Booking["jobStatus"]; total: number | null; enquiryId?: string | null; source?: Booking["source"]; stops?: Address[]; vanType?: string; helpers?: number }): Booking => {
    const n = counter++;
    const start = at(spec.offset, spec.time), end = hoursLater(start, spec.hours);
    const assignment = spec.driver ? assign(String(n), driver(spec.driver), ago(30)) : null;
    const q = spec.total === null ? quote(null, "unavailable", "draft", "Sample", "No approved price recorded for this sample booking.") : quote(spec.total, "calculated", "accepted");
    if (q.versions[0]) q.approvedVersionId = q.versions[0].id;
    const agreed = spec.total;
    return {
      id: `bk-${n}`, reference: `TMV-${n}`, status: spec.status, source: spec.source ?? "website", enquiryId: spec.enquiryId ?? null, jobId: spec.driver && spec.status !== "pending_payment" ? `TMV-JOB-${n}` : null,
      customer: customer(n), pickup: address(n), dropoff: address(n + 3), stops: spec.stops ?? [], start, end,
      requirements: requirements(spec.vanType ?? "Large van", spec.helpers ?? 2, spec.hours),
      quotation: q, assignment, assignmentHistory: assignment ? [assignment] : [], jobStatus: spec.job ?? (assignment && spec.status === "confirmed" ? "READY" : null), createdAt: ago(72 + n % 40),
      payments: { agreedPence: agreed, collectedPence: spec.status === "completed" && agreed !== null ? agreed : null, outstandingPence: spec.status === "completed" && agreed !== null ? 0 : null, state: spec.status === "completed" ? "paid" : "unknown" },
      allowedActions: [], version: 1
    };
  };

  const bookings: Booking[] = [
    booking({ offset: -2, time: "09:00", hours: 4, status: "completed", driver: "AR", job: "COMPLETED", total: 31200 }),
    booking({ offset: -1, time: "10:00", hours: 3, status: "completed", driver: "KA", job: "COMPLETED", total: 24500 }),
    booking({ offset: 0, time: "08:30", hours: 3, status: "confirmed", driver: "AR", job: "IN_PROGRESS", total: 26800 }),
    booking({ offset: 0, time: "11:00", hours: 2, status: "confirmed", driver: "HE", total: 18900, vanType: "Medium van", helpers: 1 }),
    booking({ offset: 0, time: "14:00", hours: 4, status: "confirmed", total: 33400 }),
    booking({ offset: 1, time: "09:00", hours: 5, status: "confirmed", driver: "KA", total: 41200, stops: [address(7)] }),
    booking({ offset: 1, time: "13:00", hours: 3, status: "confirmed", total: null }),
    booking({ offset: 2, time: "08:00", hours: 6, status: "confirmed", driver: "MK", total: 47800, vanType: "Luton van", helpers: 3 }),
    booking({ offset: 2, time: "10:00", hours: 3, status: "confirmed", driver: "AR", total: 25600 }),
    booking({ offset: 3, time: "09:30", hours: 4, status: "confirmed", total: 30100 }),
    booking({ offset: 3, time: "09:00", hours: 3, status: "confirmed", driver: "TI", total: 23900 }),
    booking({ offset: 4, time: "11:00", hours: 2, status: "pending_payment", total: 17700, source: "phone", vanType: "Medium van", helpers: 1 }),
    booking({ offset: 5, time: "08:00", hours: 5, status: "confirmed", driver: "HE", total: 38900 }),
    booking({ offset: 6, time: "10:00", hours: 3, status: "cancelled", total: 22000 }),
    booking({ offset: 7, time: "09:00", hours: 4, status: "confirmed", total: 29800, source: "staff" }),
    booking({ offset: 8, time: "12:00", hours: 3, status: "confirmed", driver: "RF", total: 25100 })
  ];
  // The cancelled booking keeps a released assignment so the history shows it.
  bookings[13].assignmentHistory = [{ ...assign("c", driver("KA"), ago(60)), status: "released", releasedAt: ago(20), reason: "Booking cancelled by the customer" }];
  bookings.forEach(item => { item.allowedActions = []; });

  const enquiry = (spec: { n: number; status: EnquiryStatus; pricing: PricingState | null; total?: number | null; hoursAgo: number; offset: number | null; source?: Enquiry["source"]; dup?: string; dupWhy?: string; vanType?: string | null; helpers?: number | null; hours?: number | null; bookingId?: string; problem?: string; missing?: string[] }): Enquiry => {
    const q = spec.pricing === null ? null : quote(spec.total ?? null, spec.pricing, spec.pricing === "calculated" ? (spec.status === "awaiting_customer" ? "sent" : "draft") : "draft", "Sample", spec.problem ?? null, spec.missing ?? []);
    return {
      id: `enq-${spec.n}`, reference: `ENQ-${spec.n}`, status: spec.status, source: spec.source ?? "website", submittedAt: ago(spec.hoursAgo), customer: customer(spec.n), pickup: address(spec.n), dropoff: address(spec.n + 4),
      movingDate: spec.offset === null ? null : day(spec.offset), startTime: spec.offset === null ? null : "09:00",
      requirements: requirements(spec.vanType === undefined ? "Large van" : spec.vanType, spec.helpers === undefined ? 2 : spec.helpers, spec.hours === undefined ? 3 : spec.hours),
      quotation: q, duplicateOf: spec.dup ?? null, duplicateReason: spec.dupWhy ?? null, bookingId: spec.bookingId ?? null,
      history: [{ at: ago(spec.hoursAgo), by: spec.source === "staff" ? "Sample staff" : "Website form", text: "Enquiry received" }], allowedActions: [], version: 1
    };
  };
  const enquiries: Enquiry[] = [
    enquiry({ n: 101, status: "new", pricing: "pending", hoursAgo: 0.3, offset: 9 }),
    enquiry({ n: 102, status: "new", pricing: "calculated", total: 28400, hoursAgo: 2, offset: 10 }),
    enquiry({ n: 103, status: "new", pricing: "failed", hoursAgo: 5, offset: 11, problem: "The sample pricing service did not respond.", source: "website" }),
    enquiry({ n: 104, status: "needs_info", pricing: "unavailable", hoursAgo: 20, offset: null, vanType: null, helpers: null, hours: null, missing: ["Van type", "Helpers", "Estimated hours", "Moving date"], source: "phone" }),
    enquiry({ n: 105, status: "quoted", pricing: "manual_review", total: 52000, hoursAgo: 26, offset: 12, problem: "Inventory is large; a person must confirm the quote." }),
    enquiry({ n: 106, status: "awaiting_customer", pricing: "calculated", total: 33500, hoursAgo: 49, offset: 13 }),
    enquiry({ n: 107, status: "new", pricing: "pending", hoursAgo: 1, offset: 9, dup: "enq-101", dupWhy: "Same email address and moving date as ENQ-101" }),
    enquiry({ n: 108, status: "accepted", pricing: "calculated", total: 29800, hoursAgo: 90, offset: 7, bookingId: bookings[14].id }),
    enquiry({ n: 109, status: "declined", pricing: "calculated", total: 24000, hoursAgo: 120, offset: 6 }),
    enquiry({ n: 110, status: "closed", pricing: "calculated", total: 21000, hoursAgo: 200, offset: -3 })
  ];
  bookings[14].enquiryId = enquiries[7].id;

  const activity: SampleStore["activity"] = {};
  for (const item of bookings) {
    activity[item.id] = [
      { id: `${item.id}-1`, at: item.createdAt, actor: "system", actorName: "System", type: "booking_created", text: "Booking created" },
      { id: `${item.id}-2`, at: item.createdAt, actor: "admin", actorName: "Sample dispatcher", type: "booking_confirmed", text: "Booking confirmed" }
    ];
    if (item.assignment) activity[item.id].push({ id: `${item.id}-3`, at: item.assignment.assignedAt, actor: "admin", actorName: item.assignment.assignedBy, type: "driver_assigned", text: `${item.assignment.driverName} assigned` }, { id: `${item.id}-4`, at: item.assignment.assignedAt, actor: "notification", actorName: "System", type: "driver_notified", text: "Driver notified (sample: delivery not tracked)" });
    if (item.jobStatus === "IN_PROGRESS" || item.jobStatus === "COMPLETED") activity[item.id].push({ id: `${item.id}-5`, at: item.start, actor: "driver", actorName: item.assignment?.driverName ?? "Driver", type: "job_started", text: "Job started" });
    if (item.jobStatus === "COMPLETED") activity[item.id].push({ id: `${item.id}-6`, at: item.end, actor: "driver", actorName: item.assignment?.driverName ?? "Driver", type: "job_completed", text: "Job completed" });
  }
  return { enquiries, bookings, activity };
}
