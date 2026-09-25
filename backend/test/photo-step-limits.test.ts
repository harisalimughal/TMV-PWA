import { describe, expect, it } from "vitest";
import { JOB_EVIDENCE_UPLOAD_MAX_FILES, SCENARIO_UPLOAD_MAX_FILES } from "../src/jobs/jobs.routes";
import { STORAGE_UPLOAD_MAX_FILES } from "../src/jobs/storage.routes";
import { maxPhotosForWorkflowState } from "../src/workflow/workflow.engine";
import { WorkflowState } from "../src/workflow/workflow.states";

describe("photo step limits", () => {
  it("allows the requested number of job evidence photos per workflow step", () => {
    expect(maxPhotosForWorkflowState(WorkflowState.WAITING_LOADED_PHOTO)).toBe(5);
    expect(maxPhotosForWorkflowState(WorkflowState.WAITING_STOP_BY_PHOTO)).toBe(5);
    expect(maxPhotosForWorkflowState(WorkflowState.WAITING_EMPTY_VAN_PHOTO)).toBe(2);
  });

  it("sets multer hard ceilings high enough for the largest allowed upload", () => {
    expect(JOB_EVIDENCE_UPLOAD_MAX_FILES).toBe(5);
    expect(SCENARIO_UPLOAD_MAX_FILES).toBe(31);
    expect(STORAGE_UPLOAD_MAX_FILES).toBe(31);
  });
});
