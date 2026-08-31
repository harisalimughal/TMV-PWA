import React, { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { PhotoPicker } from "./PhotoPicker";

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
}

/**
 * The photo-capture step, presented consistently everywhere it appears (arrival,
 * van loaded, empty van). Section label + live count from <PhotoPicker>, a single
 * full-width "Take photo" action (camera only, no gallery picker), previews with
 * remove controls, plus an upload progress bar and an inline error slot. The
 * submit button is NOT here — it's docked at the bottom of the screen.
 */
export function PhotoUploader({
  label,
  hint,
  minPhotos = 1,
  maxPhotos,
  submitting = false,
  progress = null,
  error = null,
  onFilesChange
}: PhotoUploaderProps) {
  const [files, setFiles] = useState<File[]>([]);

  function handleChange(next: File[]) {
    setFiles(next);
    onFilesChange?.(next);
  }

  const remaining = Math.max(0, minPhotos - files.length);

  return (
    <div className="flex flex-col gap-4">
      <PhotoPicker label={label} hint={hint} min={minPhotos} max={maxPhotos} onChange={handleChange} />

      {submitting && progress !== null && (
        <div className="flex flex-col gap-1.5" role="status" aria-live="polite">
          <div className="flex items-center justify-between text-helper font-medium text-fg-muted">
            <span>Uploading…</span>
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
