import { uploadEvidenceImage } from "../storage/cloudinary";
import { looksLikeImage } from "./evidence.service";
import { insertScenarioSubmission, ScenarioSubmissionDoc } from "../db/scenario.repo";
import { appendActivity } from "../db/activity.repo";
import { getJobForDriver, resolveDriver, saveJob } from "./jobs.service";
import { ScenarioKey, ScenarioSpec, SCENARIOS } from "../workflow/scenario.spec";
import { RESUME_AFTER_ISSUES, WorkflowState } from "../workflow/workflow.states";
import { ValidationError } from "../workflow/validation.engine";
import { Job } from "./job.types";

export interface ScenarioPhoto {
  buffer: Buffer;
  contentType: string;
}

/** Shared by both submitScenario (job-scoped: Parking Liability / Liability Report)
 * and submitStorageScenario (standalone: Check In / Check Out) -- the same field/photo
 * rules apply regardless of what the submission ends up attached to. */
function validateScenarioSubmission(
  spec: ScenarioSpec,
  fields: Record<string, string>,
  photos: ScenarioPhoto[],
  signature: ScenarioPhoto
): void {
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
}

/**
 * One-shot submission of a job-scoped scenario form (Parking Liability / Liability
 * Report -- reached from the move workflow's "any issues?" detour) -- ported from
 * TMV-Chat-bot's chat/scenario.engine.ts, which drove the same forms as a
 * one-field-per-Chat-card wizard (hence its step machine: ScenarioProgressRecord,
 * "field N" / "photos" / "signature" steps persisted between messages). The PWA
 * renders the whole form on one scrollable screen instead (see
 * web/src/screens/ScenarioFormScreen.tsx), so there's no multi-step progress to persist
 * -- this just validates everything at once and writes one submission document.
 *
 * Check In/Check Out used to run through here too, but they're standalone storage-job
 * actions with no real connection to a move job -- see submitStorageScenario below,
 * reachable without opening any job first.
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

  validateScenarioSubmission(spec, fields, photos, signature);

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
  // -- see workflow.engine.ts), resume the classic flow right where it paused.
  const resumeTarget = RESUME_AFTER_ISSUES[job.currentState as WorkflowState];
  if (resumeTarget) {
    const from = job.currentState;
    job.currentState = resumeTarget;
    const updated = await saveJob(job, driver, `${spec.title.toUpperCase().replace(/\s+/g, "_")}_SUBMITTED`, from);
    return { job: updated, submission };
  }

  return { job, submission };
}

/**
 * Check In / Check Out -- a driver can submit either any time, for any storage item,
 * without opening (or even having) a move job. No job to look up or authorize against,
 * just the driver's own identity. Evidence is grouped under a synthetic reference
 * (timestamp-based, not the free-text container number the driver types -- that can
 * repeat or contain characters unsafe in a Cloudinary folder path) instead of a real
 * jobId; the admin dashboard's Check In/Check Out pages already key off the
 * container-number field for display, and already render a "--" when a submission's
 * jobId doesn't match a real job, so there's nothing on that side that needs to change.
 */
export async function submitStorageScenario(
  scenario: "checkin" | "checkout",
  identifier: string,
  fields: Record<string, string>,
  photos: ScenarioPhoto[],
  signature: ScenarioPhoto
): Promise<{ submission: ScenarioSubmissionDoc }> {
  const spec = SCENARIOS[scenario];
  const driver = await resolveDriver(identifier);
  const actor = driver.email || driver.chatUserName;

  validateScenarioSubmission(spec, fields, photos, signature);

  const ref = `STORAGE-${Date.now().toString(36).toUpperCase()}`;
  const folder = `tmv-pwa/${ref}/${spec.folderKey}`;
  const submittedAt = new Date().toISOString();
  const photoUrls = await Promise.all(
    photos.map((photo, index) => uploadEvidenceImage(photo.buffer, folder, `photo-${index}-${Date.now()}`))
  );
  const signatureUpload = await uploadEvidenceImage(signature.buffer, folder, `signature-${Date.now()}`);

  const submission: ScenarioSubmissionDoc = {
    jobId: ref,
    scenario,
    driver: actor,
    fields,
    photoUrls: photoUrls.map(p => p.url),
    signatureUrl: signatureUpload.url,
    submittedAt
  };
  await insertScenarioSubmission(submission);
  await appendActivity({
    jobId: ref, driver: actor, action: `${spec.title.toUpperCase().replace(/\s+/g, "_")}_SUBMITTED`,
    detail: `${photoUrls.length} photo(s)`
  });

  return { submission };
}
