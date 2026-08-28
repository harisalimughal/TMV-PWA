export enum WorkflowState {
  READY = "READY",
  WAITING_ARRIVAL_PHOTO = "WAITING_ARRIVAL_PHOTO",
  WAITING_ARRIVAL_ISSUES_CHECK = "WAITING_ARRIVAL_ISSUES_CHECK",
  WAITING_ARRIVAL_ISSUES_CHOICE = "WAITING_ARRIVAL_ISSUES_CHOICE",
  WAITING_LOADED_PHOTO = "WAITING_LOADED_PHOTO",
  IN_PROGRESS = "IN_PROGRESS",
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

/** Arrival and Empty Van are the only two states a photo actually advances --
 *  "Organized" was removed (no longer collected). */
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
 * The two checkpoints sit in different positions relative to their photo: Arrival's
 * is right after the Arrival photo (resume -> the next photo step, Loaded), while
 * Empty Van's is right *before* the Empty Van photo (inserted right after Payment) --
 * resume there is the Empty Van photo step itself, not past it.
 */
export const RESUME_AFTER_ISSUES: Partial<Record<WorkflowState, WorkflowState>> = {
  [WorkflowState.WAITING_ARRIVAL_ISSUES_CHOICE]: WorkflowState.WAITING_LOADED_PHOTO,
  [WorkflowState.WAITING_EMPTY_VAN_ISSUES_CHOICE]: WorkflowState.WAITING_EXTRA_CHARGES
};

export function nextAfterPhoto(state: WorkflowState): WorkflowState {
  switch (state) {
    case WorkflowState.WAITING_ARRIVAL_PHOTO:
      return WorkflowState.WAITING_ARRIVAL_ISSUES_CHECK;
    case WorkflowState.WAITING_LOADED_PHOTO:
      return WorkflowState.IN_PROGRESS;
    case WorkflowState.WAITING_EMPTY_VAN_PHOTO:
      return WorkflowState.WAITING_CLIENT_CONFIRMATION;
    default:
      throw new Error(`State ${state} is not a photo state`);
  }
}
