/**
 * Booking OS state tables. Four separate fields (enquiry, quotation, booking, assignment) plus the existing job
 * status; the status shown in lists is derived from them and never stored. See docs/booking-os/02.
 */
import type { AssignmentStatus, BookingStatus, DisplayStatus, EnquiryStatus, JobStatus, PricingState, QuotationStatus } from "./types";

export type Tone = "neutral" | "info" | "success" | "warning" | "danger" | "violet" | "cyan";

export const ENQUIRY_LABEL: Record<EnquiryStatus, string> = {
  new: "New", needs_info: "Needs information", quoted: "Quoted", awaiting_customer: "Awaiting customer",
  accepted: "Accepted", declined: "Declined", expired: "Expired", closed: "Closed"
};
export const PRICING_LABEL: Record<PricingState, string> = {
  pending: "Pricing pending", calculated: "Quote ready", failed: "Pricing failed", manual_review: "Manual review", unavailable: "Pricing unavailable"
};
export const QUOTATION_LABEL: Record<QuotationStatus, string> = {
  draft: "Draft", sent: "Sent", accepted: "Accepted", declined: "Declined", superseded: "Superseded", expired: "Expired"
};
export const BOOKING_LABEL: Record<BookingStatus, string> = {
  pending_payment: "Pending payment", confirmed: "Confirmed", cancelled: "Cancelled", completed: "Completed"
};
export const ASSIGNMENT_LABEL: Record<AssignmentStatus, string> = { proposed: "Proposed", confirmed: "Confirmed", released: "Released", rejected: "Rejected" };
export const DISPLAY_LABEL: Record<DisplayStatus, string> = {
  confirmed: "Confirmed", unassigned: "Unassigned", assigned: "Assigned", in_progress: "In progress", completed: "Completed", cancelled: "Cancelled", pending_payment: "Pending payment"
};
export const DISPLAY_TONE: Record<DisplayStatus, Tone> = {
  confirmed: "info", unassigned: "warning", assigned: "violet", in_progress: "cyan", completed: "success", cancelled: "neutral", pending_payment: "warning"
};

/** The list status of a booking, from the fields that actually decide it. */
export function displayStatus(booking: { status: BookingStatus; assignment: { status: AssignmentStatus } | null; jobStatus: JobStatus | null }): DisplayStatus {
  if (booking.status === "cancelled" || booking.jobStatus === "CANCELLED") return "cancelled";
  if (booking.status === "completed" || booking.jobStatus === "COMPLETED") return "completed";
  if (booking.status === "pending_payment") return "pending_payment";
  if (booking.jobStatus === "IN_PROGRESS") return "in_progress";
  if (booking.assignment?.status === "confirmed") return "assigned";
  return "unassigned";
}

/* ---------------------------------------------------------------- transitions --- */

type Table<S extends string> = Record<S, readonly S[]>;

export const ENQUIRY_TRANSITIONS: Table<EnquiryStatus> = {
  new: ["needs_info", "quoted", "closed", "declined"],
  needs_info: ["new", "quoted", "closed"],
  quoted: ["awaiting_customer", "needs_info", "closed"],
  awaiting_customer: ["accepted", "declined", "expired", "needs_info", "closed"],
  accepted: ["closed"],
  declined: ["closed"],
  expired: ["new", "closed"],
  closed: []
};
export const QUOTATION_TRANSITIONS: Table<QuotationStatus> = {
  draft: ["sent", "superseded"],
  sent: ["accepted", "declined", "expired", "superseded"],
  accepted: [], declined: [], superseded: [], expired: ["superseded"]
};
export const BOOKING_TRANSITIONS: Table<BookingStatus> = {
  pending_payment: ["confirmed", "cancelled"],
  confirmed: ["completed", "cancelled"],
  completed: [], cancelled: []
};
export const ASSIGNMENT_TRANSITIONS: Table<AssignmentStatus> = {
  proposed: ["confirmed", "rejected"],
  confirmed: ["released"],
  released: [], rejected: []
};

export function canTransition<S extends string>(table: Table<S>, from: S, to: S): boolean {
  return table[from].includes(to);
}

/* ------------------------------------------------------------- inbox categories --- */

export type EnquiryCategory = "all" | "new" | "awaiting_pricing" | "awaiting_review" | "awaiting_customer" | "attention" | "closed";
export const ENQUIRY_CATEGORIES: Array<{ id: EnquiryCategory; label: string }> = [
  { id: "all", label: "All enquiries" }, { id: "new", label: "New" }, { id: "awaiting_pricing", label: "Awaiting pricing" },
  { id: "awaiting_review", label: "Awaiting review" }, { id: "awaiting_customer", label: "Awaiting customer confirmation" },
  { id: "attention", label: "Requires attention" }, { id: "closed", label: "Closed / archived" }
];

interface CategorySubject { status: EnquiryStatus; duplicateOf: string | null; quotation: { pricingState: PricingState } | null }

/** Which inbox lists an enquiry appears in. An enquiry can be in several (it is a view, not a status). */
export function enquiryInCategory(enquiry: CategorySubject, category: EnquiryCategory): boolean {
  const open = !["accepted", "declined", "expired", "closed"].includes(enquiry.status);
  const pricing = enquiry.quotation?.pricingState ?? "pending";
  switch (category) {
    case "all": return true;
    case "new": return enquiry.status === "new";
    case "awaiting_pricing": return open && (pricing === "pending" || !enquiry.quotation);
    case "awaiting_review": return open && (pricing === "calculated" || pricing === "manual_review") && enquiry.status !== "awaiting_customer";
    case "awaiting_customer": return enquiry.status === "awaiting_customer";
    case "attention": return open && (pricing === "failed" || pricing === "manual_review" || pricing === "unavailable" || enquiry.status === "needs_info" || !!enquiry.duplicateOf);
    case "closed": return !open;
  }
}

/** The agreed price of a quotation, or null when none is approved. Never a default of 0. */
export function agreedTotalPence(quotation: { versions: Array<{ id: string; totalPence: number | null }>; approvedVersionId: string | null } | null | undefined): number | null {
  if (!quotation?.approvedVersionId) return null;
  return quotation.versions.find(v => v.id === quotation.approvedVersionId)?.totalPence ?? null;
}
