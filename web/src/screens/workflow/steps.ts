/**
 * Workflow step metadata.
 *
 * Pulled out of JobWorkflowScreen so the step list is a single declarative table
 * rather than a label map plus a switch statement plus an implicit ordering nobody
 * could see. That ordering is what drives the "Step 4 of 13" progress rail -- the
 * driver previously saw only the current step's title, with no sense of how much of
 * the job was left.
 *
 * `order` is the position in the happy path. The issue-reporting detours
 * (WAITING_*_ISSUES_*) deliberately share the position of the step they branch off,
 * because they're a side-quest, not progress: a driver who stops to file a Parking
 * Liability report hasn't got further through the move.
 */

export interface StepMeta {
  /** Short title shown as the screen's heading. */
  label: string;
  /** One line under it saying what to actually do. Every step now has one; before,
   *  several steps rendered a bare title and a button with no instruction at all. */
  hint?: string;
  /** Position on the happy path, 1-based. */
  order: number;
}

export const TOTAL_STEPS = 13;

export const STEPS: Record<string, StepMeta> = {
  READY: {
    label: "Ready to start",
    hint: "Start the job when you arrive at the pickup address. This stamps your start time.",
    order: 1
  },
  WAITING_ARRIVAL_PHOTO: {
    label: "Arrival photo",
    hint: "Photograph the property or load as you found it, before anything is moved.",
    order: 2
  },
  WAITING_ARRIVAL_ISSUES_CHECK: {
    label: "Any issues on arrival?",
    hint: "Parking restrictions, existing damage, anything that needs recording before you load.",
    order: 3
  },
  WAITING_ARRIVAL_ISSUES_CHOICE: {
    label: "Record the issue",
    hint: "Pick the form that matches what you found. The job continues once it's submitted.",
    order: 3
  },
  WAITING_LOADED_PHOTO: {
    label: "Van loaded photo",
    hint: "Show how the load is stacked and secured before you set off.",
    order: 4
  },
  IN_PROGRESS: {
    label: "Move in progress",
    hint: "Finish the move when everything is unloaded at the drop-off address.",
    order: 5
  },
  WAITING_EMPTY_VAN_ISSUES_CHECK: {
    label: "Any issues to report?",
    hint: "Damage, overloading, or anything the customer needs to sign off on.",
    order: 6
  },
  WAITING_EMPTY_VAN_ISSUES_CHOICE: {
    label: "Record the issue",
    hint: "Pick the form that matches what happened.",
    order: 6
  },
  WAITING_EXTRA_CHARGES: {
    label: "Extra charges",
    hint: "Select everything that applies. Pick “No Extras Time” if there were none.",
    order: 7
  },
  WAITING_OVERTIME: {
    label: "Overtime",
    hint: "Minutes worked beyond the booked window, and who was working them.",
    order: 8
  },
  WAITING_TOTAL_CHARGES: {
    label: "Total charges",
    hint: "The final amount for this job, including any extras and overtime.",
    order: 9
  },
  WAITING_PAYMENT: {
    label: "Payment method",
    hint: "How the customer is paying.",
    order: 10
  },
  WAITING_EMPTY_VAN_PHOTO: {
    label: "Empty van photo",
    hint: "Show the van empty, so there's proof nothing was left behind.",
    order: 11
  },
  WAITING_CLIENT_CONFIRMATION: {
    label: "Customer sign-off",
    hint: "Hand your phone to the customer to review and sign.",
    order: 12
  },
  WAITING_REVIEW_CHECK: {
    label: "Ask for a review?",
    hint: "Only if the customer is happy to leave one.",
    order: 13
  },
  WAITING_REVIEW_SEND: {
    label: "Send review email",
    hint: "This finishes the job.",
    order: 13
  },
  COMPLETED: { label: "Job complete", order: TOTAL_STEPS }
};

/** Steps a driver can safely reverse out of -- all pure data-entry, nothing that has
 *  already been sent to the customer or stamped as a time. */
export const BACK_ELIGIBLE = new Set([
  "WAITING_EXTRA_CHARGES",
  "WAITING_OVERTIME",
  "WAITING_TOTAL_CHARGES",
  "WAITING_PAYMENT"
]);

/** The one extra-charge option that unlocks the Overtime step. Selecting anything
 *  else (or "No Extras Time") skips Overtime entirely — there are no overtime
 *  minutes to record, so the step, its progress slot and its data all disappear. */
export const EXTRA_TIME_CHARGE = "Extra time / Charges";

export const EXTRA_CHARGE_OPTIONS = [
  "London Congestion charge",
  "Tunnel Charges",
  EXTRA_TIME_CHARGE,
  "Packing Service",
  "No Extras Time"
];

/** Selecting this clears every other extra charge, and vice versa. */
export const NO_EXTRAS = "No Extras Time";

/** Whether the Overtime step is part of the workflow for this job — true only when
 *  "Extra time / Charges" is among the selected extra charges. */
export function overtimeApplies(extraCharges: readonly string[] | undefined | null): boolean {
  return Array.isArray(extraCharges) && extraCharges.includes(EXTRA_TIME_CHARGE);
}

/**
 * Displayed "Step N of M" for a given state, collapsing the Overtime slot when it
 * doesn't apply: without overtime the workflow is one step shorter and every step
 * after Extra charges shifts down by one.
 */
export function workflowProgress(
  state: string,
  opts: { overtime: boolean }
): { current: number; total: number } {
  const total = opts.overtime ? TOTAL_STEPS : TOTAL_STEPS - 1;
  let current = STEPS[state]?.order ?? 1;
  if (!opts.overtime && current > STEPS.WAITING_OVERTIME.order) current -= 1;
  return { current: Math.min(current, total), total };
}

export const PAYMENT_METHODS = ["Card", "Cash", "Bank Transfer", "Link", "Invoice"];

export const CREW_SIZE_OPTIONS: Array<{ value: "1" | "2" | "3"; label: string }> = [
  { value: "1", label: "1 person" },
  { value: "2", label: "2 people" },
  { value: "3", label: "3 people" }
];
