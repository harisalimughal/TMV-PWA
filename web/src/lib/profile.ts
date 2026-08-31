import { useSyncExternalStore } from "react";

/**
 * A per-device profile-photo override.
 *
 * The production API's driver profile is `{ email, fullName, initials }` — there is no
 * avatar field and no profile-update endpoint (the backend is not in this repo). So a
 * custom photo is stored locally, on this device only, as a downscaled data URL, and
 * every <Avatar> for the signed-in driver reads it through the hook below. It is
 * explicitly not synced anywhere; the Settings screen says as much.
 *
 * When the backend gains `avatarUrl` + `PATCH /api/driver/profile`, this becomes the
 * offline/optimistic layer over that call rather than the source of truth.
 */

const KEY = "tmv-driver-avatar";
const MAX_DIMENSION = 320;
export const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
export const ACCEPTED_AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"];

const listeners = new Set<() => void>();

function read(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function emit() {
  for (const l of listeners) l();
}

export function setLocalAvatar(dataUrl: string): void {
  try {
    localStorage.setItem(KEY, dataUrl);
  } catch {
    /* storage full / disabled — the in-memory subscribers still update this session */
  }
  emit();
}

export function clearLocalAvatar(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  emit();
}

/** Subscribe to changes (used by useSyncExternalStore). */
function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** The current local avatar data URL, or null. Re-renders on change. */
export function useLocalAvatar(): string | null {
  return useSyncExternalStore(subscribe, read, () => null);
}

/**
 * Downscale a chosen image file to a small square-ish JPEG data URL, so localStorage
 * isn't asked to hold a multi-megabyte string and the avatar renders instantly.
 */
export async function fileToAvatarDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Couldn't process that image.");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  return canvas.toDataURL("image/jpeg", 0.85);
}
