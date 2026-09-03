import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Camera, CameraOff, Loader2, RefreshCw, SwitchCamera, X } from "lucide-react";
import { cx } from "../../ui";
import { haptics } from "../../lib/haptics";
import { useCameraStream } from "./useCameraStream";

export interface CameraCaptureModalProps {
  open: boolean;
  /** Fires with each captured photo (a JPEG File). */
  onCapture: (file: File) => void;
  onClose: () => void;
  /** Keep the camera open after "Use photo" so the driver can take another. */
  allowMultiple?: boolean;
  /** Header wording, e.g. "Take evidence photo". */
  title?: string;
}

type Phase = "live" | "preview";

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),[tabindex]:not([tabindex="-1"])';
const CAMERA_PERMISSION_GRANTED_KEY = "tmv.camera.permissionGranted.v1";

function hasRememberedCameraPermission(): boolean {
  try {
    return window.localStorage.getItem(CAMERA_PERMISSION_GRANTED_KEY) === "1";
  } catch {
    return false;
  }
}

async function hasGrantedCameraPermission(): Promise<boolean> {
  if (hasRememberedCameraPermission()) return true;
  const permissions = navigator.permissions;
  if (!permissions?.query) return false;
  try {
    const status = await permissions.query({ name: "camera" as PermissionName });
    return status.state === "granted";
  } catch {
    return false;
  }
}

/**
 * The one camera surface for the whole driver app. A live rear-camera preview, a
 * shutter, then a captured-photo preview with Retake / Use photo.
 *
 * There is no route to the photo library from here — if the camera can't open, the
 * driver sees an error and a "Try again", never an upload fallback. The MediaStream
 * is stopped the moment a frame is captured and whenever this modal closes or
 * unmounts.
 */
export function CameraCaptureModal({
  open,
  onCapture,
  onClose,
  allowMultiple = false,
  title = "Take photo",
}: CameraCaptureModalProps) {
  const { status, error, stream, hasMultipleCameras, start, stop, toggleFacing } =
    useCameraStream();

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const capturedUrlRef = useRef<string | null>(null);

  const [phase, setPhase] = useState<Phase>("live");
  const [capturedUrl, setCapturedUrl] = useState<string | null>(null);
  const [capturedFile, setCapturedFile] = useState<File | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [needsPermissionTap, setNeedsPermissionTap] = useState(false);
  const titleId = useId();

  const clearCaptured = useCallback(() => {
    if (capturedUrlRef.current) {
      URL.revokeObjectURL(capturedUrlRef.current);
      capturedUrlRef.current = null;
    }
    setCapturedUrl(null);
    setCapturedFile(null);
  }, []);

  // Open / close lifecycle: start automatically after the first grant, otherwise wait
  // for an explicit permission tap so browsers do not keep showing prompt-like flows.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    restoreRef.current = document.activeElement as HTMLElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    setPhase("live");
    setNeedsPermissionTap(false);
    void hasGrantedCameraPermission().then(granted => {
      if (cancelled) return;
      if (granted) {
        void start("environment");
      } else {
        setNeedsPermissionTap(true);
      }
    });

    return () => {
      cancelled = true;
      stop();
      clearCaptured();
      setNeedsPermissionTap(false);
      document.body.style.overflow = prevOverflow;
      restoreRef.current?.focus?.();
    };
  }, [open, start, stop, clearCaptured]);

  // Bind the stream to the <video> element while live.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = phase === "live" ? stream : null;
    if (phase === "live" && stream) {
      video.play().catch(() => {
        /* autoplay can reject if the element isn't ready yet; the next render retries */
      });
    }
  }, [stream, phase]);

  // Focus trap + Esc.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const nodes = panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (!nodes || nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown, true);
    panelRef.current?.focus();
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  function handleCapture() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !video.videoWidth) return;
    setCapturing(true);
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setCapturing(false);
      return;
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      blob => {
        setCapturing(false);
        if (!blob) return;
        // Frame captured — release the camera immediately.
        stop();
        const file = new File([blob], `photo-${Date.now()}.jpg`, {
          type: "image/jpeg",
          lastModified: Date.now(),
        });
        const url = URL.createObjectURL(blob);
        capturedUrlRef.current = url;
        setCapturedFile(file);
        setCapturedUrl(url);
        setPhase("preview");
        haptics.tap();
      },
      "image/jpeg",
      0.92,
    );
  }

  function handleRetake() {
    clearCaptured();
    setPhase("live");
    setNeedsPermissionTap(false);
    void start();
  }

  function handleUse() {
    if (!capturedFile) return;
    onCapture(capturedFile);
    haptics.success();
    if (allowMultiple) {
      clearCaptured();
      setPhase("live");
      void start();
    } else {
      onClose();
    }
  }

  const failed =
    status === "denied" ||
    status === "notfound" ||
    status === "inuse" ||
    status === "unsupported" ||
    status === "error";

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
      className="fixed inset-0 z-[200] flex flex-col bg-black text-white outline-none"
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      {/* Top bar */}
      <div className="flex items-center justify-between gap-3 px-3 py-2.5">
        <button
          type="button"
          onClick={onClose}
          aria-label="Cancel"
          className="grid size-10 place-items-center rounded-pill bg-white/10 text-white transition-colors hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          <X className="size-5" aria-hidden />
        </button>
        <h2 id={titleId} className="text-[15px] font-semibold tracking-[-0.01em]">
          {phase === "preview" ? "Check the photo" : title}
        </h2>
        {phase === "live" && hasMultipleCameras && !failed ? (
          <button
            type="button"
            onClick={toggleFacing}
            aria-label="Switch camera"
            className="grid size-10 place-items-center rounded-pill bg-white/10 text-white transition-colors hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            <SwitchCamera className="size-5" aria-hidden />
          </button>
        ) : (
          <span className="size-10" aria-hidden />
        )}
      </div>

      {/* Stage */}
      <div className="relative min-h-0 flex-1 overflow-hidden bg-black">
        {/* Live preview */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={cx(
            "absolute inset-0 h-full w-full object-cover",
            phase === "live" && status === "ready" ? "opacity-100" : "opacity-0",
          )}
        />

        {/* Captured preview */}
        {phase === "preview" && capturedUrl && (
          <img
            src={capturedUrl}
            alt="The photo you just took"
            className="absolute inset-0 h-full w-full object-contain"
          />
        )}

        {/* First permission request */}
        {phase === "live" && needsPermissionTap && status === "idle" && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-8 text-center"
            role="status"
            aria-live="polite"
          >
            <span className="grid size-14 place-items-center rounded-pill bg-white/10">
              <Camera className="size-7 text-white" aria-hidden />
            </span>
            <p className="text-[16px] font-semibold">Camera permission is needed once.</p>
            <button
              type="button"
              onClick={() => {
                setNeedsPermissionTap(false);
                void start("environment");
              }}
              className="inline-flex h-control items-center gap-2 rounded-control bg-white px-5 text-[14px] font-semibold text-black transition-transform active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              <Camera className="size-4" aria-hidden />
              Allow camera
            </button>
          </div>
        )}

        {/* Requesting */}
        {phase === "live" && status === "requesting" && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/80"
            role="status"
            aria-live="polite"
          >
            <Loader2 className="size-7 animate-spin" aria-hidden />
            <p className="text-[14px]">Starting camera…</p>
          </div>
        )}

        {/* Error */}
        {failed && error && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-8 text-center"
            role="alert"
          >
            <span className="grid size-14 place-items-center rounded-pill bg-white/10">
              <CameraOff className="size-7 text-white" aria-hidden />
            </span>
            <p className="text-[16px] font-semibold">{error.message}</p>
            {error.hint && <p className="max-w-xs text-[13px] text-white/70">{error.hint}</p>}
            <div className="mt-2 flex flex-col items-center gap-2">
              {status !== "unsupported" && (
                <button
                  type="button"
                  onClick={() => void start()}
                  className="inline-flex h-control items-center gap-2 rounded-control bg-white px-5 text-[14px] font-semibold text-black transition-transform active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  <RefreshCw className="size-4" aria-hidden />
                  Try again
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="h-control rounded-control px-5 text-[14px] font-semibold text-white/80 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                Close
              </button>
            </div>
          </div>
        )}

        <canvas ref={canvasRef} className="hidden" />
      </div>

      {/* Controls */}
      <div className="px-4 pb-4 pt-3">
        {phase === "live" && !failed && (
          <div className="flex items-center justify-center">
            <button
              type="button"
              onClick={handleCapture}
              disabled={status !== "ready" || capturing}
              aria-label="Take photo"
              className="grid size-[74px] place-items-center rounded-pill border-[3px] border-white/85 bg-white/15 transition-transform active:scale-95 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
            >
              <span className="grid size-14 place-items-center rounded-pill bg-white text-black">
                {capturing ? (
                  <Loader2 className="size-6 animate-spin" aria-hidden />
                ) : (
                  <Camera className="size-6" aria-hidden />
                )}
              </span>
            </button>
          </div>
        )}

        {phase === "preview" && (
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleRetake}
              className="inline-flex h-control-lg flex-1 items-center justify-center gap-2 rounded-control border border-white/25 bg-white/10 text-[15px] font-semibold text-white transition-transform active:scale-[0.985] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              <RefreshCw className="size-[18px]" aria-hidden />
              Retake
            </button>
            <button
              type="button"
              onClick={handleUse}
              className="inline-flex h-control-lg flex-1 items-center justify-center gap-2 rounded-control bg-white text-[15px] font-semibold text-black transition-transform active:scale-[0.985] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              Use photo
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
