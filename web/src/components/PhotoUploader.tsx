import React, { useState } from "react";
import { AlertTriangle, MapPin } from "lucide-react";
import type { PhotoCaptureMeta } from "../lib/geo";
import { formatCapturedTime, formatLocationLabel, mapsUrlForLocation } from "../lib/geo";
import { PhotoPicker, type RemotePhoto } from "./PhotoPicker";

export interface PhotoUploaderProps {
  label: string;
  hint?: string;
  minPhotos?: number;
  maxPhotos: number;
  /** True while an upload is in flight. */
  submitting?: boolean;
  /** 0..1 while uploading, null otherwise. */
  progress?: number | null;
  /** An upload/validation error to show inline. */
  error?: string | null;
  /**
   * Fires on every add/remove with the current list and where/when each was taken
   * (parallel array; null entries are library uploads or older data with no capture
   * location). The submit control lives in the screen's sticky dock, outside this
   * subtree, so callers use this to keep that button's state — and the upload
   * payload — honest.
   */
  onFilesChange?: (files: File[], metas: Array<PhotoCaptureMeta | null>) => void;
  /**
   * When set, the built-in "Take photo" button is hidden and the caller is handed a
   * camera-open trigger instead — used when the capture button lives in the dock.
   */
  registerCapture?: (open: (() => void) | null) => void;
  /** Photos to pre-populate with (kept by the parent so a step's photos survive
   *  navigating away and back). */
  initialFiles?: File[];
  /** Capture metadata to pre-populate with — parallel to `initialFiles`. */
  initialMeta?: Array<PhotoCaptureMeta | null>;
  /** Photos already on the server for this step. */
  remoteFiles?: RemotePhoto[];
  onRemoveRemote?: (id: string) => void;
  /** Hides the section's own "label" heading (count still shows) -- for a screen
   *  whose step title already says what the photo is for. */
  labelHidden?: boolean;
}

/**
 * The photo-capture step, presented consistently everywhere it appears (arrival,
 * van loaded, empty van). Section label + live count from <PhotoPicker>, a big
 * primary "Take photo" action that opens the in-app camera (no file/library
 * picker), previews with remove controls, plus a send progress bar and an inline
 * error slot. The submit button is NOT here — it's docked at the bottom of the screen.
 */
export function PhotoUploader({
  label,
  hint,
  minPhotos = 1,
  maxPhotos,
  submitting = false,
  progress = null,
  error = null,
  onFilesChange,
  registerCapture,
  initialFiles,
  initialMeta,
  remoteFiles,
  onRemoveRemote,
  labelHidden
}: PhotoUploaderProps) {
  const [files, setFiles] = useState<File[]>(initialFiles ?? []);
  const [meta, setMeta] = useState<Array<PhotoCaptureMeta | null>>(initialMeta ?? []);

  function handleChange(next: File[], nextMeta: Array<PhotoCaptureMeta | null>) {
    setFiles(next);
    setMeta(nextMeta);
    onFilesChange?.(next, nextMeta);
  }

  const remaining = Math.max(0, minPhotos - files.length - (remoteFiles?.length ?? 0));

  // The most recent capture worth showing a caption for -- a fresh local photo first
  // (the driver just took it), falling back to the newest already-uploaded one when
  // stepping back into a completed step. Older evidence with no recorded location
  // just shows nothing here rather than a misleading blank line.
  const latestLocal = meta.length > 0 ? meta[meta.length - 1] : null;
  const latestRemote =
    remoteFiles && remoteFiles.length > 0 ? remoteFiles[remoteFiles.length - 1] : undefined;
  const captureCaption: (PhotoCaptureMeta & { locationName?: string }) | null =
    latestLocal ??
    (latestRemote?.capturedAt
      ? { capturedAt: latestRemote.capturedAt, location: latestRemote.location ?? null, locationName: latestRemote.locationName }
      : null);

  return (
    <div className="flex flex-col gap-4">
      <PhotoPicker
        label={label}
        hint={hint}
        min={minPhotos}
        max={maxPhotos}
        onChange={handleChange}
        registerCapture={registerCapture}
        initialFiles={initialFiles}
        initialMeta={initialMeta}
        remoteFiles={remoteFiles}
        onRemoveRemote={onRemoveRemote}
        labelHidden={labelHidden}
        autoAcceptCapture
      />

      {submitting && progress !== null && (
        <div className="flex flex-col gap-1.5" role="status" aria-live="polite">
          <div className="flex items-center justify-between text-helper font-medium text-fg-muted">
            <span>Sending…</span>
            <span className="tabular-nums">{Math.round(progress * 100)}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-pill bg-line">
            <div
              className="h-full rounded-pill bg-brand transition-[width] duration-200"
              style={{ width: `${Math.max(4, progress * 100)}%` }}
            />
          </div>
          <p className="text-meta text-fg-subtle">Keep this screen open until it finishes.</p>
        </div>
      )}

      {error && (
        <p className="flex items-start gap-2 text-helper text-danger" role="alert">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {error}
        </p>
      )}

      {!submitting && remaining > 0 && files.length > 0 && (
        <p className="text-helper text-fg-subtle">
          {remaining} more photo{remaining === 1 ? "" : "s"} needed.
        </p>
      )}

      {/* Small, quiet proof-of-place line -- where/when the most recent photo was
          actually taken, not shown at all when neither is known. */}
      {captureCaption && (
        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-helper text-fg-subtle">
          <MapPin className="size-3.5 shrink-0" aria-hidden />
          {formatCapturedTime(captureCaption.capturedAt) && (
            <span>Captured {formatCapturedTime(captureCaption.capturedAt)}</span>
          )}
          {captureCaption.location ? (
            <>
              <span aria-hidden>·</span>
              <a
                href={mapsUrlForLocation(captureCaption.location)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={event => event.stopPropagation()}
                className="font-mono text-brand underline underline-offset-2"
              >
                {formatLocationLabel(captureCaption.location, captureCaption.locationName)}
              </a>
            </>
          ) : (
            <span>· location unavailable</span>
          )}
        </p>
      )}
    </div>
  );
}
