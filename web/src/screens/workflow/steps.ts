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
  /** Button-sized name for the Home screen's "continue" button -- distinct from
   *  `label`, which is a full screen heading (sometimes a whole sentence) rather than
   *  something that reads well on a button. See FeaturedJobCard.tsx. */
  shortLabel: string;
}

export const TOTAL_STEPS = 13;

export const STEPS: Record<string, StepMeta> = {
  READY: {
    label: "Ready to start",
    hint: "Start the job when you arrive at the pickup address. This stamps your start time.",
    order: 1,
    shortLabel: "Start Job"
  },
  WAITING_ARRIVAL_PHOTO: {
    label: "Proof of arrival",
    hint: "Take up to 2 photos of the property or load as you found it at the pickup point.",
    order: 2,
    shortLabel: "Proof of Arrival"
  },
  WAITING_ARRIVAL_ISSUES_CHECK: {
    label: "Great! We're at the pick-up point now — any issue to report?",
    hint: "Choose a report if needed, or continue with no issues.",
    order: 3,
    shortLabel: "Issues to Report"
  },
  WAITING_ARRIVAL_ISSUES_CHOICE: {
    label: "Record the issue",
    hint: "Pick the form that matches what you found. The job continues once it's submitted.",
    order: 3,
    shortLabel: "Issues to Report"
  },
  WAITING_LOADED_PHOTO: {
    label: "Van Loaded Photo (pick up point)",
    hint: "Show how the load is stacked and secured. Add a liability report first if anything needs sign-off.",
    order: 4,
    shortLabel: "Van Loaded Photo"
  },
  IN_PROGRESS: {
    label: "Move in progress",
    hint: "Finish the move when everything is unloaded at the drop-off address.",
    order: 4,
    shortLabel: "Finish Move"
  },
  // Only reached for jobs that carry a mid-route stop (job.stopBy). Sits between the
  // van-loaded photo and the drop-off issues check.
  WAITING_STOP_BY_ISSUES_CHECK: {
    label: "Nice! We're at the stop-by point now — any issue to report ?",
    hint: "Choose a report if needed, or continue with no issues.",
    order: 5,
    shortLabel: "Issues to Report (Stop-by)"
  },
  WAITING_STOP_BY_ISSUES_CHOICE: {
    label: "Record the issue",
    hint: "Pick the form that matches what happened at the stop-by address.",
    order: 5,
    shortLabel: "Issues to Report (Stop-by)"
  },
  WAITING_EMPTY_VAN_ISSUES_CHECK: {
    label: "Well done, you're almost finished! We're at the drop-off point now — any issues to report?",
    hint: "Choose a report if needed, or continue with no issues.",
    order: 6,
    shortLabel: "Issues to Report (Drop-off)"
  },
  WAITING_EMPTY_VAN_ISSUES_CHOICE: {
    label: "Record the issue",
    hint: "Pick the form that matches what happened.",
    order: 6,
    shortLabel: "Issues to Report (Drop-off)"
  },
  WAITING_EXTRA_CHARGES: {
    label: "Extra charges",
    hint: "Select everything that applies. Pick “No Extras Time” if there were none.",
    order: 7,
    shortLabel: "Extra Charges"
  },
  WAITING_OVERTIME: {
    label: "Extra Time Needed and Paid",
    hint: "Minutes worked beyond the booked window",
    order: 8,
    shortLabel: "Overtime"
  },
  WAITING_TOTAL_CHARGES: {
    label: "Total charges",
    hint: "The final amount for this job, including any extras and overtime.",
    order: 9,
    shortLabel: "Total Charges"
  },
  WAITING_PAYMENT: {
    label: "How customer Paid ?",
    order: 10,
    shortLabel: "How customer paid ?"
  },
  WAITING_EMPTY_VAN_PHOTO: {
    label: "Empty van photo (drop-off point)",
    hint: "Show the van empty at the drop-off — proof nothing was left behind.",
    order: 11,
    shortLabel: "Empty Van Photo"
  },
  WAITING_CLIENT_CONFIRMATION: {
    label: "Customer sign-off",
    hint: "Hand your phone to the customer to review and sign.",
    order: 12,
    shortLabel: "Customer Sign-off"
  },
  WAITING_REVIEW_CHECK: {
    label: "Ask for a review ?",
    hint: "Only if the customer is happy to leave one.",
    order: 13,
    shortLabel: "Ask for a Review"
  },
  WAITING_REVIEW_SEND: {
    label: "Send review email",
    hint: "This finishes the job.",
    order: 13,
    shortLabel: "Ask for a Review"
  },
  COMPLETED: { label: "Job complete", order: TOTAL_STEPS, shortLabel: "Job Complete" }
};

/** Position of the conditional stop-by issues step — used to collapse its slot for
 *  jobs without a mid-route stop, the same way Overtime's slot collapses. */
export const STOP_BY_ORDER = 5;

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

/** The option a GPSLive congestion-zone detection (see Job.congestionZoneEnteredAt)
 *  suggests on the Extra Charges step. */
export const CONGESTION_CHARGE = "London Congestion charge";

/** Same as CONGESTION_CHARGE but for a GPSLive tunnel-toll-zone detection (see
 *  Job.tunnelZoneEnteredAt) -- Dartford Crossing / Tunnels-Black-Silver. */
export const TUNNEL_CHARGE = "Tunnel Charges";

export const EXTRA_CHARGE_OPTIONS = [
  CONGESTION_CHARGE,
  TUNNEL_CHARGE,
  EXTRA_TIME_CHARGE,
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
 * Displayed "Step N of M" for a given state. Two slots are conditional and collapse
 * when they don't apply, each shifting every later step down by one:
 *  - the stop-by issues check (only for jobs with a mid-route stop), and
 *  - Overtime (only when "Extra time / Charges" was selected).
 */
export function workflowProgress(
  state: string,
  opts: { overtime: boolean; hasStop?: boolean }
): { current: number; total: number } {
  let total = TOTAL_STEPS;
  if (!opts.hasStop) total -= 1;
  if (!opts.overtime) total -= 1;

  let current = STEPS[state]?.order ?? 1;
  if (!opts.hasStop && current > STOP_BY_ORDER) current -= 1;
  if (!opts.overtime && current > STEPS.WAITING_OVERTIME.order) current -= 1;
  return { current: Math.min(current, total), total };
}

export const PAYMENT_METHODS = ["Card", "Cash", "Bank Transfer", "Link", "Invoice"];
