export enum JobStatus {
  READY = "READY",
  IN_PROGRESS = "IN_PROGRESS",
  COMPLETED = "COMPLETED",
  CANCELLED = "CANCELLED"
}

export enum PaymentMethod {
  CARD = "Card",
  CASH = "Cash",
  BANK_TRANSFER = "Bank Transfer",
  LINK = "Link",
  INVOICE = "Invoice"
}

export enum ExtraChargeType {
  CONGESTION = "London Congestion charge",
  TUNNEL = "Tunnel Charges",
  EXTRA_TIME = "Extra time / Charges",
  PACKING = "Packing Service",
  NONE = "No Extras Time"
}

export interface DriverProfile {
  initials: string;
  fullName: string;
  email: string;
  chatUserName: string;
  active: boolean;
  role: string;
  /** Shown in the "I'm on the way" message preview -- blank until an admin fills it in. */
  phone: string;
  vanRegistration: string;
}

export interface Job {
  jobId: string;
  calendarEventId: string;
  driverInitials: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  pickup: string;
  dropoff: string;
  crewSize: number;
  basePrice: number;
  paidOnline: boolean;
  bookedStart: string;
  bookedFinish: string;
  actualStart: string;
  actualFinish: string;
  bookedMinutes: number;
  actualMinutes: number;
  differenceMinutes: number;
  delayStatus: string;
  extraCharges: string[];
  overtimeMinutes: number;
  overtimeCharge: number;
  totalCharges: number;
  paymentMethod: string;
  paymentStatus: string;
  clientNamePostcode: string;
  clientConfirmedBy: string;
  driveFolderId: string;
  driveFolderUrl: string;
  status: JobStatus;
  currentState: string;
  createdAt: string;
  updatedAt: string;
}

export interface ParsedCalendarBooking {
  calendarEventId: string;
  driverInitials: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  pickup: string;
  dropoff: string;
  crewSize: number;
  price: number;
  paidOnline: boolean;
  bookedStart: string;
  bookedFinish: string;
  rawTitle: string;
  rawDescription: string;
}

export interface ChatAttachment {
  name?: string;
  contentName?: string;
  contentType?: string;
  source?: string;
  attachmentDataRef?: {
    resourceName?: string;
  };
  driveDataRef?: {
    driveFileId?: string;
  };
}

// ---------------------------------------------------------------------------
// Evidence (asynchronous photo processing)
// ---------------------------------------------------------------------------

/**
 * Evidence types map 1:1 onto the Drive step subfolders. Declared here rather than
 * in google/drive.ts so the queue and workflow layers can reference them without
 * importing a Google service module. The four classic-flow types are the original
 * step photos; the four scenario types (matching google/drive.ts's ScenarioFolderKey)
 * let Check In/Check Out/Parking Liability/Liability Report's Chat-attached photos
 * flow through the same async evidence pipeline instead of a bespoke one.
 */
export type EvidenceType =
  | "Arrival" | "VanLoaded" | "EmptyVan" | "Organized"
  | "CheckIn" | "CheckOut" | "ParkingLiability" | "LiabilityReport";

export enum EvidenceStatus {
  /** Attachment reference safely persisted. Not yet in Drive. */
  RECEIVED = "RECEIVED",
  /** A worker has claimed it and is downloading/uploading. */
  PROCESSING = "PROCESSING",
  /** In Drive, URL recorded. This is the only status that satisfies the completion gate. */
  COMPLETED = "COMPLETED",
  /** Terminal. Either a permanent error, or retries exhausted. Requires driver re-upload. */
  FAILED = "FAILED"
}

export interface EvidenceRecord {
  evidenceId: string;
  jobId: string;
  driverEmail: string;
  evidenceType: EvidenceType;
  /** Google Chat media resourceName. The only handle the worker needs. */
  attachmentReference: string;
  contentType: string;
  fileName: string;
  status: EvidenceStatus;
  receivedAt: string;
  processingStartedAt: string;
  processingCompletedAt: string;
  driveFileId: string;
  driveUrl: string;
  retryCount: number;
  lastError: string;
}

export interface EvidenceProgress {
  /** COMPLETED count per evidence type. */
  completed: Record<string, number>;
  /** RECEIVED + PROCESSING count per evidence type. */
  pending: Record<string, number>;
  /** FAILED count per evidence type. */
  failed: Record<string, number>;
  hasSignature: boolean;
}
