import { randomBytes } from "node:crypto";
import { assertAcceptableAttachment } from "../google/drive";
import { evidenceWrite, getEvidence, SheetWrite } from "../google/sheets";
import { ChatAttachment, EvidenceRecord, EvidenceStatus, EvidenceType } from "./job.types";
import { log } from "../utils/logger";

/** Task-name safe: [A-Z0-9-] only. */
export function newEvidenceId(): string {
  return `EV-${randomBytes(6).toString("hex").toUpperCase()}`;
}

/**
 * Builds RECEIVED evidence records from Chat attachments.
 *
 * Deliberately synchronous and network-free. It captures the minimum needed for the
 * worker to finish the job later — the media resourceName, the content type, the target
 * evidence type — and nothing else. The returned SheetWrites are meant to be composed
 * into the same commitWrites() call as the workflow transition, so accepting the photo
 * and advancing the state are one atomic Sheets batch.
 */
export function buildReceivedEvidence(
  jobId: string,
  driverEmail: string,
  evidenceType: EvidenceType,
  attachments: ChatAttachment[]
): { records: EvidenceRecord[]; writes: SheetWrite[] } {
  const receivedAt = new Date().toISOString();

  const records = attachments.map((attachment, index) => {
    // Throws PermanentTaskError for non-images / Drive links. Surfaced to the driver
    // immediately rather than discovered by a worker minutes later.
    const attachmentReference = assertAcceptableAttachment(attachment);
    return {
      evidenceId: newEvidenceId(),
      jobId,
      driverEmail,
      evidenceType,
      attachmentReference,
      contentType: attachment.contentType || "image/jpeg",
      fileName: attachment.contentName || attachment.name || `photo-${index + 1}.jpg`,
      status: EvidenceStatus.RECEIVED,
      receivedAt,
      processingStartedAt: "",
      processingCompletedAt: "",
      driveFileId: "",
      driveUrl: "",
      retryCount: 0,
      lastError: ""
    } satisfies EvidenceRecord;
  });

  return { records, writes: records.map(evidenceWrite) };
}

/**
 * Claims evidence for processing.
 *
 * Returns null when the record is already COMPLETED, which is the worker's idempotency
 * check: a redelivered task, a reaper re-drive and a manual retry all converge here and
 * only one of them does the upload.
 */
export async function claimEvidence(evidenceId: string): Promise<EvidenceRecord | null> {
  const record = await getEvidence(evidenceId);
  if (!record) throw new Error(`Evidence ${evidenceId} was not found.`);

  if (record.status === EvidenceStatus.COMPLETED) {
    log.info("evidence already completed; task is a no-op", {
      evidence_id: evidenceId,
      job_id: record.jobId,
      file_id: record.driveFileId
    });
    return null;
  }

  return {
    ...record,
    status: EvidenceStatus.PROCESSING,
    processingStartedAt: new Date().toISOString()
  };
}

export function markCompleted(
  record: EvidenceRecord,
  file: { fileId: string; fileUrl: string; fileName: string; contentType: string }
): EvidenceRecord {
  return {
    ...record,
    status: EvidenceStatus.COMPLETED,
    processingCompletedAt: new Date().toISOString(),
    driveFileId: file.fileId,
    driveUrl: file.fileUrl,
    fileName: file.fileName,
    contentType: file.contentType,
    lastError: ""
  };
}

/**
 * Records a retryable failure. Attempts are counted on the record rather than trusted
 * from the queue, so Cloud Tasks retries and reaper re-drives share one budget.
 */
export function markRetrying(record: EvidenceRecord, error: unknown): EvidenceRecord {
  return {
    ...record,
    status: EvidenceStatus.RECEIVED,
    processingStartedAt: "",
    retryCount: record.retryCount + 1,
    lastError: truncate(error)
  };
}

/** Terminal failure. The driver must re-upload; the completion gate will block until then. */
export function markFailed(record: EvidenceRecord, error: unknown): EvidenceRecord {
  return {
    ...record,
    status: EvidenceStatus.FAILED,
    processingCompletedAt: new Date().toISOString(),
    retryCount: record.retryCount + 1,
    lastError: truncate(error)
  };
}

/** Resets FAILED evidence so a driver-initiated retry gets a fresh attempt budget. */
export function markRequeued(record: EvidenceRecord): EvidenceRecord {
  return {
    ...record,
    status: EvidenceStatus.RECEIVED,
    processingStartedAt: "",
    processingCompletedAt: "",
    retryCount: 0,
    lastError: ""
  };
}

function truncate(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.length > 500 ? `${message.slice(0, 497)}...` : message;
}
