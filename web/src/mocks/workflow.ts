/**
 * Minimal re-implementation of the server's job workflow state machine, so the whole
 * driver workflow is walkable end-to-end against the dev mock API.
 *
 * DEV ONLY (see fixtures.ts). Mirrors the transitions implied by
 * src/screens/workflow/steps.ts and JobWorkflowScreen's action names.
 */
import type { Job } from "../api/jobs";
import { overtimeApplies } from "../screens/workflow/steps";

function calculatedTotal(job: Job): number {
  let extras = 0;
  if (job.extraCharges?.includes("London Congestion charge")) extras += 18;
  if (job.extraCharges?.includes("Tunnel Charges")) extras += 13;
  return job.basePrice + extras + (job.overtimeCharge ?? 0);
}

export type WorkflowTrigger =
  | "start"
  | "evidence"
  | "signature"
  | "scenario"
  | "ISSUES_YES"
  | "ISSUES_NONE"
  | "FINISH_MOVE"
  | "SUBMIT_EXTRA_CHARGES"
  | "SUBMIT_OVERTIME"
  | "SUBMIT_TOTAL_CHARGES"
  | "SUBMIT_PAYMENT"
  | "REVIEW_YES"
  | "REVIEW_NONE"
  | "SEND_REVIEW_EMAIL"
  | "GO_BACK";

/**
 * Happy-path successor of `current` given `trigger`. Unknown pairs are a no-op.
 *
 * `extraCharges` is the selection carried by SUBMIT_EXTRA_CHARGES: it decides
 * whether the Overtime step exists at all, so from WAITING_EXTRA_CHARGES the job
 * goes to WAITING_OVERTIME only when "Extra time / Charges" was picked, and
 * straight to WAITING_TOTAL_CHARGES otherwise.
 */
export function nextState(
  current: string,
  trigger: WorkflowTrigger,
  extraCharges: readonly string[] = []
): string {
  switch (current) {
    case "READY":
      return trigger === "start" ? "WAITING_ARRIVAL_PHOTO" : current;
    case "WAITING_ARRIVAL_PHOTO":
      return trigger === "evidence" ? "WAITING_ARRIVAL_ISSUES_CHECK" : current;
    case "WAITING_ARRIVAL_ISSUES_CHECK":
      if (trigger === "ISSUES_YES") return "WAITING_ARRIVAL_ISSUES_CHOICE";
      if (trigger === "ISSUES_NONE") return "WAITING_LOADED_PHOTO";
      return current;
    case "WAITING_ARRIVAL_ISSUES_CHOICE":
      return trigger === "scenario" ? "WAITING_LOADED_PHOTO" : current;
    case "WAITING_LOADED_PHOTO":
      return trigger === "evidence" ? "WAITING_EXTRA_CHARGES" : current;
      return trigger === "evidence" ? "WAITING_EMPTY_VAN_ISSUES_CHECK" : current;
    case "IN_PROGRESS":
      return trigger === "FINISH_MOVE" ? "WAITING_EMPTY_VAN_ISSUES_CHECK" : current;
    case "WAITING_EMPTY_VAN_ISSUES_CHECK":
      if (trigger === "ISSUES_YES") return "WAITING_EMPTY_VAN_ISSUES_CHOICE";
      if (trigger === "ISSUES_NONE") return "WAITING_EXTRA_CHARGES";
      return current;
    case "WAITING_EMPTY_VAN_ISSUES_CHOICE":
      return trigger === "scenario" ? "WAITING_EXTRA_CHARGES" : current;
    case "WAITING_EXTRA_CHARGES":
      if (trigger !== "SUBMIT_EXTRA_CHARGES") return current;
      return overtimeApplies(extraCharges) ? "WAITING_OVERTIME" : "WAITING_TOTAL_CHARGES";
    case "WAITING_OVERTIME":
      return trigger === "SUBMIT_OVERTIME" ? "WAITING_TOTAL_CHARGES" : current;
    case "WAITING_TOTAL_CHARGES":
      return trigger === "SUBMIT_TOTAL_CHARGES" ? "WAITING_PAYMENT" : current;
    case "WAITING_PAYMENT":
      return trigger === "SUBMIT_PAYMENT" ? "WAITING_EMPTY_VAN_PHOTO" : current;
    case "WAITING_EMPTY_VAN_PHOTO":
      return trigger === "evidence" ? "WAITING_CLIENT_CONFIRMATION" : current;
    case "WAITING_CLIENT_CONFIRMATION":
      return trigger === "signature" ? "WAITING_REVIEW_CHECK" : current;
    case "WAITING_REVIEW_CHECK":
      if (trigger === "REVIEW_YES") return "COMPLETED";
      if (trigger === "REVIEW_NONE") return "COMPLETED";
      return current;
    case "WAITING_REVIEW_SEND":
      return trigger === "SEND_REVIEW_EMAIL" ? "COMPLETED" : current;
    default:
      return current;
  }
}

/** Predecessor for GO_BACK, mirroring the backend workflow engine. */
function prevState(current: string, job: Job): string {
  switch (current) {
    case "WAITING_ARRIVAL_PHOTO":
      return "READY";
    case "WAITING_ARRIVAL_ISSUES_CHECK":
      return "WAITING_ARRIVAL_PHOTO";
    case "WAITING_ARRIVAL_ISSUES_CHOICE":
      return "WAITING_ARRIVAL_ISSUES_CHECK";
    case "WAITING_LOADED_PHOTO":
      return "WAITING_ARRIVAL_ISSUES_CHECK";
    case "IN_PROGRESS":
      return "WAITING_LOADED_PHOTO";
    case "WAITING_EMPTY_VAN_ISSUES_CHECK":
      return "WAITING_LOADED_PHOTO";
    case "WAITING_EMPTY_VAN_ISSUES_CHOICE":
      return "WAITING_EMPTY_VAN_ISSUES_CHECK";
    case "WAITING_EXTRA_CHARGES":
      return "WAITING_LOADED_PHOTO";
    case "WAITING_OVERTIME":
      return "WAITING_EXTRA_CHARGES";
    case "WAITING_TOTAL_CHARGES":
      return overtimeApplies(job.extraCharges) ? "WAITING_OVERTIME" : "WAITING_EXTRA_CHARGES";
    case "WAITING_PAYMENT":
      return "WAITING_TOTAL_CHARGES";
    case "WAITING_EMPTY_VAN_PHOTO":
      return "WAITING_PAYMENT";
    case "WAITING_CLIENT_CONFIRMATION":
      return "WAITING_EMPTY_VAN_PHOTO";
    case "WAITING_REVIEW_CHECK":
      return "WAITING_CLIENT_CONFIRMATION";
    case "WAITING_REVIEW_SEND":
      return "WAITING_REVIEW_CHECK";
    default:
      return current;
  }
}

/** Applies a trigger to a job in place-ish (returns a new object), updating the
 *  workflow state and any fields that transition carries. */
export function applyTrigger(
  job: Job,
  trigger: WorkflowTrigger,
  input: Record<string, string[]> = {}
): Job {
  const now = new Date().toISOString();
  const next: Job = { ...job, updatedAt: now };

  if (trigger === "GO_BACK") {
    next.currentState = prevState(job.currentState, job);
    return next;
  }

  const nextExtraCharges =
    trigger === "SUBMIT_EXTRA_CHARGES" ? (input.extra_charges ?? []) : job.extraCharges;
  next.currentState = nextState(job.currentState, trigger, nextExtraCharges);

  switch (trigger) {
    case "start":
      next.status = "IN_PROGRESS";
      next.actualStart = now;
      break;
    case "FINISH_MOVE":
      next.actualFinish = now;
      break;
    case "SUBMIT_EXTRA_CHARGES":
      next.extraCharges = input.extra_charges ?? [];
      // No "Extra time / Charges" means no overtime step — wipe any value a previous
      // pass through it may have recorded so nothing stale reaches the submission.
      if (!overtimeApplies(next.extraCharges)) {
        next.overtimeMinutes = 0;
        next.overtimeCharge = 0;
      }
      break;
    case "SUBMIT_OVERTIME": {
      // Missing minutes = a skip (e.g. a client that landed here with no overtime to
      // record): leave the fields untouched rather than writing a zero.
      if (input.overtime_minutes?.length) {
        const mins = Number(input.overtime_minutes[0] ?? "0") || 0;
        const crew = Number(input.overtime_crew_size?.[0] ?? "2") || 2;
        next.overtimeMinutes = mins;
        next.overtimeCharge = Math.round((mins / 60) * 45 * crew);
      }
      break;
    }
    case "SUBMIT_TOTAL_CHARGES":
      next.calculatedTotalCharges = calculatedTotal(job);
      next.totalCharges = next.calculatedTotalCharges;
      next.amountCharged = input.total_charges?.[0]
        ? Math.round((Number(input.total_charges[0]) || 0) * 100) / 100
        : next.calculatedTotalCharges;
      next.totalAdjustmentNote = input.total_adjustment_note?.[0] ?? "";
      break;
    case "SUBMIT_PAYMENT":
      next.paymentMethod = (input.payment_method ?? []).join(", ");
      next.paymentStatus = next.paymentMethod.includes("Invoice") ? "Outstanding" : "Recorded";
      break;
    case "signature":
      next.clientConfirmedBy = job.customerName;
      next.signatureUrl = "mock://signature.png";
      break;
    default:
      break;
  }

  if (next.currentState === "COMPLETED") {
    next.status = "COMPLETED";
    if (!next.actualFinish) next.actualFinish = now;
    if (!next.totalCharges) next.totalCharges = job.basePrice + (job.overtimeCharge ?? 0);
    if (!next.amountCharged) next.amountCharged = next.totalCharges;
  }

  return next;
}
