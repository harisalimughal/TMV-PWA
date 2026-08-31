import { v2 as cloudinary } from "cloudinary";
import { env } from "../config/env";
import { log } from "../utils/logger";

let configured = false;

/** Lazy, like the Mongo/driver-setup-link config elsewhere -- the URL isn't set yet
 * (client is providing it later), so this only throws when an upload is actually
 * attempted, not at import/startup time. */
function ensureConfigured(): void {
  if (configured) return;
  if (!env.cloudinaryUrl) {
    throw new Error(
      "CLOUDINARY_URL is not set. Evidence photo upload is unavailable until it's configured " +
        "(see config/env.ts's cloudinaryUrl)."
    );
  }
  // The SDK reads CLOUDINARY_URL from process.env itself on `cloudinary.config()` with
  // no args -- but env.ts already trims/validates it, so config() is called explicitly
  // with the parsed value instead of relying on the SDK re-reading process.env.
  cloudinary.config({ secure: true, ...parseCloudinaryUrl(env.cloudinaryUrl) });
  configured = true;
}

function parseCloudinaryUrl(url: string): { cloud_name: string; api_key: string; api_secret: string } {
  // cloudinary://<api_key>:<api_secret>@<cloud_name>
  const match = url.match(/^cloudinary:\/\/([^:]+):([^@]+)@(.+)$/);
  if (!match) throw new Error("CLOUDINARY_URL is malformed. Expected cloudinary://<key>:<secret>@<cloud_name>.");
  const [, api_key, api_secret, cloud_name] = match;
  return { cloud_name, api_key, api_secret };
}

export interface UploadedImage {
  publicId: string;
  url: string;
  contentType: string;
}

/**
 * Uploads one evidence photo. Synchronous from the caller's point of view -- unlike the
 * old Chat-attachment pipeline (download from Chat, then upload to Drive, hence the
 * async queue+worker+reaper machinery it needed), the PWA already has the raw bytes in
 * the request body, so this is a single upload call directly in the request handler.
 */
export async function uploadEvidenceImage(
  buffer: Buffer,
  folder: string,
  publicId: string
): Promise<UploadedImage> {
  ensureConfigured();
  return new Promise<UploadedImage>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, public_id: publicId, resource_type: "image", overwrite: true },
      (error, result) => {
        if (error || !result) {
          // The SDK's error is a plain {message, http_code, ...} object, not an Error
          // instance -- String(error) on it gives the useless "[object Object]"; pull
          // .message out explicitly so both the log and the thrown error are readable.
          reject(new Error(errorMessage(error) ?? "Cloudinary upload returned no result."));
          return;
        }
        resolve({ publicId: result.public_id, url: result.secure_url, contentType: `image/${result.format}` });
      }
    );
    stream.end(buffer);
  }).catch(error => {
    log.error("cloudinary upload failed", { folder, public_id: publicId, error: errorMessage(error) });
    throw error;
  });
}

/**
 * Cloudinary delivery URLs support transformations via a segment inserted right after
 * `/upload/` -- no extra API call or storage; the CDN transforms and caches the result
 * on first request. `thumbProxyUrl` (db/mongo.ts normalization, admin/dashboard/
 * normalize.ts and scenarios.routes.ts) used to just be the same URL as `driveUrl`,
 * the full-resolution original -- meaning every evidence grid, list thumbnail, and
 * the admin print/PDF flow all downloaded the same multi-hundred-KB photo regardless
 * of the tiny size most of them actually render at. That made the print flow
 * (SubmissionDetailDrawer's waitForPrintImages, web/src/screens/admin/dashboard/
 * utils/printReady.ts) slow enough on a real connection to occasionally outrun its
 * own wait timeout and print a still-loading photo as blank.
 *
 * w_900 keeps enough resolution to still be legible printed at up to A4 width (the
 * dossier report shows one photo per page); q_auto/f_auto let Cloudinary pick the
 * smallest quality/format (WebP/AVIF where the requesting browser supports it) that
 * still looks right, instead of always shipping the original JPEG at full quality.
 * A no-op on any URL that isn't a Cloudinary /upload/ delivery URL.
 */
export function toThumbnailUrl(url: string): string {
  return url.replace("/upload/", "/upload/w_900,q_auto,f_auto/");
}

function errorMessage(error: unknown): string | undefined {
  if (!error) return undefined;
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && "message" in error) return String((error as { message: unknown }).message);
  return String(error);
}
