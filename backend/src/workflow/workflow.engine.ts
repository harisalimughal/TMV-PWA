import { env } from "../config/env";
import {
  activityWrite, commitWrites, driverFlowWrite, evidenceWrite, getJob, getSetting, jobWrite, listEvidenceForJob,
  paymentWrite, readEvidenceSummary, signatureWrite, SheetWrite, workflowWrite
} from "../google/sheets";
import {
  ChatAttachment, EvidenceRecord, EvidenceStatus, EvidenceType, ExtraChargeType, Job
} from "../jobs/job.types";
import { buildReceivedEvidence, markRequeued } from "../jobs/evidence.service";
import { completeJob, getJobForDriver, getNextJobForDriver, saveJob, startJob } from "../jobs/jobs.service";
import { enqueueAll } from "../queue/queue.service";
import { ProcessJobImageTask } from "../queue/queue.types";
import { WorkflowState, nextAfterPhoto, PHOTO_STATES } from "./workflow.states";
import {
  assertState, validateCurrency,
  validateExtraCharges, validateMinutes, validatePaymentMethod, ValidationError
} from "./validation.engine";
import { log, setContext } from "../utils/logger";
import { equalPence, formatPounds, fromPounds } from "../utils/money";
import { sendJobCompletionEmail, sendReviewRequestEmail } from "../google/gmail";
import { JOB_COMPLETION_EMAIL_TEMPLATE, REVIEW_REQUEST_EMAIL_TEMPLATE } from "../notifications/message";

export const CUSTOMER_CONFIRMATION_TEXT =
  "By signing below, you confirm that you have inspected the van, that it is empty, that all items have been delivered, and that no items have been left behind. You also confirm that the removal service has been completed to your satisfaction.";

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

export interface PhotoAcceptance {
  job: Job;
  /** Evidence accepted onto the queue. Never "saved" — that is the worker's word. */
  accepted: EvidenceRecord[];
  /** True when at least one enqueue failed and the reaper is the recovery path. */
  degraded: boolean;
}

/**
 * Critical path for a photo upload.
 *
 * Everything here is validation plus one Sheets batch. No media download, no Drive call,
 * no Gmail. The photo is not in Drive when this returns, and the driver is told exactly
 * that.
 */
export async function handlePhotoStep(
  identifier: string,
  attachments: ChatAttachment[]
): Promise<PhotoAcceptance> {
  const { job, driver } = await getActiveJob(identifier);
  setContext({ jobId: job.jobId });

  const state = job.currentState as WorkflowState;
  if (!PHOTO_STATES.has(state)) {
    throw new ValidationError("A photo is not expected at the current workflow step.");
  }
  if (!attachments.length) throw new ValidationError("Please attach at least one image.");
  if (state === WorkflowState.WAITING_LOADED_PHOTO && attachments.length > 2) {
    throw new ValidationError("Proof Of Van Loaded accepts 1 or 2 photos at this step.");
  }

  const evidenceType = PHOTO_FOLDER[state];
  const actor = driver.email || driver.chatUserName;

  // Metadata-only validation. Throws before anything is persisted if the attachment can
  // never be processed, so the driver learns immediately instead of via a failure card.
  const { records, writes } = buildReceivedEvidence(job.jobId, actor, evidenceType, attachments);

  const from = job.currentState;
  job.currentState = nextAfterPhoto(state);

  // "Job start"/"job end" now track the actual physical move (arrival -> unloaded),
  // not the administrative button-tapping around it -- set once, on the photo that
  // marks each boundary, not overwritten on a later redo of the same step.
  const now = new Date().toISOString();
  if (evidenceType === "Arrival" && !job.actualStart) job.actualStart = now;
  if (evidenceType === "EmptyVan" && !job.actualFinish) job.actualFinish = now;

  const extras: SheetWrite[] = [
    ...writes,
    driverFlowWrite({
      jobId: job.jobId,
      driver: actor,
      field: `${evidenceType} Photo`,
      value: `${records.length} image(s) received; processing`,
      state: job.currentState
    })
  ];

  // Evidence rows, the driver-flow row, the booking row, the workflow row and the
  // activity row are one batchUpdate. After this returns, the photo is recoverable even
  // if the process dies on the next line.
  await saveJob(job, driver, `PHOTO_${evidenceType.toUpperCase()}_RECEIVED`, from, `${records.length} file(s)`, extras);

  const results = await enqueueAll(
    records.map(record => ({
      type: "PROCESS_JOB_IMAGE",
      evidenceId: record.evidenceId,
      jobId: job.jobId
    }) satisfies ProcessJobImageTask)
  );
  const degraded = results.some(result => !result.queued);
  if (degraded) {
    log.warn("evidence queued to reaper fallback", { job_id: job.jobId, evidence: records.length });
  }

  return { job, accepted: records, degraded };
}

/**
 * Driver-initiated retry of failed evidence. Resets the attempt budget and re-queues.
 * Used by the RETRY button on the failure card.
 */
export async function retryFailedEvidence(jobId: string, identifier: string): Promise<Job> {
  const { job, driver } = await getJobForDriver(jobId, identifier, { fresh: true });
  const failed = (await listEvidenceForJob(jobId)).filter(record => record.status === EvidenceStatus.FAILED);
  if (!failed.length) throw new ValidationError("There is no failed photo to retry on this job.");

  const requeued = failed.map(markRequeued);
  await commitWrites([
    ...requeued.map(evidenceWrite),
    activityWrite({
      jobId,
      driver: driver.email || driver.chatUserName,
      action: "EVIDENCE_RETRY_REQUESTED",
      fromState: job.currentState,
      toState: job.currentState,
      detail: failed.map(record => record.evidenceId).join(", ")
    })
  ]);

  await enqueueAll(
    requeued.map(record => ({
      type: "PROCESS_JOB_IMAGE",
      evidenceId: record.evidenceId,
      jobId
    }) satisfies ProcessJobImageTask),
    // Fresh dedupe id: the original task name is spent.
    {}
  ).catch(() => undefined);

  return job;
}

/**
 * Sends the driver back to a photo step so they can re-upload evidence that failed
 * permanently (expired Chat media, corrupt file). The failed records stay on the sheet
 * as an audit record of the attempt.
 */
export async function reopenPhotoStep(jobId: string, identifier: string, evidenceType: EvidenceType): Promise<Job> {
  const { job, driver } = await getJobForDriver(jobId, identifier, { fresh: true });
  const target = Object.entries(PHOTO_FOLDER).find(([, type]) => type === evidenceType)?.[0];
  if (!target) throw new ValidationError(`Unknown evidence type: ${evidenceType}`);

  const from = job.currentState;
  job.currentState = target;
  return saveJob(job, driver, "PHOTO_STEP_REOPENED", from, evidenceType);
}

export async function getActiveJob(identifier: string) {
  // No Calendar sync here: mid-workflow steps only ever read state that Sheets
  // already holds. fresh: true because a photo upload is a read-modify-write, exactly
  // like a card click — a cached snapshot could predate a step the driver just did
  // seconds earlier and silently overwrite it on save.
  const { job, driver } = await getNextJobForDriver(identifier, { fresh: true });
  if (!job || job.status !== "IN_PROGRESS") {
    throw new ValidationError("You do not have an active job. Type 'Next Job' to get your next job.");
  }
  return { job, driver };
}

export async function handleAction(
  action: string,
  jobId: string,
  identifier: string,
  input: Record<string, string[]>
): Promise<Job> {
  setContext({ jobId });
  if (action === "START_JOB") return beginJob(jobId, identifier);

  // fresh: true — every case below reads job, mutates a few fields, and writes the
  // whole row back. A cached read here can start from a snapshot taken before the
  // driver's previous step (seconds earlier, well inside the Sheets cache TTL)
  // finished writing, and silently clobber that step's change when this one saves.
  const { job, driver } = await getJobForDriver(jobId, identifier, { fresh: true });
  const actor = driver.email || driver.chatUserName;

  switch (action) {
    case "FINISH_MOVE": {
      assertState(job.currentState, WorkflowState.IN_PROGRESS);
      const from = job.currentState;
      // 2nd issues check now runs right after Finish Move, before Extra Charges
      job.currentState = WorkflowState.WAITING_EMPTY_VAN_ISSUES_CHECK;
      return saveJob(job, driver, action, from);
    }

    case "SUBMIT_EXTRA_CHARGES": {
      assertState(job.currentState, WorkflowState.WAITING_EXTRA_CHARGES);
      const values = validateExtraCharges(input.extra_charges ?? []);
      job.extraCharges = values;
      const from = job.currentState;

      /*
       * §47: minimise typing. The overtime step used to run unconditionally, so a
       * driver who selected "No Extras Time" was still asked for overtime minutes and
       * had to type 0. Skip straight to totals unless extra time was actually claimed.
       */
      const claimsOvertime = values.includes(ExtraChargeType.EXTRA_TIME);
      if (!claimsOvertime) {
        job.overtimeMinutes = 0;
        job.overtimeCharge = 0;
      }
      job.currentState = claimsOvertime ? WorkflowState.WAITING_OVERTIME : WorkflowState.WAITING_TOTAL_CHARGES;

      return saveJob(job, driver, action, from, values.join(", "), [
        driverFlowWrite({
          jobId, driver: actor, field: "Any Extra charges", value: values.join(", "), state: job.currentState
        })
      ]);
    }

    case "SUBMIT_OVERTIME": {
      assertState(job.currentState, WorkflowState.WAITING_OVERTIME);
      const driverMinutes = validateMinutes(input.overtime_minutes?.[0] ?? "");

      // Overtime reconciliation (Req 10): cross-check the driver's entered overtime
      // against actual server-recorded timestamps. If the server elapsed time implies
      // MORE overtime than the driver entered, use the server figure to prevent
      // under-reporting. A discrepancy >= 15 min is logged for admin review.
      let reconciledMinutes = driverMinutes;
      const reconciliationExtras: SheetWrite[] = [];
      if (job.actualStart && job.bookedMinutes > 0) {
        const elapsedNowMinutes = Math.round(
          (Date.now() - new Date(job.actualStart).getTime()) / 60_000
        );
        const serverOvertimeEstimate = Math.max(0, elapsedNowMinutes - job.bookedMinutes);
        const discrepancy = serverOvertimeEstimate - driverMinutes;
        if (discrepancy > 0) {
          // Server says the job has run longer than the driver reported — use the
          // server figure to ensure the customer is correctly charged.
          reconciledMinutes = serverOvertimeEstimate;
          reconciliationExtras.push(activityWrite({
            jobId, driver: actor, action: "OVERTIME_RECONCILED",
            detail: `Driver entered ${driverMinutes} min; server timestamps indicate ${serverOvertimeEstimate} min elapsed — using server estimate.`
          }));
        } else if (Math.abs(discrepancy) >= 15) {
          // Driver entered more than server estimate — log for transparency but trust driver.
          reconciliationExtras.push(activityWrite({
            jobId, driver: actor, action: "OVERTIME_NOTE",
            detail: `Driver entered ${driverMinutes} min; server timestamps indicate ~${serverOvertimeEstimate} min elapsed.`
          }));
        }
      }

      job.overtimeMinutes = reconciledMinutes;
      
      const otGraceStr = await getSetting("OVERTIME_GRACE_MINS", String(env.overtimeGraceMinutes));
      const otGrace = parseInt(otGraceStr, 10) || 0;

      let rateKey = "CREW_RATE_2_MAN";
      let rateFallback = 55;
      if (job.crewSize === 1) {
        rateKey = "CREW_RATE_1_MAN";
        rateFallback = 45;
      } else if (job.crewSize === 3) {
        rateKey = "CREW_RATE_3_MAN";
        rateFallback = 65;
      }

      const isPackingService = job.extraCharges.includes(ExtraChargeType.PACKING);
      const defaultRateStr = isPackingService
        ? await getSetting("PACKING_RATE", "95")
        : await getSetting(rateKey, String(rateFallback));
      const defaultRate = parseFloat(defaultRateStr) || rateFallback;

      const otRateStr = await getSetting("OVERTIME_RATE_PER_30", "");
      const otRate = otRateStr ? (parseFloat(otRateStr) || defaultRate) : defaultRate;

      const unitStr = isPackingService
        ? await getSetting("PACKING_BILLING_UNIT", "Per hour")
        : await getSetting("CREW_BILLING_UNIT", "Per 30 minutes");
      const unitMins = unitStr.toLowerCase().includes("hour") ? 60 : 30;

      const chargeableMinutes = Math.max(0, reconciledMinutes - otGrace);
      job.overtimeCharge =
        chargeableMinutes === 0 ? 0 : Math.ceil(chargeableMinutes / unitMins) * otRate;
      
      const from = job.currentState;
      job.currentState = WorkflowState.WAITING_TOTAL_CHARGES;
      return saveJob(job, driver, action, from, `${reconciledMinutes} minutes`, [
        driverFlowWrite({
          jobId, driver: actor, field: "Over Time Charges",
          value: `${reconciledMinutes} min / ${formatPounds(job.overtimeCharge)}`, state: job.currentState
        }),
        ...reconciliationExtras
      ]);
    }

    case "SUBMIT_TOTAL_CHARGES": {
      assertState(job.currentState, WorkflowState.WAITING_TOTAL_CHARGES);
      const total = validateCurrency(input.total_charges?.[0] ?? "");
      job.totalCharges = total;
      const suggested = suggestedTotal(job);
      const from = job.currentState;
      job.currentState = WorkflowState.WAITING_PAYMENT;
      // Exact integer comparison in pence. `Math.abs(a - b) >= 0.01` was an epsilon
      // test standing in for equality, which is not a correctness argument for money.
      const mismatch = equalPence(fromPounds(total), fromPounds(suggested))
        ? formatPounds(total)
        : `Entered ${formatPounds(total)}; suggested ${formatPounds(suggested)}`;
      return saveJob(job, driver, action, from, mismatch, [
        driverFlowWrite({ jobId, driver: actor, field: "Total Charges", value: formatPounds(total), state: job.currentState })
      ]);
    }

    case "SUBMIT_PAYMENT": {
      assertState(job.currentState, WorkflowState.WAITING_PAYMENT);
      const method = validatePaymentMethod(input.payment_method?.[0] ?? "");
      job.paymentMethod = method;
      job.paymentStatus = method === "Invoice" ? "Outstanding" : "Recorded";
      const from = job.currentState;
      // The 2nd issues check was moved to before Extra Charges (after FINISH_MOVE),
      // so after Payment the next step is the Empty Van photo directly.
      job.currentState = WorkflowState.WAITING_EMPTY_VAN_PHOTO;
      return saveJob(job, driver, action, from, method, [
        paymentWrite({ jobId, driver: actor, method, amount: job.totalCharges, status: job.paymentStatus }),
        driverFlowWrite({ jobId, driver: actor, field: "Payment Method", value: method, state: job.currentState })
      ]);
    }

    // SUBMIT_CLIENT_DETAILS removed — card 8 (Client Postcode) is gone.
    // SEND_ON_MY_WAY_MESSAGE removed — On My Way step skipped; job starts at arrival photo.

    case "ISSUES_NONE":
    case "ISSUES_YES": {
      const from = job.currentState as WorkflowState;
      const noneTarget: Partial<Record<WorkflowState, WorkflowState>> = {
        [WorkflowState.WAITING_ARRIVAL_ISSUES_CHECK]: WorkflowState.WAITING_LOADED_PHOTO,
        // 2nd checkpoint now sits before Extra Charges — NONE skips straight there
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

    case "REVIEW_NONE":
    case "REVIEW_YES": {
      assertState(job.currentState, WorkflowState.WAITING_REVIEW_CHECK);
      const from = job.currentState;
      if (action === "REVIEW_YES") {
        // Driver wants to send a review email — go to the email preview card
        job.currentState = WorkflowState.WAITING_REVIEW_SEND;
        return saveJob(job, driver, action, from);
      }
      // REVIEW_NONE: no review email requested — complete the job immediately
      if (job.customerEmail) {
        const completionTemplate = await getSetting("JOB_COMPLETION_EMAIL_TEXT", JOB_COMPLETION_EMAIL_TEMPLATE);
        sendJobCompletionEmail(job, completionTemplate).catch(err =>
          log.warn("job completion email failed (non-fatal)", { job_id: jobId, error: String(err) })
        );
      }
      return completeJob(jobId, identifier);
    }

    case "SEND_REVIEW_EMAIL": {
      assertState(job.currentState, WorkflowState.WAITING_REVIEW_SEND);
      const from = job.currentState;
      const template = await getSetting("REVIEW_REQUEST_EMAIL_TEXT", REVIEW_REQUEST_EMAIL_TEMPLATE);
      const extras: SheetWrite[] = [];
      if (job.customerEmail) {
        try {
          await sendReviewRequestEmail(job, template);
          extras.push(activityWrite({
            jobId, driver: actor, action: "CLIENT_REVIEW_EMAIL_SENT", fromState: from, toState: from, detail: job.customerEmail
          }));
        } catch (error) {
          extras.push(activityWrite({
            jobId, driver: actor, action: "CLIENT_REVIEW_EMAIL_FAILED", fromState: from, toState: from,
            detail: error instanceof Error ? error.message : String(error)
          }));
        }
      }
      // Commit the review email activity, then complete the job immediately
      await commitWrites(extras);
      if (job.customerEmail) {
        const completionTemplate = await getSetting("JOB_COMPLETION_EMAIL_TEXT", JOB_COMPLETION_EMAIL_TEMPLATE);
        sendJobCompletionEmail(job, completionTemplate).catch(err =>
          log.warn("job completion email failed (non-fatal)", { job_id: jobId, error: String(err) })
        );
      }
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
      // Legacy fallback: jobs already sitting at READY_TO_COMPLETE in the sheet
      // (written by an older version of the app) can still be completed via this action.
      // New jobs never reach READY_TO_COMPLETE — they complete directly from REVIEW_NONE
      // or SEND_REVIEW_EMAIL above. The completion gate still runs here.
      await assertCompletionGate(jobId, job);
      if (job.customerEmail) {
        const completionTemplate = await getSetting("JOB_COMPLETION_EMAIL_TEXT", JOB_COMPLETION_EMAIL_TEMPLATE);
        sendJobCompletionEmail(job, completionTemplate).catch(err =>
          log.warn("job completion email failed (non-fatal)", { job_id: jobId, error: String(err) })
        );
      }
      return completeJob(jobId, identifier);
    }

    default:
      throw new ValidationError(`Unknown action: ${action}`);
  }
}

/** BACK button targets for the data-entry steps -- lets a driver who mis-typed
 *  something return and redo it, rather than being stuck once a step is submitted.
 *  Total Charges' predecessor is ambiguous (Overtime only runs if extra time was
 *  claimed), so it always goes back to Extra Charges, the fixed branch point, rather
 *  than trying to reconstruct which path was actually taken. */
const BACK_TARGET: Partial<Record<WorkflowState, WorkflowState>> = {
  // 2nd issues check is now before Extra Charges, so Extra Charges back = issues check
  [WorkflowState.WAITING_EXTRA_CHARGES]: WorkflowState.WAITING_EMPTY_VAN_ISSUES_CHECK,
  [WorkflowState.WAITING_OVERTIME]: WorkflowState.WAITING_EXTRA_CHARGES,
  [WorkflowState.WAITING_TOTAL_CHARGES]: WorkflowState.WAITING_EXTRA_CHARGES,
  [WorkflowState.WAITING_PAYMENT]: WorkflowState.WAITING_TOTAL_CHARGES
  // WAITING_CLIENT_DETAILS removed — that step is gone from the workflow
};

export class SignatureAlreadyCapturedError extends Error {
  constructor() {
    super("This job's signature has already been captured.");
    this.name = "SignatureAlreadyCapturedError";
  }
}

/**
 * Records a customer's hand-drawn signature, submitted from their own device via the
 * signature-pad link (see chat/signature.routes.ts) rather than from the driver's Chat
 * session. There is no Chat identity here — the "driver" for the audit trail is whoever
 * the job is assigned to.
 */
export async function submitDrawnSignature(
  jobId: string,
  customerName: string,
  signature: { fileId: string; fileUrl: string }
): Promise<Job> {
  const job = await getJob(jobId, 0);
  if (!job) throw new ValidationError(`Job ${jobId} was not found.`);
  if (job.currentState !== WorkflowState.WAITING_CLIENT_CONFIRMATION) {
    // The customer's device double-submitted, or the link was reopened after the driver
    // already moved on. Treat as already-done rather than erroring.
    throw new SignatureAlreadyCapturedError();
  }

  const name = customerName.trim() || "Customer";
  const actor = job.driverInitials || "customer device";
  job.clientConfirmedBy = name;
  job.updatedAt = new Date().toISOString();
  const from = job.currentState;
  job.currentState = WorkflowState.WAITING_REVIEW_CHECK;

  await commitWrites([
    jobWrite(job),
    workflowWrite(job.jobId, actor, job.currentState),
    signatureWrite({
      jobId, driver: actor, customerName: name, confirmationText: signature.fileUrl,
      mode: "Drawn signature (customer device)"
    }),
    driverFlowWrite({
      jobId, driver: actor, field: "Client Signature", value: `${name} — signed`, state: job.currentState
    }),
    activityWrite({
      jobId, driver: actor, action: "SUBMIT_CLIENT_CONFIRMATION", fromState: from, toState: job.currentState, detail: name
    })
  ]);

  return job;
}

/**
 * Thrown when the only thing standing between the driver and completion is background
 * work that has not finished yet. Distinct from ValidationError so the UI can offer
 * "wait and retry" rather than "you did something wrong".
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
 * The guarantee that makes the async architecture safe.
 *
 * Receiving an attachment never satisfies a requirement — only evidence that reached
 * COMPLETED does, which means the file is verifiably in Drive with a recorded URL. The
 * three failure modes are reported separately so the driver gets an actionable message:
 *
 *   never uploaded   -> ValidationError    "missing X"
 *   still processing -> EvidencePendingError "wait a moment"
 *   failed           -> EvidenceFailedError  "retry / re-upload"
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
  // clientNamePostcode check removed — card 8 (Client Postcode) was removed from the workflow
  if (!hasSignature) missing.push("client confirmation");

  // Order matters: a hard-missing step is the driver's problem and outranks anything
  // the backend is still doing.
  if (missing.length) {
    throw new ValidationError(`Cannot complete job. Missing: ${missing.join(", ")}.`);
  }
  if (permanentlyFailed.length) {
    throw new EvidenceFailedError(
      `We couldn't save your ${permanentlyFailed.map(labelFor).join(" and ")}.`,
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
