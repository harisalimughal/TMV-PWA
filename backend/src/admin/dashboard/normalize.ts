/**
 * Adapted from TMV-Chat-bot's dashboard/server/normalize/normalize-mongo.ts. Same
 * Job -> NormalizedJob builder every dashboard route (jobs, finance, exceptions,
 * activity, summary) consumes -- unchanged from the source, except the one Sheets
 * dependency it had: driver name/email used to come from the Sheets Drivers tab
 * (`listObjects(SHEETS.DRIVERS)`), now from tmv-pwa's own `driver_accounts` Mongo
 * collection (`listDriverProfiles()`) -- the actual point of this whole migration.
 */
import { listDriverProfiles } from "../../auth/driver-account.service";
import { ExtraChargeType } from "../../jobs/job.types";
import { env } from "../../config/env";
import { EvidenceStatus, EvidenceType } from "../../jobs/job.types";
import { fromPounds, Pence, pence } from "../../utils/money";
import { MongoDataset } from "./read";
import { toThumbnailUrl } from "../../storage/cloudinary";
import { reconcileFinancials } from "./finance";
import { calculateDelayMinutes, calculateMinutes, getDelayBand, isTimingTrustworthy, toUtcIso } from "./timezone";
import { ActivityEntry, EvidenceCategory, EvidenceState, JobException, NormalizedEvidenceItem, NormalizedJob } from "./types";

export async function normalizeMongoDataset(dataset: MongoDataset): Promise<NormalizedJob[]> {
  const drivers = await listDriverProfiles();
  const driversByInitials = new Map(drivers.filter(d => d.initials).map(d => [d.initials.toUpperCase(), d]));

  const evidenceByJob = new Map<string, typeof dataset.evidence>();
  for (const e of dataset.evidence) {
    const list = evidenceByJob.get(e.jobId) || [];
    list.push(e);
    evidenceByJob.set(e.jobId, list);
  }

  const scenariosByJob = new Map<string, typeof dataset.scenarioSubmissions>();
  for (const s of dataset.scenarioSubmissions) {
    const list = scenariosByJob.get(s.jobId) || [];
    list.push(s);
    scenariosByJob.set(s.jobId, list);
  }

  const activityByJob = new Map<string, ActivityEntry[]>();
  for (const a of dataset.activity) {
    const list = activityByJob.get(a.jobId) || [];
    list.push({
      timestamp: toUtcIso(a.timestamp),
      driver: a.driver || "Not recorded",
      action: a.action || "",
      fromState: a.fromState || undefined,
      toState: a.toState || undefined,
      detail: a.detail || undefined
    });
    activityByJob.set(a.jobId, list);
  }

  const exceptionsByJob = new Map<string, JobException[]>();
  for (const ex of dataset.exceptions) {
    const list = exceptionsByJob.get(ex.jobId) || [];
    list.push({ type: ex.type || "EXCEPTION", detail: ex.detail || "", timestamp: toUtcIso(ex.timestamp) });
    exceptionsByJob.set(ex.jobId, list);
  }

  const normalizedJobs: NormalizedJob[] = [];
  const seenJobIds = new Set<string>();

  for (const job of dataset.jobs) {
    const jobId = job.jobId;
    if (!jobId) continue;

    const isDuplicate = seenJobIds.has(jobId);
    seenJobIds.add(jobId);

    const driverInitials = (job.driverInitials || "").trim().toUpperCase();
    const driverDoc = driverInitials ? driversByInitials.get(driverInitials) : undefined;
    const driverName = driverDoc ? driverDoc.fullName : (driverInitials || "Unassigned");
    const driverEmail = driverDoc ? driverDoc.email : undefined;

    const bookedStart = toUtcIso(job.bookedStart);
    const bookedFinish = toUtcIso(job.bookedFinish);
    const actualStart = job.actualStart ? toUtcIso(job.actualStart) : undefined;
    const actualFinish = job.actualFinish ? toUtcIso(job.actualFinish) : undefined;

    const bookedMinutes = job.bookedMinutes || calculateMinutes(bookedStart, bookedFinish);
    const actualMinutes = job.actualMinutes || (actualStart && actualFinish ? calculateMinutes(actualStart, actualFinish) : undefined);

    const delayMinutes = calculateDelayMinutes(bookedStart, actualStart);
    const delayBand = getDelayBand(delayMinutes);
    const timingTrustworthy = isTimingTrustworthy(job.bookedStart) && isTimingTrustworthy(job.actualStart);

    const basePrice = safePence(job.basePrice);
    const extraChargeSelections = Array.isArray(job.extraCharges) ? job.extraCharges : [];
    let extraChargesPounds = 0;
    if (extraChargeSelections.includes(ExtraChargeType.CONGESTION)) extraChargesPounds += env.congestionCharge;
    if (extraChargeSelections.includes(ExtraChargeType.TUNNEL)) extraChargesPounds += env.tunnelCharge;
    const extraCharges = extraChargesPounds > 0 ? fromPounds(extraChargesPounds) : pence(0);
    const overtimeMinutes = job.overtimeMinutes || 0;
    const overtimeCharge = safePence(job.overtimeCharge);
    const totalCharges = safePence(job.totalCharges);
    const reconciled = reconcileFinancials(basePrice, extraCharges, overtimeCharge, totalCharges);

    const status = job.status;
    const currentState = job.currentState || status;

    const jobEvidence = evidenceByJob.get(jobId) || [];
    const jobScenarios = scenariosByJob.get(jobId) || [];
    const { completeness, items } = classifyEvidence(jobId, jobEvidence, job.signatureUrl, jobScenarios);

    const activity = activityByJob.get(jobId) || [];
    const exceptions = exceptionsByJob.get(jobId) || [];

    if (isDuplicate) {
      exceptions.push({ type: "DUPLICATE_JOB_ID", detail: `Job ID "${jobId}" appears more than once.`, timestamp: new Date().toISOString() });
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

    const workflowCompletionPct = calculateWorkflowCompletionPct(status, completeness, Boolean(job.signatureUrl));

    normalizedJobs.push({
      jobId,
      calendarEventId: job.calendarEventId || "",
      bookedStart, bookedFinish, actualStart, actualFinish,
      bookedMinutes, actualMinutes, delayMinutes, delayBand, timingTrustworthy,
      customerName: job.customerName || "Not recorded",
      customerEmail: job.customerEmail || undefined,
      customerPhone: job.customerPhone || undefined,
      pickup: job.pickup || "Not recorded",
      dropoff: job.dropoff || "Not recorded",
      crewSize: job.crewSize || 1,
      driverInitials, driverName, driverEmail,
      status, currentState, workflowCompletionPct,
      basePrice, extraChargeSelections, extraCharges, overtimeMinutes, overtimeCharge, totalCharges, reconciled,
      paymentMethod: job.paymentMethod || "Not recorded",
      paymentStatus: job.paymentStatus || "Not recorded",
      managerReviewStatus: job.managerReviewStatus || "Pending",
      managerReviewNote: job.managerReviewNote || "",
      managerReviewedAt: job.managerReviewedAt || undefined,
      paidOnline: Boolean(job.paidOnline),
      evidenceCompleteness: completeness,
      evidenceItems: items,
      clientConfirmedName: job.clientConfirmedBy || undefined,
      signatureUrl: job.signatureUrl || undefined,
      driveFolderId: undefined,
      driveFolderUrl: undefined,
      activity: activity.sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
      exceptions,
      rawTitle: job.rawTitle || "",
      created: toUtcIso(job.createdAt),
      updated: toUtcIso(job.updatedAt)
    });
  }

  return normalizedJobs;
}

function safePence(value: unknown): Pence {
  if (value === undefined || value === null || value === "") return pence(0);
  try {
    return fromPounds(value as number | string);
  } catch {
    return pence(0);
  }
}

const SCENARIO_LABEL: Record<string, string> = {
  checkin: "Check In", checkout: "Check Out", parking: "Parking Liability", liability: "Liability Report"
};

function classifyEvidence(
  jobId: string,
  evidenceRows: MongoDataset["evidence"],
  signatureUrl: string | undefined,
  scenarios: MongoDataset["scenarioSubmissions"]
): { completeness: NormalizedJob["evidenceCompleteness"]; items: NormalizedEvidenceItem[] } {
  const items: NormalizedEvidenceItem[] = [];

  const checkCategory = (type: EvidenceType, category: EvidenceCategory): EvidenceState => {
    const matching = evidenceRows.filter(e => e.evidenceType === type);
    if (!matching.length) return "MISSING";
    const latest = matching[matching.length - 1];

    if (latest.status === EvidenceStatus.COMPLETED && latest.cloudinaryUrl) {
      items.push({
        id: latest.evidenceId || `ev-${category}-${jobId}`,
        category, state: "COMPLETED",
        fileId: latest.cloudinaryPublicId,
        driveUrl: latest.cloudinaryUrl,
        thumbProxyUrl: toThumbnailUrl(latest.cloudinaryUrl),
        fileName: latest.fileName,
        contentType: latest.contentType,
        receivedAt: toUtcIso(latest.receivedAt),
        completedAt: toUtcIso(latest.processingCompletedAt),
        provenance: "recorded"
      });
      return "COMPLETED";
    }
    if (latest.status === EvidenceStatus.FAILED) {
      items.push({
        id: latest.evidenceId || `ev-${category}-${jobId}`,
        category, state: "FAILED",
        error: latest.lastError || "Photograph upload failed",
        receivedAt: toUtcIso(latest.receivedAt),
        provenance: "recorded"
      });
      return "FAILED";
    }
    items.push({
      id: latest.evidenceId || `ev-${category}-${jobId}`,
      category, state: "PROCESSING",
      receivedAt: toUtcIso(latest.receivedAt),
      provenance: "recorded"
    });
    return "PROCESSING";
  };

  const arrival = checkCategory("Arrival", "Arrival");
  const vanLoaded = checkCategory("VanLoaded", "VanLoaded");
  const emptyVan = checkCategory("EmptyVan", "EmptyVan");
  // "Organized" is a retired photo step -- no job collects it anymore, kept only
  // because NormalizedJob's shape still has the field.
  const organized: EvidenceState = "MISSING";

  let signature: EvidenceState = "MISSING";
  if (signatureUrl) {
    signature = "COMPLETED";
    items.push({
      id: `sig-${jobId}`,
      category: "Signature", state: "COMPLETED",
      driveUrl: signatureUrl,
      thumbProxyUrl: toThumbnailUrl(signatureUrl),
      provenance: "recorded"
    });
  }

  for (const submission of scenarios) {
    const label = SCENARIO_LABEL[submission.scenario] || submission.scenario;
    submission.photoUrls.forEach((url, index) => {
      items.push({
        id: `${submission.scenario}-photo-${index}-${jobId}`,
        category: "Documents", state: "COMPLETED",
        driveUrl: url, thumbProxyUrl: toThumbnailUrl(url),
        fileName: `${label} photo ${index + 1}`,
        receivedAt: toUtcIso(submission.submittedAt),
        completedAt: toUtcIso(submission.submittedAt),
        provenance: "recorded"
      });
    });
    if (submission.signatureUrl) {
      items.push({
        id: `${submission.scenario}-signature-${jobId}`,
        category: "Documents", state: "COMPLETED",
        driveUrl: submission.signatureUrl, thumbProxyUrl: toThumbnailUrl(submission.signatureUrl),
        fileName: `${label} signature`,
        receivedAt: toUtcIso(submission.submittedAt),
        completedAt: toUtcIso(submission.submittedAt),
        provenance: "recorded"
      });
    }
  }

  return { completeness: { arrival, vanLoaded, emptyVan, organized, signature }, items };
}

function calculateWorkflowCompletionPct(
  status: string,
  completeness: NormalizedJob["evidenceCompleteness"],
  hasSignature: boolean
): number {
  if (status === "COMPLETED") return 100;
  if (status === "CANCELLED") return 0;

  let score = 10;
  if (completeness.arrival === "COMPLETED") score += 22;
  if (completeness.vanLoaded === "COMPLETED") score += 23;
  if (completeness.emptyVan === "COMPLETED") score += 22;
  if (completeness.signature === "COMPLETED" || hasSignature) score += 23;

  return Math.min(score, 100);
}
