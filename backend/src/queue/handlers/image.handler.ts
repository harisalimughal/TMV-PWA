import { env } from "../../config/env";
import { downloadChatMedia, uploadEvidenceImage } from "../../google/drive";
import {
  activityWrite, commitWrites, evidenceWrite, exceptionWrite, getJob, photoWrite, SheetWrite
} from "../../google/sheets";
import { claimEvidence, markCompleted, markFailed, markRetrying } from "../../jobs/evidence.service";
import { EvidenceRecord } from "../../jobs/job.types";
import { log, setContext } from "../../utils/logger";
import { withTimeout } from "../../utils/retry";
import { PermanentTaskError, ProcessJobImageTask } from "../queue.types";

/**
 * PROCESS_JOB_IMAGE.
 *
 * Download Chat media -> upload to Drive -> record the URL -> mark COMPLETED.
 *
 * Contract with the worker route:
 *   returns normally      -> HTTP 200, Cloud Tasks considers the task done
 *   throws PermanentTaskError -> HTTP 200, evidence FAILED, no further retries
 *   throws anything else  -> HTTP 500, Cloud Tasks retries with backoff
 */
export async function handleProcessJobImage(task: ProcessJobImageTask): Promise<void> {
  setContext({ jobId: task.jobId });

  // Idempotency gate. A redelivered task, a reaper re-drive and a manual retry all land
  // here; only the first one that finds the record incomplete does any work.
  const claimed = await claimEvidence(task.evidenceId);
  if (!claimed) return;

  const job = await getJob(task.jobId);
  if (!job) {
    await persist(markFailed(claimed, `Job ${task.jobId} no longer exists.`), [
      exceptionWrite({ jobId: task.jobId, type: "EVIDENCE_ORPHANED", detail: task.evidenceId })
    ]);
    throw new PermanentTaskError(`Job ${task.jobId} was not found.`);
  }

  // Publish PROCESSING before the slow work so the reaper can tell "in flight" from
  // "never picked up", and so the completion gate reports it as pending rather than missing.
  await persist(claimed);

  const started = Date.now();
  try {
    const file = await withTimeout(
      "process image",
      (async () => {
        const media = await downloadChatMedia(claimed.attachmentReference);
        return uploadEvidenceImage(
          job,
          claimed.evidenceType,
          claimed.evidenceId,
          claimed.fileName,
          media.buffer,
          media.contentType || claimed.contentType
        );
      })(),
      env.imageTaskTimeoutMs
    );

    const completed = markCompleted(claimed, file);

    // Evidence row, the audit Photos row and the activity row in one batchUpdate.
    await persist(completed, [
      photoWrite({
        jobId: completed.jobId,
        driver: completed.driverEmail,
        step: completed.evidenceType,
        fileId: completed.driveFileId,
        fileUrl: completed.driveUrl,
        fileName: completed.fileName,
        contentType: completed.contentType
      }),
      activityWrite({
        jobId: completed.jobId,
        driver: completed.driverEmail,
        action: `EVIDENCE_${completed.evidenceType.toUpperCase()}_STORED`,
        detail: completed.driveUrl
      })
    ]);

    log.info("evidence processed", {
      evidence_id: completed.evidenceId,
      step: completed.evidenceType,
      duration_ms: Date.now() - started
    });
  } catch (error) {
    await recordFailure(claimed, error, Date.now() - started);
    throw error;
  }
}

async function recordFailure(record: EvidenceRecord, error: unknown, durationMs: number): Promise<void> {
  const permanent = error instanceof PermanentTaskError;
  const exhausted = record.retryCount + 1 >= env.evidenceMaxAttempts;

  if (permanent || exhausted) {
    const failed = markFailed(record, error);
    await persist(failed, [
      exceptionWrite({
        jobId: failed.jobId,
        type: permanent ? "EVIDENCE_PERMANENT_FAILURE" : "EVIDENCE_RETRIES_EXHAUSTED",
        detail: `${failed.evidenceType} ${failed.evidenceId}: ${failed.lastError}`
      }),
      activityWrite({
        jobId: failed.jobId,
        driver: failed.driverEmail,
        action: "EVIDENCE_FAILED",
        detail: failed.lastError
      })
    ]);
    log.error("evidence permanently failed", error, {
      evidence_id: failed.evidenceId,
      attempts: failed.retryCount,
      permanent,
      duration_ms: durationMs
    });
    return;
  }

  const retrying = markRetrying(record, error);
  await persist(retrying);
  log.warn("evidence processing failed; will retry", {
    evidence_id: retrying.evidenceId,
    attempt: retrying.retryCount,
    max_attempts: env.evidenceMaxAttempts,
    duration_ms: durationMs,
    error: retrying.lastError
  });
}

function persist(record: EvidenceRecord, extras: SheetWrite[] = []): Promise<void> {
  return commitWrites([evidenceWrite(record), ...extras]);
}
