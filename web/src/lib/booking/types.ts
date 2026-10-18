/**
 * Booking OS contract (proposed; see docs/booking-os/02-TARGET-ARCHITECTURE.md).
 *
 * These types describe what the dashboard expects from the backend. They are NOT a record of what exists: the
 * backend is outside this repository. Money is integer pence, instants are ISO strings in UTC, and a value the
 * server could not provide is `null`, never 0.
 */

export type Pence = number;
export type Iso = string;

/* ---------------------------------------------------------------- statuses --- */

export type EnquiryStatus = "new" | "needs_info" | "quoted" | "awaiting_customer" | "accepted" | "declined" | "expired" | "closed";
export type PricingState = "pending" | "calculated" | "failed" | "manual_review" | "unavailable";
export type QuotationStatus = "draft" | "sent" | "accepted" | "declined" | "superseded" | "expired";
export type BookingStatus = "pending_payment" | "confirmed" | "cancelled" | "completed";
export type AssignmentStatus = "proposed" | "confirmed" | "released" | "rejected";
/** The existing operational job status (unchanged). */
export type JobStatus = "READY" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";

/** Shown in lists. Derived from the fields above (see states.ts), never stored. */
export type DisplayStatus = "confirmed" | "unassigned" | "assigned" | "in_progress" | "completed" | "cancelled" | "pending_payment";

export type EnquirySource = "website" | "phone" | "email" | "staff" | "other";

/* ------------------------------------------------------------------- shared --- */

export interface Page<T> { items: T[]; pagination: { page: number; pageSize: number; total: number; totalPages: number; hasMore: boolean } }

/** What the caller may do with a record; the server decides, the client only shows. */
export type ActionId = "review" | "calculate_quote" | "request_info" | "confirm" | "edit" | "assign" | "reassign" | "reschedule" | "cancel" | "open_job" | "notify_driver" | "close" | "mark_duplicate";

export interface Address { line: string; postcode: string }

export interface CustomerRef { name: string; phone: string | null; email: string | null; customerId: string | null }

export interface Requirements {
  propertySize: string | null;
  vanType: string | null;
  helpers: number | null;
  estimatedHours: number | null;
  pickupStairs: string | null;
  dropoffStairs: string | null;
  inventory: string | null;
  extras: string[];
  notes: string | null;
}

/* ----------------------------------------------------------------- quotation --- */

export interface QuoteLine { label: string; amountPence: Pence; kind: "base" | "van" | "helpers" | "duration" | "extra" | "travel" | "discount" | "adjustment" }

export interface QuotationVersion {
  id: string;
  version: number;
  createdAt: Iso;
  createdBy: string;
  /** Pricing rule set the lines came from; null for a manual figure. */
  ruleVersion: string | null;
  source: "engine" | "manual" | "sample";
  lines: QuoteLine[];
  /** Sum of the lines, or null when pricing could not produce one. */
  totalPence: Pence | null;
  /** Mandatory reason when `source` is manual or a line is an adjustment. */
  reason: string | null;
}

export interface Quotation {
  id: string;
  pricingState: PricingState;
  status: QuotationStatus;
  /** Why pricing is not calculated (missing fields, failure text). */
  problem: string | null;
  missingFields: string[];
  versions: QuotationVersion[];
  /** The version staff and customer agreed; null until approved. */
  approvedVersionId: string | null;
}

/* ------------------------------------------------------------------- enquiry --- */

export interface Enquiry {
  id: string;
  reference: string;
  status: EnquiryStatus;
  source: EnquirySource;
  submittedAt: Iso;
  customer: CustomerRef;
  pickup: Address;
  dropoff: Address;
  movingDate: string | null;       // London date YYYY-MM-DD
  startTime: string | null;        // London time HH:mm
  requirements: Requirements;
  quotation: Quotation | null;
  duplicateOf: string | null;
  duplicateReason: string | null;
  bookingId: string | null;
  history: Array<{ at: Iso; by: string; text: string }>;
  allowedActions: ActionId[];
  version: number;
}

/* ------------------------------------------------------------------- booking --- */

export interface Assignment {
  id: string;
  status: AssignmentStatus;
  driverInitials: string;
  driverName: string;
  vehicle: { registration: string; category: string } | null;
  assignedAt: Iso;
  assignedBy: string;
  releasedAt: Iso | null;
  reason: string | null;
}

export interface Booking {
  id: string;
  reference: string;
  status: BookingStatus;
  source: EnquirySource;
  enquiryId: string | null;
  jobId: string | null;
  customer: CustomerRef;
  pickup: Address;
  dropoff: Address;
  stops: Address[];
  start: Iso;
  end: Iso;
  requirements: Requirements;
  quotation: Quotation | null;
  /** The current assignment, if any, and the full history. */
  assignment: Assignment | null;
  assignmentHistory: Assignment[];
  jobStatus: JobStatus | null;
  createdAt: Iso;
  /** Payment measures as the existing payment system reports them; null when unknown. */
  payments: { agreedPence: Pence | null; collectedPence: Pence | null; outstandingPence: Pence | null; state: "unknown" | "unpaid" | "part_paid" | "paid" };
  allowedActions: ActionId[];
  version: number;
}

export type ActivityActor = "system" | "admin" | "driver" | "notification";
export interface BookingActivity { id: string; at: Iso; actor: ActivityActor; actorName: string; type: string; text: string }

/* ----------------------------------------------------------------- availability --- */

export type AvailabilityState = "available" | "busy" | "off_shift" | "unavailable" | "unknown";

export interface ResourceAvailability {
  kind: "driver" | "vehicle";
  id: string;                 // driver initials or vehicle registration
  name: string;
  state: AvailabilityState;
  /** What the state is based on ("Shift 08:00 to 18:00", "On leave", "No shift data"). */
  basis: string;
  location: { lat: number; lng: number; at: Iso; place: string | null } | null;
  nextBookingAt: Iso | null;
  todayHours: number | null;
  vehicle?: { registration: string; category: string } | null;
}

export interface ScheduleItem {
  allowedActions?: ActionId[];
  bookingId: string;
  reference: string;
  customerName: string;
  route: string;
  start: Iso;
  end: Iso;
  displayStatus: DisplayStatus;
  driverInitials: string | null;
  vehicleRegistration: string | null;
  version: number;
}

export interface Unavailable { resourceId: string; start: Iso; end: Iso; reason: string }

export type ConflictKind = "driver_overlap" | "vehicle_overlap" | "driver_unavailable" | "vehicle_unavailable" | "outside_shift" | "travel_buffer" | "crew_short" | "unknown_availability";
export interface Conflict { kind: ConflictKind; severity: "blocking" | "warning"; message: string; withBookingId?: string; resourceId?: string }

export interface ScheduleResponse {
  from: Iso; to: Iso; fetchedAt: Iso;
  items: ScheduleItem[];
  unavailable: Unavailable[];
  resources: ResourceAvailability[];
  /** Conflicts between items already in the data (not caused by a move). */
  conflicts: Array<Conflict & { bookingId: string }>;
}

export interface MoveRequest { bookingId: string; start: Iso; end: Iso; driverInitials?: string | null; version: number; dryRun: boolean }
export interface MoveResult { ok: boolean; conflicts: Conflict[]; booking?: Booking }

export interface Recommendation {
  driverInitials: string; driverName: string;
  vehicle: { registration: string; category: string } | null;
  eligible: boolean;
  reasons: string[]; warnings: string[]; hardViolations: Conflict[];
  travelMinutes: number | null;        // null = not available
  workloadHoursToday: number | null;
}

export interface AssignRequest { bookingId: string; driverInitials: string; vehicleRegistration: string | null; version: number; reason?: string }
export interface AssignResult { ok: boolean; conflicts: Conflict[]; booking?: Booking }

/* ------------------------------------------------------------------ summary --- */

/** A metric the server could not compute is `value: null` with a reason, never 0. */
export interface Metric { value: number | null; unavailableReason?: string }

export interface CommandCentreSummary {
  from: Iso; to: Iso; generatedAt: Iso; sample: boolean;
  newEnquiries: Metric; confirmedBookings: Metric; todaysJobs: Metric; unassignedBookings: Metric;
  bookingRevenuePence: Metric & { knownOnly?: boolean; unpricedBookings?: number };
  driverUtilizationPct: Metric;
  conversion: { enquiries: Metric; confirmed: Metric };
  trend: Array<{ day: string; enquiries: number; confirmed: number }> | null;
  workload: Array<{ driverInitials: string; driverName: string; hours: number | null }> | null;
  attention: AttentionItem[];
}

export type AttentionKind = "unreviewed_enquiry" | "awaiting_assignment" | "conflict" | "missing_information" | "awaiting_customer";
export interface AttentionItem { id: string; kind: AttentionKind; title: string; detail: string; targetId: string; target: "enquiry" | "booking"; action: ActionId; at: Iso }

/* --------------------------------------------------------------------- lists --- */

export interface EnquiryQuery { q?: string; status?: string; pricing?: string; source?: string; from?: string; to?: string; movingFrom?: string; movingTo?: string; category?: string; page?: number; pageSize?: number }
export interface BookingQuery { q?: string; status?: string; driver?: string; van?: string; assignment?: string; source?: string; from?: string; to?: string; submittedFrom?: string; submittedTo?: string; sort?: string; dir?: "asc" | "desc"; page?: number; pageSize?: number }

/** Result of every write: either the new record or an error the UI can show per field. */
export interface WriteError { code: string; message: string; fields?: Record<string, string> }
