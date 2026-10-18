import { describe, expect, it } from "vitest";
import {
  ASSIGNMENT_TRANSITIONS, BOOKING_TRANSITIONS, ENQUIRY_TRANSITIONS, QUOTATION_TRANSITIONS, canTransition, displayStatus, enquiryInCategory
} from "./states";
import type { AssignmentStatus, BookingStatus, EnquiryStatus, QuotationStatus } from "./types";

/** Every ordered pair, so each allowed and each refused transition is stated by the table and checked. */
function pairs<S extends string>(all: S[]) { return all.flatMap(from => all.map(to => [from, to] as [S, S])); }

describe("transition tables", () => {
  const cases: Array<[string, Record<string, readonly string[]>]> = [
    ["enquiry", ENQUIRY_TRANSITIONS], ["quotation", QUOTATION_TRANSITIONS], ["booking", BOOKING_TRANSITIONS], ["assignment", ASSIGNMENT_TRANSITIONS]
  ];
  for (const [name, table] of cases) {
    it(`${name}: every state is a key, every target is a state, nothing moves to itself`, () => {
      const states = Object.keys(table);
      for (const [from, targets] of Object.entries(table)) {
        for (const target of targets) { expect(states).toContain(target); expect(target).not.toBe(from); }
      }
    });
  }

  it("booking: only the stated moves are allowed", () => {
    const allowed = new Set(["pending_payment>confirmed", "pending_payment>cancelled", "confirmed>completed", "confirmed>cancelled"]);
    for (const [from, to] of pairs<BookingStatus>(["pending_payment", "confirmed", "cancelled", "completed"])) expect(canTransition(BOOKING_TRANSITIONS, from, to)).toBe(allowed.has(`${from}>${to}`));
  });
  it("assignment: released and rejected are final; confirmed can only be released", () => {
    const allowed = new Set(["proposed>confirmed", "proposed>rejected", "confirmed>released"]);
    for (const [from, to] of pairs<AssignmentStatus>(["proposed", "confirmed", "released", "rejected"])) expect(canTransition(ASSIGNMENT_TRANSITIONS, from, to)).toBe(allowed.has(`${from}>${to}`));
  });
  it("enquiry: closed is final and an accepted enquiry can only be closed", () => {
    const all: EnquiryStatus[] = ["new", "needs_info", "quoted", "awaiting_customer", "accepted", "declined", "expired", "closed"];
    for (const to of all) expect(canTransition(ENQUIRY_TRANSITIONS, "closed", to)).toBe(false);
    expect(ENQUIRY_TRANSITIONS.accepted).toEqual(["closed"]);
    expect(canTransition(ENQUIRY_TRANSITIONS, "new", "accepted")).toBe(false);   // never accepted without a quote
  });
  it("quotation: accepted, declined and superseded are final", () => {
    for (const status of ["accepted", "declined", "superseded"] as QuotationStatus[]) expect(QUOTATION_TRANSITIONS[status]).toEqual([]);
  });
});

describe("display status", () => {
  const base = { status: "confirmed" as BookingStatus, assignment: null, jobStatus: null };
  it("derives the list status from the separate fields", () => {
    expect(displayStatus(base)).toBe("unassigned");
    expect(displayStatus({ ...base, assignment: { status: "proposed" } })).toBe("unassigned");
    expect(displayStatus({ ...base, assignment: { status: "confirmed" } })).toBe("assigned");
    expect(displayStatus({ ...base, assignment: { status: "confirmed" }, jobStatus: "READY" })).toBe("assigned");
    expect(displayStatus({ ...base, assignment: { status: "confirmed" }, jobStatus: "IN_PROGRESS" })).toBe("in_progress");
    expect(displayStatus({ ...base, status: "completed", jobStatus: "COMPLETED" })).toBe("completed");
    expect(displayStatus({ ...base, status: "pending_payment" })).toBe("pending_payment");
  });
  it("lets cancellation win over everything else", () => {
    expect(displayStatus({ status: "cancelled", assignment: { status: "confirmed" }, jobStatus: "IN_PROGRESS" })).toBe("cancelled");
    expect(displayStatus({ ...base, jobStatus: "CANCELLED" })).toBe("cancelled");
  });
});

describe("inbox categories", () => {
  const enquiry = (status: EnquiryStatus, pricing: string | null, duplicateOf: string | null = null) => ({ status, duplicateOf, quotation: pricing ? { pricingState: pricing as never } : null });
  it("puts an enquiry in every list that applies, and the closed ones only in Closed", () => {
    expect(enquiryInCategory(enquiry("new", "pending"), "new")).toBe(true);
    expect(enquiryInCategory(enquiry("new", "pending"), "awaiting_pricing")).toBe(true);
    expect(enquiryInCategory(enquiry("new", null), "awaiting_pricing")).toBe(true);
    expect(enquiryInCategory(enquiry("quoted", "calculated"), "awaiting_review")).toBe(true);
    expect(enquiryInCategory(enquiry("awaiting_customer", "calculated"), "awaiting_customer")).toBe(true);
    expect(enquiryInCategory(enquiry("awaiting_customer", "calculated"), "awaiting_review")).toBe(false);
    expect(enquiryInCategory(enquiry("closed", "calculated"), "closed")).toBe(true);
    expect(enquiryInCategory(enquiry("closed", "calculated"), "new")).toBe(false);
    expect(enquiryInCategory(enquiry("closed", "failed"), "attention")).toBe(false);
  });
  it("flags failures, manual review, missing information and suspected duplicates as needing attention", () => {
    expect(enquiryInCategory(enquiry("new", "failed"), "attention")).toBe(true);
    expect(enquiryInCategory(enquiry("quoted", "manual_review"), "attention")).toBe(true);
    expect(enquiryInCategory(enquiry("needs_info", "pending"), "attention")).toBe(true);
    expect(enquiryInCategory(enquiry("new", "pending", "ENQ-1"), "attention")).toBe(true);
    expect(enquiryInCategory(enquiry("quoted", "calculated"), "attention")).toBe(false);
  });
  it("lists every enquiry under All", () => { expect(enquiryInCategory(enquiry("closed", null), "all")).toBe(true); });
});
