/**
 * Camera capability check + error mapping.
 *
 * Kept free of React/DOM side effects so the getUserMedia rejection → driver-facing
 * message mapping can be unit-tested without a real camera.
 */

export type CameraStatus =
  | "idle"
  | "requesting"
  | "ready"
  | "denied"
  | "notfound"
  | "inuse"
  | "unsupported"
  | "error";

export type CameraFailure = Exclude<CameraStatus, "idle" | "requesting" | "ready">;

export interface CameraErrorInfo {
  status: CameraFailure;
  /** Shown to the driver — plain language, no jargon. */
  message: string;
  /** Optional recovery hint. */
  hint?: string;
}

/** True when an in-app camera stream is possible (needs a secure context on real devices). */
export function isCameraSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === "function" &&
    typeof window !== "undefined" &&
    typeof window.MediaStream === "function"
  );
}

/** Map a getUserMedia rejection to a status + message. Never throws. */
export function mapCameraError(err: unknown): CameraErrorInfo {
  const name =
    err && typeof err === "object" && "name" in err
      ? String((err as { name: unknown }).name)
      : String(err);

  switch (name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
    case "SecurityError":
      return {
        status: "denied",
        message: "Camera access is required to take this photo.",
        hint: "Allow camera access for this site in your browser settings, then try again.",
      };
    case "NotFoundError":
    case "DevicesNotFoundError":
    case "OverconstrainedError":
    case "ConstraintNotSatisfiedError":
      return {
        status: "notfound",
        message: "No camera was found on this device.",
      };
    case "NotReadableError":
    case "TrackStartError":
    case "AbortError":
      return {
        status: "inuse",
        message: "The camera is being used by another app.",
        hint: "Close any other app that might be using the camera, then try again.",
      };
    case "TypeError":
      return {
        status: "unsupported",
        message: "This browser can't open the camera.",
      };
    default:
      return {
        status: "error",
        message: "The camera couldn't be started. Please try again.",
      };
  }
}
