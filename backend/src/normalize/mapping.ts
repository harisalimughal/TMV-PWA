/**
 * Declarative mappings between spreadsheet tab headers and internal fields.
 * If a spreadsheet column is renamed, it is updated here in one place.
 */

export const BOOKINGS_MAP = {
  jobId: "Job ID",
  calendarEventId: "Calendar Event ID",
  driverInitials: "Driver Initials",
  customerName: "Customer",
  customerEmail: "Customer Email",
  customerPhone: "Phone",
  pickup: "Pickup",
  dropoff: "Dropoff",
  crewSize: "Crew Size",
  basePrice: "Base Price",
  paidOnline: "Paid Online",
  bookedStart: "Booked Start",
  bookedFinish: "Booked Finish",
  actualStart: "Actual Start",
  actualFinish: "Actual Finish",
  bookedMinutes: "Booked Minutes",
  actualMinutes: "Actual Minutes",
  diffMinutes: "Difference Minutes",
  delayStatus: "Delay Status",
  extraCharges: "Extra Charges",
  overtimeMinutes: "Overtime Minutes",
  overtimeCharge: "Overtime Charge",
  totalCharges: "Total Charges",
  paymentMethod: "Payment Method",
  paymentStatus: "Payment Status",
  clientNamePostcode: "Client Name/Postcode",
  clientConfirmedBy: "Client Confirmed By",
  status: "Status",
  currentState: "Current State",
  driveFolderId: "Drive Folder ID",
  driveFolderUrl: "Drive Folder URL",
  created: "Created",
  updated: "Updated"
} as const;

export const DRIVERS_MAP = {
  initials: "Initials",
  fullName: "Full Name",
  email: "Email",
  chatUserName: "Chat User Name",
  active: "Active",
  role: "Role",
  phone: "Phone",
  vanRegistration: "Van Registration"
} as const;

export const EVIDENCE_MAP = {
  evidenceId: "Evidence ID",
  jobId: "Job ID",
  driver: "Driver",
  evidenceType: "Evidence Type",
  attachmentRef: "Attachment Ref",
  contentType: "Content Type",
  fileName: "File Name",
  status: "Status",
  received: "Received",
  processingStarted: "Processing Started",
  processingCompleted: "Processing Completed",
  driveFileId: "Drive File ID",
  driveUrl: "Drive URL",
  retryCount: "Retry Count",
  lastError: "Last Error"
} as const;

export const PHOTOS_MAP = {
  timestamp: "Timestamp",
  jobId: "Job ID",
  driver: "Driver",
  step: "Step",
  fileId: "File ID",
  fileUrl: "File URL",
  fileName: " ", // Note: column 7 has whitespace in workbook
  contentType: "Content Type"
} as const;

export const SIGNATURES_MAP = {
  timestamp: "Timestamp",
  jobId: "Job ID",
  driver: "Driver",
  customerName: "Customer Name",
  mode: "Mode",
  confirmationText: "Confirmation Text"
} as const;

export const PAYMENTS_MAP = {
  timestamp: "Timestamp",
  jobId: "Job ID",
  driver: "Driver",
  method: "Method",
  amount: "Amount",
  status: "Status"
} as const;

export const ACTIVITY_MAP = {
  timestamp: "Timestamp",
  jobId: "Job ID",
  driver: "Driver",
  action: "Action",
  fromState: "From State",
  toState: "To State",
  detail: "Detail"
} as const;

export const EXCEPTIONS_MAP = {
  timestamp: "Timestamp",
  jobId: "Job ID",
  type: "Type",
  detail: "Detail",
  resolved: "Resolved"
} as const;
