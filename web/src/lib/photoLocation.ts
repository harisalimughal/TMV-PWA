import type { PhotoCaptureMeta } from "./geo";

export function photoLocationBlockedReason(
  photoCount: number,
  metas: Array<PhotoCaptureMeta | null>,
  requireLocation = true
): string | undefined {
  if (!requireLocation || photoCount === 0) return undefined;
  for (let i = 0; i < photoCount; i += 1) {
    if (!metas[i]?.location) return "Getting location. Please wait a moment before continuing.";
  }
  return undefined;
}
