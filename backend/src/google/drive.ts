import { Readable } from "node:stream";
import { google, drive_v3 } from "googleapis";
import { createGoogleAuth, env, SCOPES } from "../config/env";
import { ChatAttachment, EvidenceType, Job } from "../jobs/job.types";
import { commitWrites, jobWrite } from "./sheets";
import { DateTime } from "luxon";
import { withRetry, withTimeout } from "../utils/retry";
import { PermanentTaskError } from "../queue/queue.types";
import { log } from "../utils/logger";

let clientPromise: Promise<drive_v3.Drive> | null = null;

async function driveClient(): Promise<drive_v3.Drive> {
  if (!clientPromise) {
    clientPromise = createGoogleAuth(SCOPES.DRIVE)
      .then(auth => google.drive({ version: "v3", auth }))
      .catch(error => {
        clientPromise = null;
        throw error;
      });
  }
  return clientPromise;
}

/**
 * Folder ids are cached for the process lifetime, keyed by parent + name.
 *
 * The date chain (Jobs/YYYY/MM/DD) is shared by every job on a given day, so after
 * the first job of the day it costs nothing. The promise itself is cached so two
 * concurrent uploads cannot race into creating duplicate folders.
 */
const folderCache = new Map<string, Promise<string>>();

async function resolveFolder(parentId: string, name: string): Promise<string> {
  const drive = await driveClient();
  const escaped = name.replace(/'/g, "\\'");
  const result = await withRetry("drive.files.list", () =>
    drive.files.list({
      q: `'${parentId}' in parents and name='${escaped}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: "files(id,name)",
      pageSize: 1,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true
    })
  );
  const existing = result.data.files?.[0]?.id;
  if (existing) return existing;

  const created = await withRetry(
    "drive.files.create.folder",
    () =>
      drive.files.create({
        supportsAllDrives: true,
        requestBody: { name, mimeType: "application/vnd.google-apps.folder", parents: [parentId] },
        fields: "id"
      }),
    "rate-limit-only"
  );
  if (!created.data.id) throw new Error(`Failed to create Drive folder: ${name}`);
  return created.data.id;
}

function findOrCreateFolder(parentId: string, name: string): Promise<string> {
  const key = `${parentId}/${name}`;
  let existing = folderCache.get(key);
  if (!existing) {
    existing = resolveFolder(parentId, name).catch(error => {
      folderCache.delete(key);
      throw error;
    });
    folderCache.set(key, existing);
  }
  return existing;
}

export type ScenarioFolderKey = "CheckIn" | "CheckOut" | "ParkingLiability" | "LiabilityReport";
export type JobFolderKey = EvidenceType | "Signature" | "Documents" | ScenarioFolderKey;

/**
 * Returns the job's root evidence folder.
 *
 * If the job already carries a driveFolderId this is free. The previous
 * ensureJobFolders() eagerly created eleven folders in strict sequence on every
 * call, including on every photo upload.
 */
export async function ensureJobFolder(job: Job): Promise<string> {
  if (job.driveFolderId) return job.driveFolderId;
  const jobsRoot = await findOrCreateFolder(env.driveRootFolderId, "Jobs");
  const dt = DateTime.fromISO(job.bookedStart || new Date().toISOString(), { zone: env.timezone });
  const year = await findOrCreateFolder(jobsRoot, dt.toFormat("yyyy"));
  const month = await findOrCreateFolder(year, dt.toFormat("MM"));
  const day = await findOrCreateFolder(month, dt.toFormat("dd"));
  const folderId = await findOrCreateFolder(day, `Job_${job.jobId}`);

  // Was resolved on every single upload and never written back -- the Bookings sheet's
  // Drive Folder ID/URL columns stayed blank forever, and every future upload paid for
  // another Drive files.list call instead of using the cheap job.driveFolderId path
  // above. Persist it once, here, so both are fixed going forward.
  job.driveFolderId = folderId;
  job.driveFolderUrl = jobFolderUrl(folderId);
  await commitWrites([jobWrite(job)]).catch(error =>
    log.warn("failed to persist Drive folder id/url onto the booking row", { job_id: job.jobId, error: String(error) })
  );

  return folderId;
}

/** Creates the step subfolder on first use only. */
export async function ensureStepFolder(job: Job, key: JobFolderKey): Promise<string> {
  const jobFolder = await ensureJobFolder(job);
  return findOrCreateFolder(jobFolder, key);
}

export function jobFolderUrl(folderId: string): string {
  return `https://drive.google.com/drive/folders/${folderId}`;
}

let chatTokenClient: Promise<any> | null = null;

async function getChatAccessToken(): Promise<string> {
  if (!chatTokenClient) {
    chatTokenClient = createGoogleAuth(SCOPES.CHAT_BOT).catch(error => {
      chatTokenClient = null;
      throw error;
    });
  }
  // getAccessToken() reuses the token cached on the client until it expires.
  const token = await (await chatTokenClient).getAccessToken();
  const value = typeof token === "string" ? token : token?.token;
  if (!value) throw new Error("Unable to obtain Google Chat API access token");
  return value;
}

/**
 * Validates attachment metadata only. Cheap, no network, safe to run on the Chat
 * request path before the evidence record is created.
 *
 * TODO(pwa): this whole Chat-media path (this function, downloadChatMedia,
 * getChatAccessToken) assumes Google Chat's attachment format. The new PWA's camera
 * upload will post a raw multipart file directly instead -- evidence.service.ts's
 * buildReceivedEvidence(), workflow.engine.ts, and image.handler.ts all currently
 * type their attachment input as ChatAttachment[] and end up calling downloadChatMedia()
 * to fetch bytes; that whole chain needs a second, PWA-specific path (or a shared
 * "photo source" abstraction) once the direct-upload endpoint is designed. Left as-is
 * and working for now so this copy compiles cleanly as a starting point.
 */
export function assertAcceptableAttachment(attachment: ChatAttachment): string {
  const contentType = attachment.contentType || "";
  if (!contentType.startsWith("image/")) {
    throw new PermanentTaskError(`Only image attachments are accepted. Received ${contentType || "unknown type"}.`);
  }
  const resourceName = attachment.attachmentDataRef?.resourceName;
  if (!resourceName) {
    if (attachment.driveDataRef?.driveFileId) {
      throw new PermanentTaskError(
        "This attachment is a Google Drive file. Please upload the photo directly into Google Chat instead."
      );
    }
    throw new PermanentTaskError("Attachment does not contain an uploaded Chat media resource.");
  }
  return resourceName;
}

/**
 * Downloads Chat media. Background only — this is the call that used to hold the driver
 * on a spinner for up to 15 seconds per photo.
 *
 * Content-Length is checked before the body is read so an oversized upload is rejected
 * without ever being resident in memory.
 */
export async function downloadChatMedia(resourceName: string): Promise<{ buffer: Buffer; contentType: string }> {
  const token = await getChatAccessToken();
  const response = await withTimeout(
    "Chat media download",
    fetch(`https://chat.googleapis.com/v1/media/${resourceName}?alt=media`, {
      headers: { Authorization: `Bearer ${token}` }
    }),
    env.mediaDownloadTimeoutMs
  );

  if (response.status === 404 || response.status === 403) {
    // The Chat message is gone or the media reference has expired. Retrying cannot help.
    throw new PermanentTaskError(
      `The uploaded photo is no longer available from Google Chat (${response.status}). Please upload it again.`
    );
  }
  if (!response.ok) {
    throw new Error(`Google Chat media download failed: ${response.status} ${await response.text()}`);
  }

  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > env.maxImageBytes) {
    throw new PermanentTaskError(
      `Photo is ${Math.round(declared / 1024 / 1024)} MB; the maximum is ${Math.round(env.maxImageBytes / 1024 / 1024)} MB.`
    );
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > env.maxImageBytes) {
    throw new PermanentTaskError(
      `Photo exceeds the maximum of ${Math.round(env.maxImageBytes / 1024 / 1024)} MB.`
    );
  }
  if (!looksLikeImage(buffer)) {
    // Metadata said image/*; the bytes disagree. Never retryable.
    throw new PermanentTaskError("The uploaded file is not a valid image.");
  }

  return { buffer, contentType: response.headers.get("content-type") || "image/jpeg" };
}

/** Magic-byte check for JPEG, PNG, GIF, WebP, HEIC/HEIF. */
function looksLikeImage(buffer: Buffer): boolean {
  if (buffer.length < 12) return false;
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return true;                                  // JPEG
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return true; // PNG
  if (buffer.subarray(0, 3).toString("latin1") === "GIF") return true;                          // GIF
  if (buffer.subarray(0, 4).toString("latin1") === "RIFF" && buffer.subarray(8, 12).toString("latin1") === "WEBP") return true;
  if (buffer.subarray(4, 8).toString("latin1") === "ftyp") return true;                         // HEIC/HEIF/AVIF
  return false;
}

/**
 * Streams a Drive file's raw bytes for the admin panel's photo-thumbnail proxy (see
 * admin/admin.routes.ts). Evidence photos and signatures are never made publicly
 * shared -- the admin browser has no Google session that could load a Drive URL
 * directly, so the backend fetches the bytes itself with the same credentials it
 * uploaded them with, and hands them back over its own connection.
 */
export async function getDriveFileMedia(fileId: string): Promise<{ buffer: Buffer; contentType: string }> {
  const drive = await driveClient();
  const result = await withRetry("drive.files.get.media", () =>
    drive.files.get(
      { fileId, alt: "media", supportsAllDrives: true },
      { responseType: "arraybuffer" }
    )
  );
  const contentType = (result.headers as Record<string, string> | undefined)?.["content-type"] || "application/octet-stream";
  return { buffer: Buffer.from(result.data as ArrayBuffer), contentType };
}

export interface SavedEvidence {
  fileId: string;
  fileUrl: string;
  fileName: string;
  contentType: string;
}

/**
 * Deterministic file name, derived from the evidence id.
 *
 * This is what makes the Drive upload idempotent without a transaction: a retried task
 * produces the identical name, so findFileByName() can adopt the file a previous attempt
 * created but failed to record.
 */
export function evidenceFileName(job: Job, key: JobFolderKey, evidenceId: string, original: string): string {
  const extension = (original.match(/\.([A-Za-z0-9]{1,5})$/)?.[1] || "jpg").toLowerCase();
  return `${job.jobId}_${key}_${evidenceId}.${extension}`.replace(/[^A-Za-z0-9._-]/g, "_");
}

async function findFileByName(folderId: string, name: string): Promise<SavedEvidence | null> {
  const drive = await driveClient();
  const escaped = name.replace(/'/g, "\\'");
  const result = await withRetry("drive.files.list.byName", () =>
    drive.files.list({
      q: `'${folderId}' in parents and name='${escaped}' and trashed=false`,
      fields: "files(id,name,mimeType,webViewLink)",
      pageSize: 1,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true
    })
  );
  const file = result.data.files?.[0];
  if (!file?.id) return null;
  return {
    fileId: file.id,
    fileUrl: file.webViewLink || `https://drive.google.com/open?id=${file.id}`,
    fileName: file.name || name,
    contentType: file.mimeType || "image/jpeg"
  };
}

/**
 * Stores one evidence image. Background only.
 *
 * Idempotent: if a file with the deterministic name already exists in the target folder,
 * that file is adopted instead of uploading a second copy. This is what prevents a
 * Cloud Tasks retry after a lost response from duplicating the photo.
 */
export async function uploadEvidenceImage(
  job: Job,
  key: JobFolderKey,
  evidenceId: string,
  originalName: string,
  buffer: Buffer,
  contentType: string
): Promise<SavedEvidence> {
  const [targetFolderId, drive] = await Promise.all([ensureStepFolder(job, key), driveClient()]);
  const safeName = evidenceFileName(job, key, evidenceId, originalName);

  const existing = await findFileByName(targetFolderId, safeName);
  if (existing) {
    log.info("evidence already present in Drive; adopting existing file", {
      job_id: job.jobId,
      evidence_id: evidenceId,
      file_id: existing.fileId
    });
    return existing;
  }

  const created = await withRetry(
    "drive.files.create.upload",
    () =>
      drive.files.create({
        supportsAllDrives: true,
        requestBody: { name: safeName, parents: [targetFolderId] },
        media: { mimeType: contentType, body: Readable.from(buffer) },
        fields: "id,webViewLink,name,mimeType"
      }),
    "rate-limit-only"
  );

  if (!created.data.id) throw new Error("Drive upload did not return a file ID.");
  log.debug("evidence stored", { job_id: job.jobId, step: key, evidence_id: evidenceId });

  return {
    fileId: created.data.id,
    fileUrl: created.data.webViewLink || `https://drive.google.com/open?id=${created.data.id}`,
    fileName: created.data.name || safeName,
    contentType: created.data.mimeType || contentType
  };
}
