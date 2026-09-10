import React, { useState } from "react";
import { AlertTriangle } from "lucide-react";
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
   * Fires on every add/remove with the current list. The submit control lives in
   * the screen's sticky dock, outside this subtree, so callers use this to keep
   * that button's state honest.
   */
  onFilesChange?: (files: File[]) => void;
  /**
   * When set, the built-in "Take photo" button is hidden and the caller is handed a
   * camera-open trigger instead — used when the capture button lives in the dock.
   */
  registerCapture?: (open: (() => void) | null) => void;
  /** Photos to pre-populate with (kept by the parent so a step's photos survive
   *  navigating away and back). */
  initialFiles?: File[];
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
  remoteFiles,
  onRemoveRemote,
  labelHidden
}: PhotoUploaderProps) {
  const [files, setFiles] = useState<File[]>(initialFiles ?? []);

  function handleChange(next: File[]) {
    setFiles(next);
    onFilesChange?.(next);
  }

  const remaining = Math.max(0, minPhotos - files.length - (remoteFiles?.length ?? 0));

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
    </div>
  );
}
