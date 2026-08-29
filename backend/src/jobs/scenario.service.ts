import { uploadEvidenceImage } from "../storage/cloudinary";
import { looksLikeImage } from "./evidence.service";
import { insertScenarioSubmission, ScenarioSubmissionDoc } from "../db/scenario.repo";
import { appendActivity } from "../db/activity.repo";
import { getJobForDriver, saveJob } from "./jobs.service";
import { ScenarioKey, SCENARIOS } from "../workflow/scenario.spec";
import { RESUME_AFTER_ISSUES, WorkflowState } from "../workflow/workflow.states";
import { ValidationError } from "../workflow/validation.engine";
import { Job } from "./job.types";

export interface ScenarioPhoto {
  buffer: Buffer;
  contentType: string;
}

/**
 * One-shot submission of a scenario form (Check In / Check Out / Parking Liability /
 * Liability Report) -- ported from TMV-Chat-bot's chat/scenario.engine.ts, which drove
 * the same 4 forms as a one-field-per-Chat-card wizard (hence its step machine:
 * ScenarioProgressRecord, "field N" / "photos" / "signature" steps persisted between
 * messages). The PWA renders the whole form on one scrollable screen instead (see
 * web/src/screens/ScenarioFormScreen.tsx), so there's no multi-step progress to persist
 * -- this just validates everything at once and writes one submission document.
 */
export async function submitScenario(
  scenario: ScenarioKey,
  jobId: string,
  identifier: string,
  fields: Record<string, string>,
  photos: ScenarioPhoto[],
  signature: ScenarioPhoto
): Promise<{ job: Job; submission: ScenarioSubmissionDoc }> {
  const spec = SCENARIOS[scenario];
  const { job, driver } = await getJobForDriver(jobId, identifier);
  const actor = driver.email || driver.chatUserName;

  for (const field of spec.fields) {
    if (field.required && !(fields[field.name] ?? "").trim()) {
      throw new ValidationError(`${field.label} is required.`);
    }
  }
  if (photos.length < spec.photoMin) {
    throw new ValidationError(`Attach at least ${spec.photoMin} photo(s).`);
  }
  if (photos.length > spec.photoMax) {
    throw new ValidationError(`${spec.title} accepts at most ${spec.photoMax} photo(s).`);
  }
  for (const photo of [...photos, signature]) {
    if (!looksLikeImage(photo.buffer)) throw new ValidationError("One of the uploaded files is not a valid image.");
  }

  const folder = `tmv-pwa/${jobId}/${spec.folderKey}`;
  const submittedAt = new Date().toISOString();
  const photoUrls = await Promise.all(
    photos.map((photo, index) => uploadEvidenceImage(photo.buffer, folder, `photo-${index}-${Date.now()}`))
  );
  const signatureUpload = await uploadEvidenceImage(signature.buffer, folder, `signature-${Date.now()}`);

  const submission: ScenarioSubmissionDoc = {
    jobId,
    scenario,
    driver: actor,
    fields,
    photoUrls: photoUrls.map(p => p.url),
    signatureUrl: signatureUpload.url,
    submittedAt
  };
  await insertScenarioSubmission(submission);
  await appendActivity({
    jobId, driver: actor, action: `${spec.title.toUpperCase().replace(/\s+/g, "_")}_SUBMITTED`,
    detail: `${photoUrls.length} photo(s)`
  });

  // If this scenario ran as one of the classic flow's "any issues?" detours (reached
  // via ISSUES_YES from WAITING_ARRIVAL_ISSUES_CHOICE / WAITING_EMPTY_VAN_ISSUES_CHOICE
  // -- see workflow.engine.ts), resume the classic flow right where it paused. Check
  // In/Check Out aren't part of that detour (they're standalone storage-job actions,
  // reachable any time regardless of workflow state), so this only applies to
  // parking/liability.
  const resumeTarget = RESUME_AFTER_ISSUES[job.currentState as WorkflowState];
  if (resumeTarget && (scenario === "parking" || scenario === "liability")) {
    const from = job.currentState;
    job.currentState = resumeTarget;
    const updated = await saveJob(job, driver, `${spec.title.toUpperCase().replace(/\s+/g, "_")}_SUBMITTED`, from);
    return { job: updated, submission };
  }

  return { job, submission };
}
