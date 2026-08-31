/**
 * Downscale camera photos before upload.
 *
 * The camera input handed the raw File straight to FormData, so a driver uploading the
 * 8 photos a Liability Report allows was pushing 30-60MB over mobile data with no
 * progress indicator. At 1600px on the long edge a typical 8MB phone photo lands
 * around 400KB -- a ~20x saving with no loss of anything that matters for evidence
 * (you can still read a parking sign or see a scuff on a wall).
 *
 * Everything here degrades safely: if the browser can't decode the image, or the
 * "compressed" result somehow comes out bigger, the original File is returned
 * untouched. Never lose a photo to an optimisation.
 */

const MAX_EDGE_PX = 1600;
const JPEG_QUALITY = 0.82;
/** Below this, re-encoding costs more than it saves. */
const SKIP_UNDER_BYTES = 400 * 1024;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("decode failed"));
    };
    img.src = url;
  });
}

export async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.size < SKIP_UNDER_BYTES) return file;
  // HEIC from an iPhone set to "High Efficiency" can't be decoded by canvas in most
  // browsers -- pass it through and let the server deal with it.
  if (file.type === "image/heic" || file.type === "image/heif") return file;

  try {
    const img = await loadImage(file);
    const longest = Math.max(img.naturalWidth, img.naturalHeight);
    const scale = longest > MAX_EDGE_PX ? MAX_EDGE_PX / longest : 1;

    const width = Math.round(img.naturalWidth * scale);
    const height = Math.round(img.naturalHeight * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, width, height);

    const blob = await new Promise<Blob | null>(resolve =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY)
    );
    if (!blob || blob.size >= file.size) return file;

    const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg", lastModified: Date.now() });
  } catch {
    return file;
  }
}

export async function compressAll(files: File[]): Promise<File[]> {
  return Promise.all(files.map(compressImage));
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
