import { useCallback, useEffect, useRef, useState } from "react";
import {
  isCameraSupported,
  mapCameraError,
  type CameraErrorInfo,
  type CameraStatus,
} from "./mapCameraError";

export type FacingMode = "environment" | "user";

export interface CameraStreamApi {
  status: CameraStatus;
  error: CameraErrorInfo | null;
  stream: MediaStream | null;
  facingMode: FacingMode;
  /** True when the device exposes more than one camera (enables the flip control). */
  hasMultipleCameras: boolean;
  /** Request the camera. Only ever call this from a user gesture. */
  start: (facing?: FacingMode) => Promise<void>;
  /** Stop every track and drop the stream. Safe to call repeatedly. */
  stop: () => void;
  toggleFacing: () => void;
}

const CAMERA_PERMISSION_GRANTED_KEY = "tmv.camera.permissionGranted.v1";

function rememberCameraPermission() {
  try {
    window.localStorage.setItem(CAMERA_PERMISSION_GRANTED_KEY, "1");
  } catch {
    /* Storage can be unavailable in private browsing; permission still belongs to the browser. */
  }
}

/**
 * Owns a single MediaStream from `getUserMedia`.
 *
 * - Never auto-starts — the camera opens only when `start()` is called.
 * - Rear camera by default (`facingMode: { ideal: "environment" }`).
 * - Every path stops the tracks: on `stop()`, on a new `start()`, and on unmount —
 *   so the OS camera indicator never lingers.
 */
export function useCameraStream(): CameraStreamApi {
  const [status, setStatus] = useState<CameraStatus>("idle");
  const [error, setError] = useState<CameraErrorInfo | null>(null);
  const [facingMode, setFacingMode] = useState<FacingMode>("environment");
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const mountedRef = useRef(true);

  const stop = useCallback(() => {
    const current = streamRef.current;
    if (current) {
      current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setStream(null);
  }, []);

  const start = useCallback(
    async (facing?: FacingMode) => {
      const nextFacing = facing ?? facingMode;
      if (!isCameraSupported()) {
        setStatus("unsupported");
        setError({ status: "unsupported", message: "This browser can't open the camera." });
        return;
      }

      // Drop any existing stream before asking for a new one.
      const previous = streamRef.current;
      if (previous) {
        previous.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }

      setStatus("requesting");
      setError(null);
      setFacingMode(nextFacing);

      try {
        const next = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: nextFacing },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });

        if (!mountedRef.current) {
          next.getTracks().forEach(track => track.stop());
          return;
        }

        streamRef.current = next;
        setStream(next);
        setStatus("ready");
        rememberCameraPermission();

        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          if (mountedRef.current) {
            setHasMultipleCameras(
              devices.filter(device => device.kind === "videoinput").length > 1,
            );
          }
        } catch {
          /* enumerateDevices can be blocked pre-permission — the flip control just stays hidden */
        }
      } catch (err) {
        if (!mountedRef.current) return;
        const info = mapCameraError(err);
        setStatus(info.status);
        setError(info);
      }
    },
    [facingMode],
  );

  const toggleFacing = useCallback(() => {
    void start(facingMode === "environment" ? "user" : "environment");
  }, [facingMode, start]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stop();
    };
  }, [stop]);

  return {
    status,
    error,
    stream,
    facingMode,
    hasMultipleCameras,
    start,
    stop,
    toggleFacing,
  };
}
