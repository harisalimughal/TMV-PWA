/** Ported verbatim from TMV-Chat-bot's dashboard/web/src/types/index.ts. */

export type JobStatus = "READY" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";

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
  provenance: "recorded" | "derived";
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
  bookedStart: string;
  bookedFinish: string;
  actualStart?: string;
  actualFinish?: string;
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
  currentState: string;
  workflowCompletionPct: number;
  basePrice: number;
  extraCharges: number;
  overtimeMinutes: number;
  overtimeCharge: number;
  totalCharges: number;
  reconciled: boolean;
  paymentMethod: string;
  paymentStatus: string;
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
  created: string;
  updated: string;
}

export interface SummaryKPIs {
  totalJobs: number;
  scheduled: number;
  inProgress: number;
  completed: number;
  cancelled: number;
  late: number;
  incomplete: number;
  revenuePounds: number;
  revenueFormatted: string;
  cashCollectedPounds: number;
  cardBankPounds: number;
  extraChargesPounds: number;
  overtimePounds: number;
  photosMissing: number;
  photosProcessing: number;
  photosFailed: number;
  missingSignatures: number;
  driversWorkingCount: number;
  avgDurationMinutes: number;
  avgDelayMinutes: number;
}

export interface SummaryCharts {
  statusBreakdown: Array<{ label: string; value: number; color: string }>;
  revenueOverTime: Array<{ date: string; revenuePounds: number; jobsCount: number }>;
  paymentMethodSplit: Array<{ method: string; totalPounds: number; count: number }>;
  jobsByDriver: Array<{ driverName: string; initials: string; completed: number; active: number }>;
}

export interface SummaryResponse {
  kpis: SummaryKPIs;
  charts: SummaryCharts;
  meta: { fetchedAt: string; durationMs: number };
}

export interface DriverSummaryItem {
  initials: string;
  fullName: string;
  email?: string;
  phone?: string;
  vanRegistration?: string;
  active: boolean;
  assigned: number;
  completed: number;
  cancelled: number;
  completionRate: number;
  avgDurationMinutes: number;
  avgDelayMinutes: number;
  revenuePounds: number;
  revenueFormatted: string;
  cashCollectedPounds: number;
  missingEvidenceCount: number;
  overtimeCount: number;
}

export interface FinanceSummaryResponse {
  summary: {
    totalRevenuePounds: number;
    totalRevenueFormatted: string;
    basePricePounds: number;
    extraChargesPounds: number;
    overtimePounds: number;
    cashPounds: number;
    cardPounds: number;
    bankPounds: number;
    invoicePounds: number;
  };
  unreconciledJobs: Array<{
    jobId: string;
    customerName: string;
    basePrice: number;
    extraCharges: number;
    overtimeCharge: number;
    totalCharges: number;
    differencePence: number;
  }>;
  timeline: Array<{ period: string; base: number; extras: number; overtime: number; total: number; count: number }>;
}

export interface ExceptionItem {
  id: string;
  jobId: string;
  type: string;
  severity: "CRITICAL" | "WARNING" | "INFO";
  detail: string;
  timestamp: string;
  customerName: string;
  driverName: string;
  linkUrl: string;
}

export interface ScenarioItem {
  id: string;
  Timestamp?: string;
  "Job ID"?: string;
  Driver?: string;
  "Container Number"?: string;
  "Client Name"?: string;
  "Client Full Name"?: string;
  "Client Phone"?: string;
  "Client Email"?: string;
  "Client Present"?: string;
  "Client Present At Dropoff"?: string;
  Address?: string;
  "Damage Categories"?: string;
  Date?: string;
  photos: Array<{ fileId: string; thumbUrl: string }>;
  signature: { fileId: string; thumbUrl: string } | null;
}

export function toPounds(pence: number): number {
  return (pence || 0) / 100;
}

export function formatGBP(pence: number): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(toPounds(pence));
}
