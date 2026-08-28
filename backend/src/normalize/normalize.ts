import { JobStatus } from "../jobs/job.types";
import { SheetDataset } from "../read/types";
import { safeMoney, reconcileFinancials } from "./finance";
import { BOOKINGS_MAP, DRIVERS_MAP, EVIDENCE_MAP, PHOTOS_MAP, SIGNATURES_MAP, ACTIVITY_MAP, EXCEPTIONS_MAP } from "./mapping";
import {
  calculateDelayMinutes,
  calculateMinutes,
  getDelayBand,
  isTimingTrustworthy,
  toUtcIso
} from "./timezone";
import {
  ActivityEntry,
  EvidenceCategory,
  EvidenceState,
  JobException,
  NormalizedEvidenceItem,
  NormalizedJob
} from "./types";

const MANDATORY_PHOTO_STEPS: { type: string; category: EvidenceCategory }[] = [
  { type: "Arrival", category: "Arrival" },
  { type: "VanLoaded", category: "VanLoaded" },
  { type: "EmptyVan", category: "EmptyVan" },
  { type: "Organized", category: "Organized" }
];

export function normalizeDataset(dataset: SheetDataset): NormalizedJob[] {
  // Index auxiliary tabs by Job ID
  const driversByInitials = new Map<string, Record<string, string>>();
  for (const d of dataset.drivers) {
    const init = String(d[DRIVERS_MAP.initials] || "").trim().toUpperCase();
    if (init) driversByInitials.set(init, d);
  }

  const workflowByJob = new Map<string, Record<string, string>>();
  for (const w of dataset.workflow) {
    const id = String(w["Job ID"] || "").trim();
    if (id) workflowByJob.set(id, w);
  }

  const evidenceByJob = new Map<string, Record<string, string>[]>();
  for (const e of dataset.evidence) {
    const id = String(e[EVIDENCE_MAP.jobId] || "").trim();
    if (id) {
      const list = evidenceByJob.get(id) || [];
      list.push(e);
      evidenceByJob.set(id, list);
    }
  }

  const photosByJob = new Map<string, Record<string, string>[]>();
  for (const p of dataset.photos) {
    const id = String(p[PHOTOS_MAP.jobId] || "").trim();
    if (id) {
      const list = photosByJob.get(id) || [];
      list.push(p);
      photosByJob.set(id, list);
    }
  }

  const signaturesByJob = new Map<string, Record<string, string>>();
  for (const s of dataset.signatures) {
    const id = String(s[SIGNATURES_MAP.jobId] || "").trim();
    if (id) signaturesByJob.set(id, s); // Latest takes precedence
  }

  const activityByJob = new Map<string, ActivityEntry[]>();
  for (const a of dataset.activity) {
    const id = String(a[ACTIVITY_MAP.jobId] || "").trim();
    if (id) {
      const list = activityByJob.get(id) || [];
      list.push({
        timestamp: toUtcIso(a[ACTIVITY_MAP.timestamp]),
        driver: a[ACTIVITY_MAP.driver] || "Not recorded",
        action: a[ACTIVITY_MAP.action] || "",
        fromState: a[ACTIVITY_MAP.fromState] || undefined,
        toState: a[ACTIVITY_MAP.toState] || undefined,
        detail: a[ACTIVITY_MAP.detail] || undefined
      });
      activityByJob.set(id, list);
    }
  }

  const exceptionsByJob = new Map<string, JobException[]>();
  for (const ex of dataset.exceptions) {
    const id = String(ex[EXCEPTIONS_MAP.jobId] || "").trim();
    if (id) {
      const list = exceptionsByJob.get(id) || [];
      list.push({
        type: ex[EXCEPTIONS_MAP.type] || "EXCEPTION",
        detail: ex[EXCEPTIONS_MAP.detail] || "",
        timestamp: toUtcIso(ex[EXCEPTIONS_MAP.timestamp])
      });
      exceptionsByJob.set(id, list);
    }
  }

  // Normalize each Booking row
  const normalizedJobs: NormalizedJob[] = [];
  const seenJobIds = new Set<string>();

  for (const b of dataset.bookings) {
    const jobId = String(b[BOOKINGS_MAP.jobId] || "").trim();
    if (!jobId) continue;

    // Check for duplicate Job IDs
    const isDuplicate = seenJobIds.has(jobId);
    seenJobIds.add(jobId);

    const driverInitials = String(b[BOOKINGS_MAP.driverInitials] || "").trim().toUpperCase();
    const driverDoc = driverInitials ? driversByInitials.get(driverInitials) : undefined;
    const driverName = driverDoc ? driverDoc[DRIVERS_MAP.fullName] : (driverInitials || "Unassigned");
    const driverEmail = driverDoc ? driverDoc[DRIVERS_MAP.email] : undefined;

    // Timing
    const bookedStart = toUtcIso(b[BOOKINGS_MAP.bookedStart]);
    const bookedFinish = toUtcIso(b[BOOKINGS_MAP.bookedFinish]);
    const actualStart = b[BOOKINGS_MAP.actualStart] ? toUtcIso(b[BOOKINGS_MAP.actualStart]) : undefined;
    const actualFinish = b[BOOKINGS_MAP.actualFinish] ? toUtcIso(b[BOOKINGS_MAP.actualFinish]) : undefined;

    const bookedMinutes = Number(b[BOOKINGS_MAP.bookedMinutes]) || calculateMinutes(bookedStart, bookedFinish);
    const actualMinutes = b[BOOKINGS_MAP.actualMinutes]
      ? Number(b[BOOKINGS_MAP.actualMinutes])
      : actualStart && actualFinish ? calculateMinutes(actualStart, actualFinish) : undefined;

    const delayMinutes = calculateDelayMinutes(bookedStart, actualStart);
    const delayBand = getDelayBand(delayMinutes);
    const timingTrustworthy = isTimingTrustworthy(b[BOOKINGS_MAP.bookedStart]) && isTimingTrustworthy(b[BOOKINGS_MAP.actualStart]);

    // Financials
    const basePrice = safeMoney(b[BOOKINGS_MAP.basePrice]);
    const extraCharges = safeMoney(b[BOOKINGS_MAP.extraCharges]);
    const overtimeMinutes = Number(b[BOOKINGS_MAP.overtimeMinutes]) || 0;
    const overtimeCharge = safeMoney(b[BOOKINGS_MAP.overtimeCharge]);
    const totalCharges = safeMoney(b[BOOKINGS_MAP.totalCharges]);
    const reconciled = reconcileFinancials(basePrice, extraCharges, overtimeCharge, totalCharges);

    // Status & Workflow
    const status = (b[BOOKINGS_MAP.status] || "READY") as JobStatus;
    const workflowDoc = workflowByJob.get(jobId);
    const currentState = b[BOOKINGS_MAP.currentState] || workflowDoc?.State || status;

    // Evidence & Signatures
    const jobEvidence = evidenceByJob.get(jobId) || [];
    const jobPhotos = photosByJob.get(jobId) || [];
    const signatureDoc = signaturesByJob.get(jobId);

    const { completeness, items } = classifyEvidence(jobId, jobEvidence, jobPhotos, signatureDoc);

    // Activity & Exceptions
    const activity = activityByJob.get(jobId) || [];
    const exceptions = exceptionsByJob.get(jobId) || [];

    if (isDuplicate) {
      exceptions.push({
        type: "DUPLICATE_JOB_ID",
        detail: `Job ID "${jobId}" appears more than once in the Bookings sheet`,
        timestamp: new Date().toISOString()
      });
    }

    if (!timingTrustworthy) {
      exceptions.push({
        type: "TIMING_UNTRUSTWORTHY",
        detail: "Recorded start timestamp has non-London timezone offset (+05:00); timing figures are unreliable",
        timestamp: new Date().toISOString()
      });
    }

    if (!reconciled && status === "COMPLETED") {
      exceptions.push({
        type: "FINANCE_UNRECONCILED",
        detail: "Sum of Base Price, Extra Charges and Overtime does not equal Total Charges",
        timestamp: new Date().toISOString()
      });
    }

    // Workflow completion %
    const workflowCompletionPct = calculateWorkflowCompletionPct(status, completeness, signatureDoc);

    normalizedJobs.push({
      jobId,
      calendarEventId: b[BOOKINGS_MAP.calendarEventId] || "",
      bookedStart,
      bookedFinish,
      actualStart,
      actualFinish,
      bookedMinutes,
      actualMinutes,
      delayMinutes,
      delayBand,
      timingTrustworthy,
      customerName: b[BOOKINGS_MAP.customerName] || "Not recorded",
      customerEmail: b[BOOKINGS_MAP.customerEmail] || undefined,
      customerPhone: b[BOOKINGS_MAP.customerPhone] || undefined,
      pickup: b[BOOKINGS_MAP.pickup] || "Not recorded",
      dropoff: b[BOOKINGS_MAP.dropoff] || "Not recorded",
      crewSize: Number(b[BOOKINGS_MAP.crewSize]) || 1,
      driverInitials,
      driverName,
      driverEmail,
      status,
      currentState,
      workflowCompletionPct,
      basePrice,
      extraCharges,
      overtimeMinutes,
      overtimeCharge,
      totalCharges,
      reconciled,
      paymentMethod: b[BOOKINGS_MAP.paymentMethod] || "Not recorded",
      paymentStatus: b[BOOKINGS_MAP.paymentStatus] || "Not recorded",
      paidOnline: b[BOOKINGS_MAP.paidOnline] === "TRUE" || b[BOOKINGS_MAP.paidOnline] === "true" || b[BOOKINGS_MAP.paidOnline] === "1",
      evidenceCompleteness: completeness,
      evidenceItems: items,
      clientConfirmedName: signatureDoc?.[SIGNATURES_MAP.customerName] || b[BOOKINGS_MAP.clientConfirmedBy] || undefined,
      // signatureUrl must be our authenticated proxy endpoint, not the raw Drive webViewLink
      // stored in "Confirmation Text". The Drive URL is an HTML viewer page that cannot be
      // rendered as an <img> src. The signature evidence item (added by classifyEvidence above)
      // already contains the correct thumbProxyUrl -- use it here for the dedicated field too.
      signatureUrl: (() => {
        const sigItem = items.find(i => i.category === "Signature" && i.thumbProxyUrl);
        return sigItem?.thumbProxyUrl || undefined;
      })(),
      driveFolderId: b[BOOKINGS_MAP.driveFolderId] || undefined,
      driveFolderUrl: b[BOOKINGS_MAP.driveFolderUrl] || undefined,
      activity: activity.sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
      exceptions,
      created: toUtcIso(b[BOOKINGS_MAP.created]),
      updated: toUtcIso(b[BOOKINGS_MAP.updated])
    });
  }

  return normalizedJobs;
}

function classifyEvidence(
  jobId: string,
  evidenceRows: Record<string, string>[],
  photosRows: Record<string, string>[],
  signatureDoc?: Record<string, string>
): {
  completeness: {
    arrival: EvidenceState;
    vanLoaded: EvidenceState;
    emptyVan: EvidenceState;
    organized: EvidenceState;
    signature: EvidenceState;
  };
  items: NormalizedEvidenceItem[];
} {
  const items: NormalizedEvidenceItem[] = [];

  const checkCategory = (category: EvidenceCategory): EvidenceState => {
    // 1. Check Evidence rows (durable queue records)
    const matchingEvidence = evidenceRows.filter(e => e[EVIDENCE_MAP.evidenceType] === category);
    if (matchingEvidence.length > 0) {
      const latest = matchingEvidence[matchingEvidence.length - 1];
      const status = latest[EVIDENCE_MAP.status];
      const driveFileId = latest[EVIDENCE_MAP.driveFileId];

      if (status === "COMPLETED" && driveFileId) {
        items.push({
          id: latest[EVIDENCE_MAP.evidenceId] || `ev-${category}-${jobId}`,
          category,
          state: "COMPLETED",
          fileId: driveFileId,
          driveUrl: latest[EVIDENCE_MAP.driveUrl],
          thumbProxyUrl: `/ops/api/jobs/${encodeURIComponent(jobId)}/photos/${encodeURIComponent(driveFileId)}`,
          fileName: latest[EVIDENCE_MAP.fileName],
          contentType: latest[EVIDENCE_MAP.contentType],
          receivedAt: toUtcIso(latest[EVIDENCE_MAP.received]),
          completedAt: toUtcIso(latest[EVIDENCE_MAP.processingCompleted]),
          provenance: "recorded"
        });
        return "COMPLETED";
      }

      if (status === "FAILED") {
        items.push({
          id: latest[EVIDENCE_MAP.evidenceId] || `ev-${category}-${jobId}`,
          category,
          state: "FAILED",
          error: latest[EVIDENCE_MAP.lastError] || "Photograph upload failed",
          receivedAt: toUtcIso(latest[EVIDENCE_MAP.received]),
          provenance: "recorded"
        });
        return "FAILED";
      }

      if (status === "RECEIVED" || status === "PROCESSING") {
        items.push({
          id: latest[EVIDENCE_MAP.evidenceId] || `ev-${category}-${jobId}`,
          category,
          state: "PROCESSING",
          receivedAt: toUtcIso(latest[EVIDENCE_MAP.received]),
          provenance: "recorded"
        });
        return "PROCESSING";
      }
    }

    // 2. Fallback to Photos log (legacy/direct writes)
    const matchingPhoto = photosRows.find(p => p[PHOTOS_MAP.step] === category);
    if (matchingPhoto && matchingPhoto[PHOTOS_MAP.fileId]) {
      const fileId = matchingPhoto[PHOTOS_MAP.fileId];
      items.push({
        id: `photo-${category}-${jobId}`,
        category,
        state: "COMPLETED",
        fileId,
        driveUrl: matchingPhoto[PHOTOS_MAP.fileUrl],
        thumbProxyUrl: `/ops/api/jobs/${encodeURIComponent(jobId)}/photos/${encodeURIComponent(fileId)}`,
        fileName: matchingPhoto[PHOTOS_MAP.fileName],
        contentType: matchingPhoto[PHOTOS_MAP.contentType],
        receivedAt: toUtcIso(matchingPhoto[PHOTOS_MAP.timestamp]),
        completedAt: toUtcIso(matchingPhoto[PHOTOS_MAP.timestamp]),
        provenance: "recorded"
      });
      return "COMPLETED";
    }

    return "MISSING";
  };

  const arrival = checkCategory("Arrival");
  const vanLoaded = checkCategory("VanLoaded");
  const emptyVan = checkCategory("EmptyVan");
  const organized = checkCategory("Organized");

  // Signature check
  let signature: EvidenceState = "MISSING";
  if (signatureDoc) {
    const confirmation = signatureDoc[SIGNATURES_MAP.confirmationText] || "";
    const driveMatch = confirmation.match(/\/d\/([A-Za-z0-9_-]+)/);
    if (driveMatch) {
      const fileId = driveMatch[1];
      signature = "COMPLETED";
      items.push({
        id: `sig-${jobId}`,
        category: "Signature",
        state: "COMPLETED",
        fileId,
        thumbProxyUrl: `/ops/api/jobs/${encodeURIComponent(jobId)}/photos/${encodeURIComponent(fileId)}`,
        receivedAt: toUtcIso(signatureDoc[SIGNATURES_MAP.timestamp]),
        completedAt: toUtcIso(signatureDoc[SIGNATURES_MAP.timestamp]),
        provenance: "recorded"
      });
    } else if (confirmation.length > 0) {
      signature = "COMPLETED";
    }
  }

  return {
    completeness: {
      arrival,
      vanLoaded,
      emptyVan,
      organized,
      signature
    },
    items
  };
}

function calculateWorkflowCompletionPct(
  status: JobStatus,
  completeness: {
    arrival: EvidenceState;
    vanLoaded: EvidenceState;
    emptyVan: EvidenceState;
    organized: EvidenceState;
    signature: EvidenceState;
  },
  signatureDoc?: Record<string, string>
): number {
  if (status === "COMPLETED") return 100;
  if (status === "CANCELLED") return 0;

  // "Organized" is a retired photo step (see workflow.states.ts) -- no job collects
  // it anymore, so it's excluded here entirely rather than capping every in-progress
  // job's score at 85. completeness.organized is still classified above for any old
  // job that happens to have one, purely informational.
  let score = 10; // Start job initiated
  if (completeness.arrival === "COMPLETED") score += 22;
  if (completeness.vanLoaded === "COMPLETED") score += 23;
  if (completeness.emptyVan === "COMPLETED") score += 22;
  if (completeness.signature === "COMPLETED" || signatureDoc) score += 23;

  return Math.min(score, 100);
}
