import React, { useState } from "react";
import { AlertTriangle, Camera, Loader2, Trash2 } from "lucide-react";
import { Avatar } from "../ui";
import { MAX_AVATAR_BYTES, fileToAvatarDataUrl } from "../lib/profile";
import { CameraCaptureModal } from "./camera";

export interface ProfilePhotoUploaderProps {
  name: string;
  /** The effective photo to show — a pending capture, or the saved one, or null. */
  value: string | null;
  /** True once `value` differs from what is saved (drives the Remove affordance). */
  dirty: boolean;
  /** Fires with a downscaled data URL on capture, or null on remove. */
  onChange: (next: string | null) => void;
  disabled?: boolean;
}

/**
 * Take / preview / remove the driver's profile photo.
 *
 * The photo is CAPTURED with the device camera — there is no file/library picker.
 * The captured frame is downscaled on-device and handed up as a data URL; it never
 * leaves this device (see lib/profile.ts). The parent's Save commits it.
 */
export function ProfilePhotoUploader({
  name,
  value,
  dirty,
  onChange,
  disabled = false,
}: ProfilePhotoUploaderProps) {
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);

  async function handleCapture(file: File) {
    setError(null);
    if (file.size > MAX_AVATAR_BYTES) {
      setError("That photo is too large. Try again.");
      return;
    }
    setProcessing(true);
    try {
      onChange(await fileToAvatarDataUrl(file));
    } catch {
      setError("Couldn't process that photo. Try again.");
    } finally {
      setProcessing(false);
    }
  }

  const canRemove = Boolean(value) || dirty;

  return (
    <div className="flex items-center gap-4">
      <div className="relative">
        <Avatar name={name} src={value} size="xl" className="ring-1 ring-line" />
        {processing && (
          <span className="absolute inset-0 grid place-items-center rounded-pill bg-fg/40">
            <Loader2 className="size-6 animate-spin text-white" aria-hidden />
          </span>
        )}
      </div>

      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={disabled || processing}
            onClick={() => setCameraOpen(true)}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-control border border-line bg-surface px-3.5 text-button text-fg transition-colors hover:bg-surface-sunken disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            <Camera className="size-4" aria-hidden />
            {value ? "Retake profile photo" : "Take profile photo"}
          </button>
          {canRemove && (
            <button
              type="button"
              disabled={disabled || processing}
              onClick={() => {
                setError(null);
                onChange(null);
              }}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-control px-3 text-button text-fg-muted transition-colors hover:bg-surface-sunken hover:text-danger disabled:opacity-50"
            >
              <Trash2 className="size-4" aria-hidden />
              Remove
            </button>
          )}
        </div>
        <p className="text-helper text-fg-subtle">
          Taken with your camera. Saved on this device.
        </p>
        {error && (
          <p className="flex items-center gap-1.5 text-helper text-danger" role="alert">
            <AlertTriangle className="size-4 shrink-0" aria-hidden />
            {error}
          </p>
        )}
      </div>

      <CameraCaptureModal
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={file => void handleCapture(file)}
        title="Take profile photo"
      />
    </div>
  );
}
