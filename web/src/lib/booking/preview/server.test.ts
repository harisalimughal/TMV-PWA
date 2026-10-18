import { describe, expect, it } from "vitest";
import { ContractError, createPreviewServer } from "./server";
import { EMPTY_DRAFT, type BookingDraft } from "../validation";
import { displayStatus } from "../states";
import { londonDayBounds } from "../schedule";

const NOW = new Date("2026-10-21T10:00:00Z");      // a Wednesday
const make = () => createPreviewServer(() => NOW);
const expectError = (fn: () => unknown, status: number, code: string) => {
  try { fn(); } catch (error) { expect(error).toBeInstanceOf(ContractError); expect((error as ContractError).status).toBe(status); expect((error as ContractError).detail.code).toBe(code); return; }
  throw new Error("expected a ContractError");
};
const draft = (patch: Partial<BookingDraft> = {}): BookingDraft => ({ ...EMPTY_DRAFT, customerName: "Test Customer", email: "t@example.test", pickupAddress: "1 Test St", pickupPostcode: "E1 6AN", dropoffAddress: "2 Test St", dropoffPostcode: "SW1A 1AA", vanType: "Large van", helpers: "2", hours: "3", date: "2026-10-30", startTime: "09:00", ...patch });
const everything = (server: ReturnType<typeof make>) => server.listBookings({ pageSize: 100 }).items;

describe("sample data", () => {
  it("is relative to now and covers each display status, with no price invented where none is recorded", () => {
    const server = make();
    const statuses = new Set(everything(server).map(displayStatus));
    for (const s of ["completed", "in_progress", "assigned", "unassigned", "cancelled", "pending_payment"]) expect(statuses.has(s as never)).toBe(true);
    const unpriced = everything(server).find(b => b.payments.agreedPence === null);
    expect(unpriced).toBeDefined();
    expect(unpriced!.quotation?.versions).toEqual([]);
    expect(unpriced!.quotation?.pricingState).toBe("unavailable");
  });
  it("marks every sample quote as sample, never as an engine result", () => {
    const sources = new Set(make().listEnquiries({ pageSize: 100 }).items.flatMap(e => e.quotation?.versions.map(v => v.source) ?? []));
    expect([...sources]).toEqual(["sample"]);
  });
});

describe("lists", () => {
  it("pages on the server and reports totals", () => {
    const first = make().listBookings({ pageSize: 5, page: 1 });
    expect(first.items).toHaveLength(5);
    expect(first.pagination).toMatchObject({ page: 1, pageSize: 5, total: 16, totalPages: 4, hasMore: true });
    expect(make().listBookings({ pageSize: 5, page: 99 }).pagination.page).toBe(4);
  });
  it("searches by reference, customer, postcode and driver without caring about spaces or case", () => {
    const server = make(); const b = everything(server).find(x => x.assignment)!;
    for (const q of [b.reference.toLowerCase(), b.customer.name.toUpperCase(), b.pickup.postcode.replace(" ", ""), b.assignment!.driverName]) expect(server.listBookings({ q, pageSize: 100 }).items.map(x => x.id)).toContain(b.id);
    expect(server.listBookings({ q: "zzzzzz" }).items).toEqual([]);
  });
  it("filters by assignment and display status", () => {
    const server = make();
    expect(server.listBookings({ assignment: "unassigned", pageSize: 100 }).items.every(b => b.assignment?.status !== "confirmed" && ["confirmed", "pending_payment"].includes(b.status))).toBe(true);
    expect(server.listBookings({ status: "cancelled" }).items.every(b => displayStatus(b) === "cancelled")).toBe(true);
  });
  it("sorts unpriced bookings last in both directions", () => {
    const server = make();
    for (const dir of ["asc", "desc"] as const) {
      const rows = server.listBookings({ sort: "price", dir, pageSize: 100 }).items;
      const firstUnpriced = rows.findIndex(b => b.payments.agreedPence === null);
      expect(rows.slice(firstUnpriced).every(b => b.payments.agreedPence === null)).toBe(true);
      const prices = rows.filter(b => b.payments.agreedPence !== null).map(b => b.payments.agreedPence as number);
      expect(prices).toEqual([...prices].sort((a, b) => (dir === "asc" ? a - b : b - a)));
    }
  });
  it("searches enquiries by postcode and filters by pricing state", () => {
    const server = make(); const e = server.listEnquiries({ pageSize: 100 }).items[0];
    expect(server.listEnquiries({ q: e.dropoff.postcode }).items.map(x => x.id)).toContain(e.id);
    expect(server.listEnquiries({ pricing: "failed" }).items.every(x => x.quotation?.pricingState === "failed")).toBe(true);
  });
});

describe("enquiries and prices", () => {
  it("creates an enquiry with NO price: the pricing engine does not exist here", () => {
    const e = make().createEnquiry(draft());
    expect(e.quotation).toMatchObject({ pricingState: "unavailable", versions: [], approvedVersionId: null });
    expect(e.allowedActions).not.toContain("confirm");
  });
  it("rejects an invalid draft with per-field errors", () => {
    expectError(() => make().createEnquiry(draft({ customerName: "", pickupPostcode: "nope" })), 422, "invalid");
  });
  it("is idempotent: the same key returns the same enquiry and creates one", () => {
    const server = make(); const before = server.listEnquiries({ pageSize: 100 }).pagination.total;
    const a = server.createEnquiry(draft(), "k1"), b = server.createEnquiry(draft(), "k1");
    expect(b.id).toBe(a.id);
    expect(server.listEnquiries({ pageSize: 100 }).pagination.total).toBe(before + 1);
    expect(server.createEnquiry(draft(), "k2").id).not.toBe(a.id);
  });
  it("needs a reason for a manual price, preserves the version, and stays a manual source", () => {
    const server = make(); const e = server.createEnquiry(draft());
    expectError(() => server.addManualQuote(e.id, 25000, "  ", e.version), 422, "reason_required");
    expectError(() => server.addManualQuote(e.id, 0, "x", e.version), 422, "invalid");
    const quoted = server.addManualQuote(e.id, 25000, "Agreed by phone", e.version);
    expect(quoted.quotation!.versions[0]).toMatchObject({ source: "manual", totalPence: 25000, reason: "Agreed by phone" });
    expect(quoted.status).toBe("quoted");
    expectError(() => server.addManualQuote(e.id, 26000, "again", e.version), 409, "version_conflict");   // stale version
  });
  it("will not confirm without a price or without a schedule, and confirms once, idempotently", () => {
    const server = make(); const e = server.createEnquiry(draft());
    expectError(() => server.confirmFromEnquiry(e.id, e.version), 422, "no_price");
    const quoted = server.addManualQuote(e.id, 25000, "Agreed by phone", e.version);
    const a = server.confirmFromEnquiry(e.id, quoted.version, "c1"), b = server.confirmFromEnquiry(e.id, quoted.version, "c1");
    expect(b.id).toBe(a.id);
    expect(a).toMatchObject({ status: "confirmed", payments: { agreedPence: 25000 } });
    expect(server.getEnquiry(e.id).status).toBe("accepted");
    expect(server.confirmFromEnquiry(e.id, 999).id).toBe(a.id);          // already a booking: same one, no second booking
    const bare = server.createEnquiry(draft({ date: "", startTime: "" }));
    const q2 = server.addManualQuote(bare.id, 100, "x", bare.version);
    expectError(() => server.confirmFromEnquiry(bare.id, q2.version), 422, "missing_schedule");
  });
  it("follows the enquiry transition table", () => {
    const server = make(); const e = server.createEnquiry(draft());
    const closed = server.closeEnquiry(e.id, e.version);
    expect(closed.status).toBe("closed");
    expectError(() => server.requestInfo(e.id, closed.version, "x"), 409, "invalid_transition");
  });
});

describe("assignment and conflicts", () => {
  it("assigns a free driver, bumps the version, records history and activity", () => {
    const server = make(); const b = everything(server).find(x => x.status === "confirmed" && !x.assignment && x.requirements.vanType === "Large van")!;
    const result = server.recommendations(b.id).find(r => r.eligible && r.driverInitials !== "RF")!;
    const done = server.assign({ bookingId: b.id, driverInitials: result.driverInitials, vehicleRegistration: null, version: b.version });
    expect(done.ok).toBe(true);
    expect(done.booking).toMatchObject({ version: b.version + 1, assignment: { driverInitials: result.driverInitials, status: "confirmed" } });
    expect(displayStatus(done.booking!)).toBe("assigned");
    expect(server.activity(b.id).some(a => a.type === "driver_assigned")).toBe(true);
  });
  it("refuses a double booking with the conflicting booking named, and changes nothing", () => {
    const server = make();
    const taken = everything(server).find(x => x.assignment?.status === "confirmed" && x.status === "confirmed" && !x.jobStatus?.includes("IN_PROGRESS"))!;
    const other = everything(server).find(x => x.id !== taken.id && !x.assignment && x.status === "confirmed")!;
    // Put `other` into the same window as `taken` by moving it (dry run), then try to give it the same driver.
    const move = server.move({ bookingId: other.id, start: taken.start, end: taken.end, version: other.version, dryRun: false });
    expect(move.ok).toBe(true);
    const fresh = server.getBooking(other.id);
    const result = server.assign({ bookingId: other.id, driverInitials: taken.assignment!.driverInitials, vehicleRegistration: null, version: fresh.version });
    expect(result.ok).toBe(false);
    expect(result.conflicts).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "driver_overlap", severity: "blocking", withBookingId: taken.id })]));
    expect(server.getBooking(other.id).assignment).toBeNull();
    expect(server.getBooking(other.id).version).toBe(fresh.version);
  });
  it("two managers assigning the same driver to overlapping jobs: the first wins, the second gets a conflict", () => {
    const server = make();
    const [a, b] = everything(server).filter(x => x.status === "confirmed" && !x.assignment).slice(0, 2);
    server.move({ bookingId: b.id, start: a.start, end: a.end, version: b.version, dryRun: false });
    const bFresh = server.getBooking(b.id);
    const driver = server.recommendations(a.id).find(r => r.eligible && r.driverInitials !== "RF")!.driverInitials;
    expect(server.assign({ bookingId: a.id, driverInitials: driver, vehicleRegistration: null, version: a.version }).ok).toBe(true);
    const second = server.assign({ bookingId: b.id, driverInitials: driver, vehicleRegistration: null, version: bFresh.version });
    expect(second.ok).toBe(false);
    expect(second.conflicts[0].kind).toBe("driver_overlap");
  });
  it("rejects a stale version with 409 instead of overwriting", () => {
    const server = make(); const b = everything(server).find(x => x.status === "confirmed" && !x.assignment)!;
    expectError(() => server.assign({ bookingId: b.id, driverInitials: "AR", vehicleRegistration: null, version: b.version + 5 }), 409, "version_conflict");
  });
  it("does not treat unknown availability as available: no shift data gives a warning and no 'available' state", () => {
    const server = make(); const b = everything(server).find(x => x.status === "confirmed" && !x.assignment)!;
    const rf = server.recommendations(b.id).find(r => r.driverInitials === "RF")!;
    expect(rf.warnings.join(" ")).toMatch(/not known/);
    expect(rf.reasons.join(" ")).not.toMatch(/Free for the whole job/);
    const row = server.availability("2026-10-21T00:00:00.000Z", "2026-10-22T00:00:00.000Z").find(r => r.id === "RF")!;
    expect(row.state).toBe("unknown");
  });
  it("blocks a driver outside their shift and says why", () => {
    const server = make(); const b = everything(server).find(x => x.status === "confirmed" && !x.assignment)!;
    const early = server.move({ bookingId: b.id, start: "2026-10-27T04:00:00.000Z", end: "2026-10-27T06:00:00.000Z", driverInitials: "AR", version: b.version, dryRun: true });
    expect(early.ok).toBe(false);
    expect(early.conflicts[0]).toMatchObject({ kind: "outside_shift", severity: "blocking" });
  });
  it("a dry run never writes; the real move re-validates", () => {
    const server = make(); const b = everything(server).find(x => x.status === "confirmed" && x.assignment?.status === "confirmed" && x.jobStatus === "READY")!;
    const start = new Date(Date.parse(b.start) + 3600000).toISOString(), end = new Date(Date.parse(b.end) + 3600000).toISOString();
    const dry = server.move({ bookingId: b.id, start, end, version: b.version, dryRun: true });
    expect(server.getBooking(b.id).start).toBe(b.start);
    expect(dry.ok).toBe(true);
    server.move({ bookingId: b.id, start, end, version: b.version, dryRun: false });
    expect(server.getBooking(b.id)).toMatchObject({ start, version: b.version + 1 });
  });
  it("needs a reason to reassign, keeps the previous driver in the history, and notifies via activity", () => {
    const server = make(); const b = everything(server).find(x => x.assignment?.status === "confirmed" && x.jobStatus === "READY" && x.status === "confirmed")!;
    const target = server.recommendations(b.id).find(r => r.eligible && r.driverInitials !== b.assignment!.driverInitials)!;
    expectError(() => server.assign({ bookingId: b.id, driverInitials: target.driverInitials, vehicleRegistration: null, version: b.version }), 422, "reason_required");
    const done = server.assign({ bookingId: b.id, driverInitials: target.driverInitials, vehicleRegistration: null, version: b.version, reason: "Driver unwell" });
    const history = done.booking!.assignmentHistory;
    expect(history.find(a => a.driverInitials === b.assignment!.driverInitials)).toMatchObject({ status: "released", reason: "Driver unwell" });
    expect(history.at(-1)).toMatchObject({ driverInitials: target.driverInitials, status: "confirmed" });
  });
  it("will not move or reassign a job that has started", () => {
    const server = make(); const b = everything(server).find(x => x.jobStatus === "IN_PROGRESS")!;
    expectError(() => server.move({ bookingId: b.id, start: b.start, end: b.end, version: b.version, dryRun: true }), 409, "job_started");
    expectError(() => server.assign({ bookingId: b.id, driverInitials: "KA", vehicleRegistration: null, version: b.version, reason: "x" }), 409, "job_started");
    expectError(() => server.cancelBooking(b.id, b.version, "x"), 409, "job_started");
  });
  it("cancelling needs a reason, releases the assignment and keeps it in the history", () => {
    const server = make(); const b = everything(server).find(x => x.assignment?.status === "confirmed" && x.jobStatus === "READY")!;
    expectError(() => server.cancelBooking(b.id, b.version, ""), 422, "reason_required");
    const done = server.cancelBooking(b.id, b.version, "Customer cancelled");
    expect(displayStatus(done)).toBe("cancelled");
    expect(done.assignment).toBeNull();
    expect(done.assignmentHistory.at(-1)).toMatchObject({ status: "released" });
    expectError(() => server.cancelBooking(b.id, done.version, "again"), 409, "invalid_transition");
  });
});

describe("read models", () => {
  it("never shows a missing metric as zero: revenue is known-only with the unpriced count, and utilization needs shift data", () => {
    const server = make(); const { start } = londonDayBounds("2026-10-21");
    const s = server.summary(start, "2026-10-31T00:00:00.000Z");
    expect(s.bookingRevenuePence.value).toBeGreaterThan(0);
    expect(s.bookingRevenuePence.knownOnly).toBe(true);
    expect(s.bookingRevenuePence.unpricedBookings).toBeGreaterThan(0);
    expect(s.driverUtilizationPct.value).not.toBeNull();
    const empty = server.summary("2027-06-01T00:00:00.000Z", "2027-06-08T00:00:00.000Z");
    expect(empty.bookingRevenuePence.value).toBeNull();
    expect(empty.bookingRevenuePence.unavailableReason).toBeTruthy();
    expect(empty.confirmedBookings.value).toBe(0);              // a real zero: there really are none
  });
  it("builds attention items only from real conditions, each with a target and an action", () => {
    const s = make().summary("2026-10-21T00:00:00.000Z", "2026-10-31T00:00:00.000Z");
    expect(s.attention.length).toBeGreaterThan(0);
    for (const item of s.attention) { expect(item.targetId).toBeTruthy(); expect(["review", "assign", "request_info"]).toContain(item.action); }
    expect(s.attention.some(i => i.kind === "unreviewed_enquiry")).toBe(true);
    expect(s.attention.some(i => i.kind === "awaiting_assignment")).toBe(true);
  });
  it("returns the schedule with resources and labels travel time as not available", () => {
    const server = make(); const res = server.schedule("2026-10-21T00:00:00.000Z", "2026-10-28T00:00:00.000Z");
    expect(res.items.length).toBeGreaterThan(3);
    expect(res.resources.map(r => r.id)).toContain("RF");
    const b = everything(server).find(x => x.status === "confirmed" && !x.assignment)!;
    expect(server.recommendations(b.id).every(r => r.travelMinutes === null)).toBe(true);
  });
  it("marks a stale location by its age", () => {
    const row = make().availability("2026-10-21T00:00:00.000Z", "2026-10-22T00:00:00.000Z").find(r => r.id === "KA")!;
    expect(Date.parse(NOW.toISOString()) - Date.parse(row.location!.at)).toBeGreaterThan(2 * 3600000);
    expect(make().availability("2026-10-21T00:00:00.000Z", "2026-10-22T00:00:00.000Z").find(r => r.id === "RF")!.location).toBeNull();
  });
});

describe("availability follows the roster", () => {
  const SATURDAY = new Date("2026-10-17T10:00:00Z"); // a Saturday in London
  const day = { from: "2026-10-16T23:00:00.000Z", to: "2026-10-17T23:00:00.000Z" };

  it("never shows a driver as available on a day they are not rostered, and says why", () => {
    const server = createPreviewServer(() => SATURDAY);
    const rows = server.availability(day.from, day.to);
    const maico = rows.find(r => r.id === "MK")!; // Monday to Friday shift
    expect(maico.state).toBe("off_shift");
    expect(maico.basis).toMatch(/Not rostered on Saturdays/);
    expect(rows.find(r => r.id === "HE")!.state).not.toBe("off_shift"); // Henrique works Saturdays
    expect(rows.find(r => r.id === "RF")!.state).toBe("unknown");
  });

  it("agrees with the assignment check: a driver the list calls available is not blocked for the roster", () => {
    const server = createPreviewServer(() => SATURDAY);
    const booking = server.listBookings({ pageSize: 50 }).items.find(b => b.allowedActions.includes("assign") && b.start >= day.from && b.start < day.to)!;
    const available = new Set(server.availability(day.from, day.to).filter(r => r.state === "available" || r.state === "busy").map(r => r.id));
    for (const rec of server.recommendations(booking.id)) {
      const rosterBlock = rec.hardViolations.some(v => v.kind === "outside_shift" && /not rostered/.test(v.message));
      if (rosterBlock) expect(available.has(rec.driverInitials), `${rec.driverInitials} is blocked as not rostered but listed as available`).toBe(false);
    }
    const rec = server.recommendations(booking.id).find(r => r.driverInitials === "MK")!;
    expect(rec.hardViolations[0].message).toMatch(/not rostered on Saturdays \(shift 09:00 to 19:00, Mon to Fri\)/);
  });
});
