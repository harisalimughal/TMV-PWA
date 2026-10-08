import type { PhotoCaptureMeta } from "./geo";

export function photoLocationErrorMessage(error: PhotoCaptureMeta["locationError"]): string {
  switch (error) {
    case "denied":
      return "Location permission is required for this app to continue. Please allow location access.";
    case "unavailable":
      return "Device location appears to be off. Turn on Location Services or GPS, then capture the photo again.";
    case "timeout":
      return "Location could not be found in time. Move near a window or outside, then retry the photo.";
    case "unsupported":
      return "This browser cannot provide location. Open the driver app in a browser with location support.";
    default:
      return "Getting location. Please wait a moment before continuing.";
  }
}

export type PhotoLocationAction = "allow" | "retry-location" | "capture-again";

export interface PhotoLocationIssue {
  message: string;
  action: PhotoLocationAction;
  actionLabel: string;
}

export function photoLocationIssue(
  photoCount: number,
  metas: Array<PhotoCaptureMeta | null>,
  requireLocation = true
): PhotoLocationIssue | undefined {
  if (!requireLocation || photoCount === 0) return undefined;
  for (let i = 0; i < photoCount; i += 1) {
    const meta = metas[i];
    if (meta?.location) continue;
    const error = meta?.locationError;
    if (error === "denied") {
      return {
        message: photoLocationErrorMessage(error),
        action: "allow",
        actionLabel: "Allow location"
      };
    }
    if (error === "unavailable" || error === "unsupported") {
      return {
        message: photoLocationErrorMessage(error),
        action: "capture-again",
        actionLabel: "Capture again"
      };
    }
    if (error === "timeout") {
      return {
        message: photoLocationErrorMessage(error),
        action: "retry-location",
        actionLabel: "Try location again"
      };
    }
    return {
      message: photoLocationErrorMessage(error),
      action: "retry-location",
      actionLabel: "Try location again"
    };
  }
  return undefined;
}

export function photoLocationBlockedReason(
  photoCount: number,
  metas: Array<PhotoCaptureMeta | null>,
  requireLocation = true
): string | undefined {
  return photoLocationIssue(photoCount, metas, requireLocation)?.message;
}
