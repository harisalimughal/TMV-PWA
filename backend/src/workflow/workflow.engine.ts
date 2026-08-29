import { env } from "../config/env";
import { getJob } from "../db/jobs.repo";
import { readEvidenceSummary } from "../db/evidence.repo";
import { appendActivity } from "../db/activity.repo";
import { getSetting } from "../google/sheets";
import { EvidenceType, ExtraChargeType, Job } from "../jobs/job.types";
import { uploadEvidence } from "../jobs/evidence.service";
import { completeJob, getJobForDriver, getNextJobForDriver, saveJob, startJob } from "../jobs/jobs.service";
import { WorkflowState, nextAfterPhoto, PHOTO_STATES } from "./workflow.states";
import {
  assertState, validateCurrency,
  validateExtraCharges, validateMinutes, validatePaymentMethod, ValidationError
} from "./validation.engine";
import { log, setContext } from "../utils/logger";
import { equalPence, formatPounds, fromPounds } from "../utils/money";
import { sendJobCompletionEmail, sendReviewRequestEmail } from "../google/gmail";
import { JOB_COMPLETION_EMAIL_TEMPLATE, REVIEW_REQUEST_EMAIL_TEMPLATE } from "../notifications/message";

const DEFAULT_CUSTOMER_CONFIRMATION_TEXT =
  "By signing below, you confirm that you have inspected the van, that it is empty, that all items have been delivered, and that no items have been left behind. You also confirm that the removal service has been completed to your satisfaction.";

/** Same Settings-sheet key TMV-Chat-bot's admin dashboard already edits
 * ("Customer Confirmation Text") -- an ops-side wording change there takes effect
 * here too, no separate tmv-pwa admin surface needed. */
export async function getConfirmationText(): Promise<string> {
  return getSetting("CUSTOMER_CONFIRMATION_TEXT", DEFAULT_CUSTOMER_CONFIRMATION_TEXT);
}

function extraChargeAmount(job: Job): number {
  let total = 0;
  if (job.extraCharges.includes(ExtraChargeType.CONGESTION)) total += env.congestionCharge;
  if (job.extraCharges.includes(ExtraChargeType.TUNNEL)) total += env.tunnelCharge;
  total += job.overtimeCharge;
  return total;
}

export function suggestedTotal(job: Job): number {
  return Math.round((job.basePrice + extraChargeAmount(job)) * 100) / 100;
}

export async function beginJob(jobId: string, identifier: string): Promise<Job> {
  return startJob(jobId, identifier);
}

const PHOTO_FOLDER: Record<string, EvidenceType> = {
  [WorkflowState.WAITING_ARRIVAL_PHOTO]: "Arrival",
  [WorkflowState.WAITING_LOADED_PHOTO]: "VanLoaded",
  [WorkflowState.WAITING_EMPTY_VAN_PHOTO]: "EmptyVan"
};

export interface UploadedPhoto {
  buffer: Buffer;
  contentType: string;
  fileName: string;
}

/**
 * Critical path for a photo upload.
 *
 * Synchronous end to end: validate -> upload to Cloudinary -> advance state -> save.
 * The old version accepted a Chat attachment *reference* and returned before the photo
 * was actually in Drive (a background worker finished the job later) -- that two-phase
 * design existed because Chat attachments have to be downloaded from Chat first. The
 * PWA's camera upload already has the real bytes in the request, so there's nothing to
 * defer; by the time this returns, the photo really is in Cloudinary.
 */
export async function handlePhotoStep(
  jobId: string,
  identifier: string,
  photos: UploadedPhoto[]
): Promise<Job> {
  setContext({ jobId });
  const { job, driver } = await getJobForDriver(jobId, identifier);

  const state = job.currentState as WorkflowState;
  if (!PHOTO_STATES.has(state)) {
    throw new ValidationError("A photo is not expected at the current workflow step.");
  }
  if (!photos.length) throw new ValidationError("Please attach at least one image.");
  if (state === WorkflowState.WAITING_LOADED_PHOTO && photos.length > 2) {
    throw new ValidationError("Proof Of Van Loaded accepts 1 or 2 photos at this step.");
  }

  const evidenceType = PHOTO_FOLDER[state];
  const actor = driver.email || driver.chatUserName;

  for (const photo of photos) {
    await uploadEvidence(job, actor, evidenceType, photo.buffer, photo.contentType, photo.fileName);
  }

  const from = job.currentState;
  job.currentState = nextAfterPhoto(state);

  // "Job start"/"job end" now track the actual physical move (arrival -> unloaded),
  // not the administrative button-tapping around it -- set once, on the photo that
  // marks each boundary, not overwritten on a later redo of the same step.
  const now = new Date().toISOString();
  if (evidenceType === "Arrival" && !job.actualStart) job.actualStart = now;
  if (evidenceType === "EmptyVan" && !job.actualFinish) job.actualFinish = now;

  return saveJob(job, driver, `PHOTO_${evidenceType.toUpperCase()}_RECEIVED`, from, `${photos.length} file(s)`);
}

export async function getActiveJob(identifier: string) {
  const { job, driver } = await getNextJobForDriver(identifier);
  if (!job || job.status !== "IN_PROGRESS") {
    throw new ValidationError("You do not have an active job.");
  }
  return { job, driver };
}

/** Fire-and-forget, same as the original -- a slow/failed customer email must never
 * hold up (or fail) the driver's completion action. Fetches the live template from
 * the Settings sheet (same key TMV-Chat-bot's dashboard edits) each time rather than
 * caching it, so an ops edit takes effect on the very next completion. */
function sendCompletionEmailIfAny(job: Job, jobId: string): void {
  if (!job.customerEmail) return;
  getSetting("JOB_COMPLETION_EMAIL_TEXT", JOB_COMPLETION_EMAIL_TEMPLATE)
    .then(template => sendJobCompletionEmail(job, template))
    .catch(err => log.warn("job completion email failed (non-fatal)", { job_id: jobId, error: String(err) }));
}

export async function handleAction(
  action: string,
  jobId: string,
  identifier: string,
  input: Record<string, string[]>
): Promise<Job> {
  setContext({ jobId });
  if (action === "START_JOB") return beginJob(jobId, identifier);

  const { job, driver } = await getJobForDriver(jobId, identifier);
  const actor = driver.email || driver.chatUserName;

  switch (action) {
    case "FINISH_MOVE": {
      assertState(job.currentState, WorkflowState.IN_PROGRESS);
      const from = job.currentState;
      // 2nd issues check runs right after Finish Move, before Extra Charges.
      job.currentState = WorkflowState.WAITING_EMPTY_VAN_ISSUES_CHECK;
      return saveJob(job, driver, action, from);
    }

    case "SUBMIT_EXTRA_CHARGES": {
      assertState(job.currentState, WorkflowState.WAITING_EXTRA_CHARGES);
      const values = validateExtraCharges(input.extra_charges ?? []);
      job.extraCharges = values;
      const from = job.currentState;

      // Minimise typing: a driver who selected "No Extras Time" skips straight to
      // totals instead of being asked for overtime minutes and typing 0.
      const claimsOvertime = values.includes(ExtraChargeType.EXTRA_TIME);
      if (!claimsOvertime) {
        job.overtimeMinutes = 0;
        job.overtimeCharge = 0;
      }
      job.currentState = claimsOvertime ? WorkflowState.WAITING_OVERTIME : WorkflowState.WAITING_TOTAL_CHARGES;

      return saveJob(job, driver, action, from, values.join(", "));
    }

    case "SUBMIT_OVERTIME": {
      assertState(job.currentState, WorkflowState.WAITING_OVERTIME);
      const driverMinutes = validateMinutes(input.overtime_minutes?.[0] ?? "");

      // Overtime reconciliation: cross-check the driver's entered overtime against
      // actual server-recorded timestamps. If the server elapsed time implies MORE
      // overtime than the driver entered, use the server figure to prevent
      // under-reporting.
      let reconciledMinutes = driverMinutes;
      if (job.actualStart && job.bookedMinutes > 0) {
        const elapsedNowMinutes = Math.round((Date.now() - new Date(job.actualStart).getTime()) / 60_000);
        const serverOvertimeEstimate = Math.max(0, elapsedNowMinutes - job.bookedMinutes);
        const discrepancy = serverOvertimeEstimate - driverMinutes;
        if (discrepancy > 0) {
          reconciledMinutes = serverOvertimeEstimate;
          await appendActivity({
            jobId, driver: actor, action: "OVERTIME_RECONCILED",
            detail: `Driver entered ${driverMinutes} min; server timestamps indicate ${serverOvertimeEstimate} min elapsed — using server estimate.`
          });
        } else if (Math.abs(discrepancy) >= 15) {
          await appendActivity({
            jobId, driver: actor, action: "OVERTIME_NOTE",
            detail: `Driver entered ${driverMinutes} min; server timestamps indicate ~${serverOvertimeEstimate} min elapsed.`
          });
        }
      }

      job.overtimeMinutes = reconciledMinutes;

      // Same Settings-sheet keys the original Chat-bot workflow read (see
      // TMV-Chat-bot's workflow.engine.ts) -- ops can override any of these from a
      // Settings row without a redeploy; env.ts's values are only the fallback.
      const otGraceStr = await getSetting("OVERTIME_GRACE_MINS", String(env.overtimeGraceMinutes));
      const otGrace = parseInt(otGraceStr, 10) || 0;

      let rateKey = "CREW_RATE_2_MAN";
      let rateFallback = env.crewRate2Man;
      if (job.crewSize === 1) {
        rateKey = "CREW_RATE_1_MAN";
        rateFallback = env.crewRate1Man;
      } else if (job.crewSize === 3) {
        rateKey = "CREW_RATE_3_MAN";
        rateFallback = env.crewRate3Man;
      }

      const isPackingService = job.extraCharges.includes(ExtraChargeType.PACKING);
      const defaultRateStr = isPackingService
        ? await getSetting("PACKING_RATE", String(env.packingRate))
        : await getSetting(rateKey, String(rateFallback));
      const defaultRate = parseFloat(defaultRateStr) || rateFallback;

      const otRateStr = await getSetting("OVERTIME_RATE_PER_30", "");
      const otRate = otRateStr ? (parseFloat(otRateStr) || defaultRate) : (env.overtimeRatePer30Minutes || defaultRate);

      const unitStr = isPackingService
        ? await getSetting("PACKING_BILLING_UNIT", env.packingBillingUnit)
        : await getSetting("CREW_BILLING_UNIT", env.crewBillingUnit);
      const unitMins = unitStr.toLowerCase().includes("hour") ? 60 : 30;

      const chargeableMinutes = Math.max(0, reconciledMinutes - otGrace);
      job.overtimeCharge = chargeableMinutes === 0 ? 0 : Math.ceil(chargeableMinutes / unitMins) * otRate;

      const from = job.currentState;
      job.currentState = WorkflowState.WAITING_TOTAL_CHARGES;
      return saveJob(job, driver, action, from, `${reconciledMinutes} minutes / ${formatPounds(job.overtimeCharge)}`);
    }

    case "SUBMIT_TOTAL_CHARGES": {
      assertState(job.currentState, WorkflowState.WAITING_TOTAL_CHARGES);
      const total = validateCurrency(input.total_charges?.[0] ?? "");
      job.totalCharges = total;
      const suggested = suggestedTotal(job);
      const from = job.currentState;
      job.currentState = WorkflowState.WAITING_PAYMENT;
      const mismatch = equalPence(fromPounds(total), fromPounds(suggested))
        ? formatPounds(total)
        : `Entered ${formatPounds(total)}; suggested ${formatPounds(suggested)}`;
      return saveJob(job, driver, action, from, mismatch);
    }

    case "SUBMIT_PAYMENT": {
      assertState(job.currentState, WorkflowState.WAITING_PAYMENT);
      const method = validatePaymentMethod(input.payment_method?.[0] ?? "");
      job.paymentMethod = method;
      job.paymentStatus = method === "Invoice" ? "Outstanding" : "Recorded";
      const from = job.currentState;
      // After Payment the next step is the Empty Van photo directly.
      job.currentState = WorkflowState.WAITING_EMPTY_VAN_PHOTO;
      return saveJob(job, driver, action, from, method);
    }

    case "ISSUES_NONE":
    case "ISSUES_YES": {
      const from = job.currentState as WorkflowState;
      const noneTarget: Partial<Record<WorkflowState, WorkflowState>> = {
        [WorkflowState.WAITING_ARRIVAL_ISSUES_CHECK]: WorkflowState.WAITING_LOADED_PHOTO,
        [WorkflowState.WAITING_EMPTY_VAN_ISSUES_CHECK]: WorkflowState.WAITING_EXTRA_CHARGES
      };
      const yesTarget: Partial<Record<WorkflowState, WorkflowState>> = {
        [WorkflowState.WAITING_ARRIVAL_ISSUES_CHECK]: WorkflowState.WAITING_ARRIVAL_ISSUES_CHOICE,
        [WorkflowState.WAITING_EMPTY_VAN_ISSUES_CHECK]: WorkflowState.WAITING_EMPTY_VAN_ISSUES_CHOICE
      };
      const target = (action === "ISSUES_NONE" ? noneTarget : yesTarget)[from];
      if (!target) throw new ValidationError(`This action is not valid at the current step (${from}).`);
      job.currentState = target;
      return saveJob(job, driver, action, from);
    }

    // The dedicated Parking Liability / Liability Report detour forms (launched from
    // ISSUES_YES in the original Chat bot) aren't built in this pass -- ISSUES_YES
    // currently just records that an issue was flagged and resumes the same place NONE
    // would. See the note in this project's README about deferred scope.
    case "ISSUES_RESUME": {
      const from = job.currentState as WorkflowState;
      const target =
        from === WorkflowState.WAITING_ARRIVAL_ISSUES_CHOICE ? WorkflowState.WAITING_LOADED_PHOTO
        : from === WorkflowState.WAITING_EMPTY_VAN_ISSUES_CHOICE ? WorkflowState.WAITING_EXTRA_CHARGES
        : null;
      if (!target) throw new ValidationError(`This action is not valid at the current step (${from}).`);
      job.currentState = target;
      return saveJob(job, driver, action, from);
    }

    case "REVIEW_NONE":
    case "REVIEW_YES": {
      assertState(job.currentState, WorkflowState.WAITING_REVIEW_CHECK);
      const from = job.currentState;
      if (action === "REVIEW_YES") {
        job.currentState = WorkflowState.WAITING_REVIEW_SEND;
        return saveJob(job, driver, action, from);
      }
      sendCompletionEmailIfAny(job, jobId);
      return completeJob(jobId, identifier);
    }

    case "SEND_REVIEW_EMAIL": {
      assertState(job.currentState, WorkflowState.WAITING_REVIEW_SEND);
      const from = job.currentState;
      if (job.customerEmail) {
        try {
          const reviewTemplate = await getSetting("REVIEW_REQUEST_EMAIL_TEXT", REVIEW_REQUEST_EMAIL_TEMPLATE);
          await sendReviewRequestEmail(job, reviewTemplate);
          await appendActivity({
            jobId, driver: actor, action: "CLIENT_REVIEW_EMAIL_SENT", fromState: from, toState: from, detail: job.customerEmail
          });
        } catch (error) {
          await appendActivity({
            jobId, driver: actor, action: "CLIENT_REVIEW_EMAIL_FAILED", fromState: from, toState: from,
            detail: error instanceof Error ? error.message : String(error)
          });
        }
      }
      sendCompletionEmailIfAny(job, jobId);
      return completeJob(jobId, identifier);
    }

    case "GO_BACK": {
      const from = job.currentState;
      const target = BACK_TARGET[from as WorkflowState];
      if (!target) throw new ValidationError("There's no previous step to go back to here.");
      job.currentState = target;
      return saveJob(job, driver, action, from);
    }

    case "COMPLETE_JOB": {
      await assertCompletionGate(jobId, job);
      sendCompletionEmailIfAny(job, jobId);
      return completeJob(jobId, identifier);
    }

    default:
      throw new ValidationError(`Unknown action: ${action}`);
  }
}

/** BACK button targets for the data-entry steps -- lets a driver who mis-typed
 *  something return and redo it. Total Charges' predecessor is ambiguous (Overtime
 *  only runs if extra time was claimed), so it always goes back to Extra Charges, the
 *  fixed branch point, rather than trying to reconstruct which path was actually taken. */
const BACK_TARGET: Partial<Record<WorkflowState, WorkflowState>> = {
  [WorkflowState.WAITING_EXTRA_CHARGES]: WorkflowState.WAITING_EMPTY_VAN_ISSUES_CHECK,
  [WorkflowState.WAITING_OVERTIME]: WorkflowState.WAITING_EXTRA_CHARGES,
  [WorkflowState.WAITING_TOTAL_CHARGES]: WorkflowState.WAITING_EXTRA_CHARGES,
  [WorkflowState.WAITING_PAYMENT]: WorkflowState.WAITING_TOTAL_CHARGES
};

export class SignatureAlreadyCapturedError extends Error {
  constructor() {
    super("This job's signature has already been captured.");
    this.name = "SignatureAlreadyCapturedError";
  }
}

/**
 * Records the customer's signature, captured in-app by the driver handing their phone
 * to the customer (the original design had a separate customer-facing signature-pad
 * link, sent by SMS/email to the customer's own device -- out of scope for this pass;
 * see the README). The image itself is uploaded through the same Cloudinary evidence
 * pipeline as a photo (evidenceType handling lives in the route), and this just records
 * the resulting URL on the job and advances the workflow.
 */
export async function submitDrawnSignature(
  jobId: string,
  identifier: string,
  customerName: string,
  signatureUrl: string
): Promise<Job> {
  const { job, driver } = await getJobForDriver(jobId, identifier);
  if (job.currentState !== WorkflowState.WAITING_CLIENT_CONFIRMATION) {
    throw new SignatureAlreadyCapturedError();
  }

  const name = customerName.trim() || "Customer";
  const from = job.currentState;
  job.clientConfirmedBy = name;
  job.signatureUrl = signatureUrl;
  job.currentState = WorkflowState.WAITING_REVIEW_CHECK;

  return saveJob(job, driver, "SUBMIT_CLIENT_CONFIRMATION", from, name);
}

/**
 * Thrown when the only thing standing between the driver and completion is background
 * work that hasn't finished yet. In practice this almost never fires now (evidence
 * upload is synchronous), but the shape is kept so the completion gate's contract with
 * the frontend doesn't change if that ever stops being true.
 */
export class EvidencePendingError extends Error {
  constructor(message: string, readonly pending: string[]) {
    super(message);
    this.name = "EvidencePendingError";
  }
}

export class EvidenceFailedError extends Error {
  constructor(message: string, readonly failedTypes: EvidenceType[]) {
    super(message);
    this.name = "EvidenceFailedError";
  }
}

const REQUIRED_EVIDENCE: Array<{ type: EvidenceType; label: string; minimum: number }> = [
  { type: "Arrival", label: "arrival photo", minimum: 1 },
  { type: "VanLoaded", label: "van-loaded photo", minimum: 1 },
  { type: "EmptyVan", label: "empty-van photo", minimum: 1 }
];

/**
 * The guarantee that makes completion mean something. Only evidence that reached
 * COMPLETED counts -- which, with a synchronous upload, means the file is verifiably in
 * Cloudinary with a recorded URL by the time the request that uploaded it returned.
 */
async function assertCompletionGate(jobId: string, job: Job): Promise<void> {
  const { completed, pending, failed, hasSignature } = await readEvidenceSummary(jobId);

  const missing: string[] = [];
  const stillProcessing: string[] = [];
  const permanentlyFailed: EvidenceType[] = [];

  if (!job.actualStart) missing.push("actual start timestamp");

  for (const requirement of REQUIRED_EVIDENCE) {
    const done = completed[requirement.type] ?? 0;
    if (done >= requirement.minimum) continue;

    const inFlight = pending[requirement.type] ?? 0;
    const broken = failed[requirement.type] ?? 0;

    if (inFlight > 0) stillProcessing.push(requirement.label);
    else if (broken > 0) permanentlyFailed.push(requirement.type);
    else missing.push(requirement.label);
  }

  if (!job.paymentMethod) missing.push("payment method");
  if (!hasSignature) missing.push("client confirmation");

  if (missing.length) {
    throw new ValidationError(`Cannot complete job. Missing: ${missing.join(", ")}.`);
  }
  if (permanentlyFailed.length) {
    throw new EvidenceFailedError(
      `We couldn't save your ${permanentlyFailed.map(labelFor).join(" and ")}. Please retake and upload again.`,
      permanentlyFailed
    );
  }
  if (stillProcessing.length) {
    throw new EvidencePendingError(
      `We're still processing ${stillProcessing.length} required photo${stillProcessing.length > 1 ? "s" : ""}. ` +
        "Please wait a moment before completing this job.",
      stillProcessing
    );
  }
}

function labelFor(type: EvidenceType): string {
  return REQUIRED_EVIDENCE.find(requirement => requirement.type === type)?.label ?? type;
}
