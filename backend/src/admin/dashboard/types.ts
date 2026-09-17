/**
 * Ported from TMV-Chat-bot's dashboard/server/normalize/types.ts -- the NormalizedJob
 * shape every dashboard route (jobs/finance/exceptions/activity/summary) consumes.
 * Unchanged from the source.
 */
import { Pence } from "../../utils/money";
import { JobStatus } from "../../jobs/job.types";
import { WorkflowState } from "../../workflow/workflow.states";

export type Provenance = "recorded" | "derived";

export type DelayBand = "EARLY" | "ON_TIME" | "LATE_5_15" | "LATE_15_30" | "LATE_OVER_30";

export type EvidenceCategory = "Arrival" | "VanLoaded" | "StopBy" | "EmptyVan" | "Organized" | "Signature" | "Documents";

export type EvidenceState = "MISSING" | "PROCESSING" | "COMPLETED" | "FAILED";

export interface NormalizedEvidenceItem {
  id: string;
  category: EvidenceCategory;
  state: EvidenceState;
  fileId?: string;
  driveUrl?: string;
  thumbProxyUrl?: string;
  fileName?: string;
  contentType?: string;
  receivedAt?: string;
  completedAt?: string;
  error?: string;
  provenance: Provenance;
  /** Where/when the driver's device recorded taking this photo — absent for older
   *  evidence, or where GPS was denied/unavailable at capture time. */
  capturedAt?: string;
  location?: { lat: number; lng: number; accuracy: number };
  /** A short human place name for `location`, reverse-geocoded once at upload time
   *  (see integrations/geocode.ts) — absent when there was no location, or the lookup
   *  failed; show the raw coordinates in that case instead. */
  locationName?: string;
}

export interface ActivityEntry {
  timestamp: string;
  driver: string;
  action: string;
  fromState?: string;
  toState?: string;
  detail?: string;
}

export interface JobException {
  type: string;
  detail: string;
  timestamp: string;
}

export interface BookingDetails {
  vanSize?: string;
  notes?: string;
  inventory?: string;
  hireDuration?: string;
  extraChargeText?: string;
}

export type ScenarioKind = "checkin" | "checkout" | "parking" | "liability";

/** A Check In/Check Out/Parking Liability/Liability Report submission filed against
 *  this specific job -- same shape scenarios.routes.ts's GET /:kind already returns
 *  for the standalone Scenarios tabs, just scoped to one job instead of one kind. */
export interface JobScenarioSubmission {
  id: string;
  kind: ScenarioKind;
  timestamp: string;
  driver: string;
  clientName: string;
  clientPhone: string;
  clientEmail: string;
  containerNumber: string;
  address: string;
  damageCategories: string;
  clientPresent: string;
  rawRecord: Record<string, string>;
  photos: Array<{
    fileId: string;
    thumbUrl: string;
    capturedAt?: string;
    location?: { lat: number; lng: number; accuracy: number };
    locationName?: string;
  }>;
  signature: { fileId: string; thumbUrl: string } | null;
}

export interface NormalizedJob {
  jobId: string;
  calendarEventId: string;

  bookedStart: string; // ISO UTC
  bookedFinish: string; // ISO UTC
  actualStart?: string; // ISO UTC
  actualFinish?: string; // ISO UTC
  bookedMinutes: number;
  actualMinutes?: number;
  delayMinutes: number;
  delayBand: DelayBand;
  timingTrustworthy: boolean;

  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  pickup: string;
  dropoff: string;
  floorFrom?: string;
  floorTo?: string;
  crewSize: number;

  driverInitials: string;
  driverName: string;
  driverEmail?: string;

  status: JobStatus;
  currentState: WorkflowState | string;
  workflowCompletionPct: number;

  basePrice: Pence;
  extraChargeSelections: string[];
  extraCharges: Pence;
  overtimeMinutes: number;
  overtimeCharge: Pence;
  calculatedTotalCharges: Pence;
  totalCharges: Pence;
  amountCharged: Pence;
  reconciled: boolean;

  paymentMethod: string;
  paymentStatus: string;
  managerReviewStatus?: "Pending" | "Approved" | "Flagged";
  managerReviewNote?: string;
  managerReviewedAt?: string;
  paidOnline: boolean;

  evidenceCompleteness: {
    arrival: EvidenceState;
    vanLoaded: EvidenceState;
    /** Only ever COMPLETED for a job where the driver said "yes" to the stop-by
     *  detour (see workflow.states.ts's WAITING_STOP_BY_PHOTO) -- MISSING for every
     *  job with no stop, same as any other job-shaped-differently field. */
    stopBy: EvidenceState;
    emptyVan: EvidenceState;
    organized: EvidenceState;
    signature: EvidenceState;
  };
  evidenceItems: NormalizedEvidenceItem[];

  /** Check In/Check Out/Parking Liability/Liability Report submissions filed against
   *  this job specifically (scenario_submissions docs scoped by jobId) -- oldest
   *  first, same order as `activity`. Empty for the (common) job with none. */
  scenarios: JobScenarioSubmission[];

  clientConfirmedName?: string;
  signatureUrl?: string;
  driveFolderId?: string;
  driveFolderUrl?: string;

  activity: ActivityEntry[];
  exceptions: JobException[];
  bookingDetails: BookingDetails;
  /** Verbatim Calendar event title this job was synced from -- lets ops see exactly
   *  what the booking's title says, not just the already-parsed fields. */
  rawTitle: string;
  /** Verbatim Calendar event description (HTML, same as the driver app's
   *  JobDetailsPanel renders) -- lets ops fall back to the office's own wording when
   *  a parsed field (e.g. pickup/dropoff address) failed to extract cleanly. */
  rawDescription: string;
  created: string;
  updated: string;
}
