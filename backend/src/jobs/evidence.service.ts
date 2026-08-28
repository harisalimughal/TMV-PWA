import { randomBytes } from "node:crypto";
import { uploadEvidenceImage } from "../storage/cloudinary";
import { insertEvidence } from "../db/evidence.repo";
import { EvidenceRecord, EvidenceStatus, EvidenceType, Job } from "./job.types";
import { log } from "../utils/logger";

/** Task-name safe: [A-Z0-9-] only. Kept from the original for continuity, though
 * nothing here dedupes on it anymore -- direct upload has no retried-task concept. */
export function newEvidenceId(): string {
  return `EV-${randomBytes(6).toString("hex").toUpperCase()}`;
}

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/** Magic-byte check for JPEG, PNG, GIF, WebP, HEIC/HEIF. Carried over from
 * google/drive.ts's looksLikeImage -- still the cheapest way to catch a mislabeled
 * upload before spending a Cloudinary call on it. Exported for the signature-upload
 * route, which validates the same way but doesn't go through uploadEvidence (a
 * signature isn't an EvidenceRecord -- see workflow.engine.ts's submitDrawnSignature). */
export function looksLikeImage(buffer: Buffer): boolean {
  if (buffer.length < 12) return false;
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return true; // JPEG
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return true; // PNG
  if (buffer.subarray(0, 3).toString("latin1") === "GIF") return true; // GIF
  if (buffer.subarray(0, 4).toString("latin1") === "RIFF" && buffer.subarray(8, 12).toString("latin1") === "WEBP") return true;
  if (buffer.subarray(4, 8).toString("latin1") === "ftyp") return true; // HEIC/HEIF/AVIF
  return false;
}

export class InvalidImageError extends Error {}

/**
 * Uploads one photo synchronously and returns a COMPLETED (or throws on failure)
 * evidence record, persisted to Mongo.
 *
 * This replaces the old two-hop pipeline (accept a Chat attachment reference ->
 * background worker downloads from Chat -> uploads to Drive), which existed only
 * because Chat attachments aren't raw bytes the server already has. The PWA's camera
 * upload posts the actual file directly, so there's no "download" step and nothing
 * async to queue -- one Cloudinary call, done inside the request.
 */
export async function uploadEvidence(
  job: Job,
  driverEmail: string,
  evidenceType: EvidenceType,
  buffer: Buffer,
  contentType: string,
  fileName: string
): Promise<EvidenceRecord> {
  if (buffer.byteLength > MAX_IMAGE_BYTES) {
    throw new InvalidImageError(`Photo exceeds the maximum of ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)} MB.`);
  }
  if (!looksLikeImage(buffer)) {
    throw new InvalidImageError("The uploaded file is not a valid image.");
  }

  const evidenceId = newEvidenceId();
  const receivedAt = new Date().toISOString();
  const folder = `tmv-pwa/${job.jobId}/${evidenceType}`;

  let record: EvidenceRecord;
  try {
    const uploaded = await uploadEvidenceImage(buffer, folder, evidenceId);
    record = {
      evidenceId,
      jobId: job.jobId,
      driverEmail,
      evidenceType,
      contentType: uploaded.contentType || contentType,
      fileName,
      status: EvidenceStatus.COMPLETED,
      receivedAt,
      processingStartedAt: receivedAt,
      processingCompletedAt: new Date().toISOString(),
      cloudinaryPublicId: uploaded.publicId,
      cloudinaryUrl: uploaded.url,
      retryCount: 0,
      lastError: ""
    };
  } catch (error) {
    log.error("evidence upload failed", { job_id: job.jobId, evidence_type: evidenceType, error: String(error) });
    record = {
      evidenceId,
      jobId: job.jobId,
      driverEmail,
      evidenceType,
      contentType,
      fileName,
      status: EvidenceStatus.FAILED,
      receivedAt,
      processingStartedAt: receivedAt,
      processingCompletedAt: new Date().toISOString(),
      cloudinaryPublicId: "",
      cloudinaryUrl: "",
      retryCount: 0,
      lastError: error instanceof Error ? error.message : String(error)
    };
  }

  await insertEvidence(record);
  if (record.status === EvidenceStatus.FAILED) {
    throw new Error(record.lastError || "Photo upload failed. Please try again.");
  }
  return record;
}
