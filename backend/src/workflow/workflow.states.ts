export enum WorkflowState {
  READY = "READY",
  WAITING_ARRIVAL_PHOTO = "WAITING_ARRIVAL_PHOTO",
  WAITING_ARRIVAL_ISSUES_CHECK = "WAITING_ARRIVAL_ISSUES_CHECK",
  WAITING_ARRIVAL_ISSUES_CHOICE = "WAITING_ARRIVAL_ISSUES_CHOICE",
  WAITING_LOADED_PHOTO = "WAITING_LOADED_PHOTO",
  IN_PROGRESS = "IN_PROGRESS",
  // Legacy stop-by states are kept only so old in-progress jobs can be moved forward
  // cleanly. The driver app no longer shows a stop-by step.
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

/** Arrival, Van Loaded, and Empty Van are the states a photo actually advances --
 *  "Organized" and driver-facing Stop-by were removed. */
export const PHOTO_STATES = new Set<WorkflowState>([
  WorkflowState.WAITING_ARRIVAL_PHOTO,
  WorkflowState.WAITING_LOADED_PHOTO,
  WorkflowState.WAITING_EMPTY_VAN_PHOTO
]);

/**
 * Where the classic flow resumes once an inline Parking Liability/Liability Report
 * detour (launched from the matching _ISSUES_CHOICE state) finishes -- see
 * scenario.engine.ts's finalizeScenario(). Same targets ISSUES_NONE jumps to directly
 * when the driver has no issue to report.
 *
 * Legacy only: issue reports now live in the driver's Liability tab, outside the main
 * workflow. These targets are kept so old jobs already sitting in an _ISSUES_CHOICE
 * state can recover cleanly.
 */
export const RESUME_AFTER_ISSUES: Partial<Record<WorkflowState, WorkflowState>> = {
  [WorkflowState.WAITING_ARRIVAL_ISSUES_CHOICE]: WorkflowState.WAITING_LOADED_PHOTO,
  [WorkflowState.WAITING_STOP_BY_ISSUES_CHOICE]: WorkflowState.WAITING_EMPTY_VAN_PHOTO,
  [WorkflowState.WAITING_EMPTY_VAN_ISSUES_CHOICE]: WorkflowState.WAITING_EMPTY_VAN_PHOTO
};

export function nextAfterPhoto(state: WorkflowState): WorkflowState {
  switch (state) {
    case WorkflowState.WAITING_ARRIVAL_PHOTO:
      return WorkflowState.WAITING_LOADED_PHOTO;
    case WorkflowState.WAITING_LOADED_PHOTO:
      return WorkflowState.WAITING_EMPTY_VAN_ISSUES_CHECK;
    case WorkflowState.WAITING_EMPTY_VAN_PHOTO:
      return WorkflowState.WAITING_CLIENT_CONFIRMATION;
    default:
      throw new Error(`State ${state} is not a photo state`);
  }
}
