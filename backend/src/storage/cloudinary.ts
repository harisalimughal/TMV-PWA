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
          reject(error ?? new Error("Cloudinary upload returned no result."));
          return;
        }
        resolve({ publicId: result.public_id, url: result.secure_url, contentType: `image/${result.format}` });
      }
    );
    stream.end(buffer);
  }).catch(error => {
    log.error("cloudinary upload failed", { folder, public_id: publicId, error: String(error) });
    throw error;
  });
}
