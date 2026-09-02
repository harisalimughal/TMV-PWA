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

export type EvidenceCategory = "Arrival" | "VanLoaded" | "EmptyVan" | "Organized" | "Signature" | "Documents";

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
  totalCharges: Pence;
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
    emptyVan: EvidenceState;
    organized: EvidenceState;
    signature: EvidenceState;
  };
  evidenceItems: NormalizedEvidenceItem[];

  clientConfirmedName?: string;
  signatureUrl?: string;
  driveFolderId?: string;
  driveFolderUrl?: string;

  activity: ActivityEntry[];
  exceptions: JobException[];
  /** Verbatim Calendar event title this job was synced from -- lets ops see exactly
   *  what the booking's title says, not just the already-parsed fields. */
  rawTitle: string;
  created: string;
  updated: string;
}
