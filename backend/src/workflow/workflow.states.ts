export enum WorkflowState {
  READY = "READY",
  WAITING_ARRIVAL_PHOTO = "WAITING_ARRIVAL_PHOTO",
  WAITING_ARRIVAL_ISSUES_CHECK = "WAITING_ARRIVAL_ISSUES_CHECK",
  WAITING_ARRIVAL_ISSUES_CHOICE = "WAITING_ARRIVAL_ISSUES_CHOICE",
  WAITING_LOADED_PHOTO = "WAITING_LOADED_PHOTO",
  IN_PROGRESS = "IN_PROGRESS",
  // "Is there a stop-by point?" -- asked on every job regardless of whether the
  // Calendar description mentioned one (Job.stopBy, parsed in booking.service.ts,
  // isn't always kept up to date for a stop decided on the day). Yes -> a proof
  // photo at the stop (same shape as Arrival's), then the same "any issues here?"
  // detour Arrival/Empty Van already get. No -> straight on to the drop-off
  // issues check, same as a job with no stop at all.
  WAITING_STOP_BY_CHECK = "WAITING_STOP_BY_CHECK",
  WAITING_STOP_BY_PHOTO = "WAITING_STOP_BY_PHOTO",
  WAITING_STOP_BY_ISSUES_CHECK = "WAITING_STOP_BY_ISSUES_CHECK",
  WAITING_STOP_BY_ISSUES_CHOICE = "WAITING_STOP_BY_ISSUES_CHOICE",
  WAITING_EXTRA_CHARGES = "WAITING_EXTRA_CHARGES",
  WAITING_OVERTIME = "WAITING_OVERTIME",
  WAITING_TOTAL_CHARGES = "WAITING_TOTAL_CHARGES",
  WAITING_PAYMENT = "WAITING_PAYMENT",
  WAITING_EMPTY_VAN_ISSUES_CHECK = "WAITING_EMPTY_VAN_ISSUES_CHECK",
  WAITING_EMPTY_VAN_ISSUES_CHOICE = "WAITING_EMPTY_VAN_ISSUES_CHOICE",
  WAITING_EMPTY_VAN_PHOTO = "WAITING_EMPTY_VAN_PHOTO",
  WAITING_CLIENT_CONFIRMATION = "WAITING_CLIENT_CONFIRMATION",
  WAITING_REVIEW_CHECK = "WAITING_REVIEW_CHECK",
  WAITING_REVIEW_SEND = "WAITING_REVIEW_SEND",
  COMPLETED = "COMPLETED"
}

/** Arrival, Van Loaded, Empty Van, and (conditionally) Stop-by are the states a photo
 *  actually advances -- "Organized" was removed (no longer collected). */
export const PHOTO_STATES = new Set<WorkflowState>([
  WorkflowState.WAITING_ARRIVAL_PHOTO,
  WorkflowState.WAITING_LOADED_PHOTO,
  WorkflowState.WAITING_STOP_BY_PHOTO,
  WorkflowState.WAITING_EMPTY_VAN_PHOTO
]);

/**
 * Where the classic flow resumes once an inline Parking Liability/Liability Report
 * detour (launched from the matching _ISSUES_CHOICE state) finishes -- see
 * scenario.engine.ts's finalizeScenario(). Same targets ISSUES_NONE jumps to directly
 * when the driver has no issue to report.
 *
 * The checkpoints sit in different positions relative to their photo: Arrival's is
 * right after the Arrival photo (resume -> the next photo step, Loaded); Stop-by's is
 * right after the Stop-by photo (resume -> the drop-off issues check); Empty Van's is
 * right before the Empty Van photo -- resume there is the Empty Van photo step itself,
 * not past it.
 */
export const RESUME_AFTER_ISSUES: Partial<Record<WorkflowState, WorkflowState>> = {
  [WorkflowState.WAITING_ARRIVAL_ISSUES_CHOICE]: WorkflowState.WAITING_LOADED_PHOTO,
  [WorkflowState.WAITING_STOP_BY_ISSUES_CHOICE]: WorkflowState.WAITING_EMPTY_VAN_ISSUES_CHECK,
  [WorkflowState.WAITING_EMPTY_VAN_ISSUES_CHOICE]: WorkflowState.WAITING_EMPTY_VAN_PHOTO
};

export function nextAfterPhoto(state: WorkflowState): WorkflowState {
  switch (state) {
    case WorkflowState.WAITING_ARRIVAL_PHOTO:
      return WorkflowState.WAITING_ARRIVAL_ISSUES_CHECK;
    case WorkflowState.WAITING_LOADED_PHOTO:
      // Every job is asked "is there a stop-by point?" next, regardless of whether
      // Job.stopBy is set -- see WAITING_STOP_BY_CHECK's own comment.
      return WorkflowState.WAITING_STOP_BY_CHECK;
    case WorkflowState.WAITING_STOP_BY_PHOTO:
      // After the stop-by photo the driver is asked "Any issues here?" (same check
      // as Arrival/Empty Van). ISSUES_NONE / the scenario detour both resume at
      // WAITING_EMPTY_VAN_ISSUES_CHECK.
      return WorkflowState.WAITING_STOP_BY_ISSUES_CHECK;
    case WorkflowState.WAITING_EMPTY_VAN_PHOTO:
      return WorkflowState.WAITING_CLIENT_CONFIRMATION;
    default:
      throw new Error(`State ${state} is not a photo state`);
  }
}
