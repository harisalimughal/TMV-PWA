import React, { useEffect, useRef, useState } from "react";
import { Camera, FileUp, Loader2, X } from "lucide-react";
import { compressAll, formatBytes } from "../lib/image";
import { haptics } from "../lib/haptics";
import { cx } from "../ui";
import { CameraCaptureModal } from "./camera";

export interface PhotoPickerProps {
  label: string;
  /** Minimum the caller requires -- shown as a live "1 of 2" counter. */
  min?: number;
  max: number;
  onChange: (files: File[]) => void;
  /** Rendered under the label, e.g. what the photo needs to show. */
  hint?: string;
  allowUpload?: boolean;
}

interface Preview {
  url: string;
  file: File;
}

/**
 * Collects photo evidence and reports the current list up. Used by the job-workflow
 * steps (via PhotoUploader) and the scenario forms.
 *
 * Every photo is CAPTURED with the device camera — there is no file/library picker.
 * Two behaviours that matter more than they look, unchanged:
 *
 *  - Files are downscaled before they ever reach the caller (see lib/image.ts).
 *  - Object URLs are revoked on unmount, not just on replace/remove.
 */
export function PhotoPicker({ label, min = 0, max, onChange, hint, allowUpload = false }: PhotoPickerProps) {
  const [previews, setPreviews] = useState<Preview[]>([]);
  const [processing, setProcessing] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Revoke every URL this component ever created, on unmount.
  const urlsRef = useRef<string[]>([]);
  useEffect(() => {
    urlsRef.current = previews.map(p => p.url);
  }, [previews]);
  useEffect(() => () => urlsRef.current.forEach(URL.revokeObjectURL), []);

  async function addFiles(files: File[]) {
    setProcessing(true);
    try {
      const compressed = await compressAll(files.slice(0, max));
      const added: Preview[] = compressed.map(file => ({ file, url: URL.createObjectURL(file) }));
      if (max === 1) {
        previews.forEach(preview => URL.revokeObjectURL(preview.url));
      }
      const next = max === 1 ? added.slice(0, 1) : [...previews, ...added].slice(0, max);
      setPreviews(next);
      onChange(next.map(p => p.file));
      if (next.length >= max) setCameraOpen(false);
      haptics.tap();
    } finally {
      setProcessing(false);
    }
  }

  async function handleCapture(file: File) {
    await addFiles([file]);
  }

  function removeAt(index: number) {
    const target = previews[index];
    URL.revokeObjectURL(target.url);
    const next = previews.filter((_, i) => i !== index);
    setPreviews(next);
    onChange(next.map(p => p.file));
  }

  const full = max > 1 && previews.length >= max;
  const totalBytes = previews.reduce((sum, p) => sum + p.file.size, 0);
  const met = previews.length >= min;
  const captureLabel = previews.length === 0 ? "Take photo" : "Take another";

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-heading text-fg">{label}</h3>
          {hint && <p className="mt-0.5 text-helper text-fg-muted">{hint}</p>}
        </div>
        <span
          className={cx(
            "shrink-0 text-label font-semibold tabular-nums",
            met ? "text-success" : "text-fg-subtle",
          )}
        >
          {previews.length}
          {max > 1 ? ` / ${max}` : min > 0 ? " / 1" : ""}
        </span>
      </div>

      {previews.length > 0 && (
        <ul className="m-0 grid list-none grid-cols-3 gap-2.5 p-0">
          {previews.map((preview, index) => (
            <li
              key={preview.url}
              className="relative aspect-square animate-in zoom-in-95 overflow-hidden rounded-card border border-line bg-surface-sunken"
            >
              <img
                src={preview.url}
                alt={`${label}, photo ${index + 1}`}
                className="h-full w-full object-cover"
              />
              <button
                type="button"
                onClick={() => removeAt(index)}
                className="absolute right-1.5 top-1.5 flex size-8 items-center justify-center rounded-pill bg-black/65 text-white backdrop-blur-sm transition-transform active:scale-90"
                aria-label={`Remove photo ${index + 1}`}
              >
                <X className="size-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      {!full && allowUpload && (
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={event => {
            const files = Array.from(event.target.files ?? []);
            event.target.value = "";
            if (files.length > 0) void addFiles(files);
          }}
        />
      )}

      {!full && allowUpload && (
        <div className="grid grid-cols-2 overflow-hidden rounded-card bg-slate-900 p-1 shadow-xs">
          <button
            type="button"
            onClick={() => setCameraOpen(true)}
            disabled={processing}
            className="flex min-h-control-lg items-center justify-center gap-2 rounded-control text-button text-white transition duration-fast hover:bg-white/10 active:scale-[0.985] disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            {processing ? <Loader2 className="size-[20px] animate-spin" aria-hidden /> : <Camera className="size-[22px]" aria-hidden />}
            Take photo
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={processing}
            className="flex min-h-control-lg items-center justify-center gap-2 rounded-control text-button text-white transition duration-fast hover:bg-white/10 active:scale-[0.985] disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            <FileUp className="size-[22px]" aria-hidden />
            Upload
          </button>
        </div>
      )}

      {!full && !allowUpload && (
        <button
          type="button"
          onClick={() => setCameraOpen(true)}
          disabled={processing}
          className={cx(
            "flex min-h-control-lg w-full items-center justify-center gap-2 rounded-card text-button",
            "bg-brand text-brand-fg shadow-xs transition duration-fast",
            "hover:bg-brand-hover active:scale-[0.985] disabled:opacity-60",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
          )}
        >
          {processing ? (
            <Loader2 className="size-[18px] animate-spin" aria-hidden />
          ) : (
            <Camera className="size-[18px]" aria-hidden />
          )}
          {processing ? "Preparing…" : captureLabel}
        </button>
      )}

      {totalBytes > 0 && (
        <p className="text-meta text-fg-subtle">
          {formatBytes(totalBytes)} to send — photos are shrunk on this phone first.
        </p>
      )}

      <CameraCaptureModal
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={file => void handleCapture(file)}
        title={`Take ${label.toLowerCase()}`}
      />
    </section>
  );
}
