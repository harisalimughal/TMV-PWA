import React, { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Loader2, X } from "lucide-react";
import { compressAll, formatBytes } from "../lib/image";
import { haptics } from "../lib/haptics";
import { cx } from "../ui";

export interface PhotoPickerProps {
  label: string;
  /** Minimum the caller requires -- shown as a live "1 of 2" counter. */
  min?: number;
  max: number;
  onChange: (files: File[]) => void;
  /** Rendered under the label, e.g. what the photo needs to show. */
  hint?: string;
}

interface Preview {
  url: string;
  file: File;
}

/**
 * Collects photos and reports the current list up. Used by both the job-workflow
 * steps (via PhotoUploader) and the scenario forms.
 *
 * Two behaviours that matter more than they look, unchanged from before:
 *
 *  - Files are downscaled before they ever reach the caller (see lib/image.ts).
 *  - Object URLs are revoked on unmount, not just on replace/remove.
 */
export function PhotoPicker({ label, min = 0, max, onChange, hint }: PhotoPickerProps) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const [previews, setPreviews] = useState<Preview[]>([]);
  const [processing, setProcessing] = useState(false);

  // Revoke every URL this component ever created, on unmount.
  const urlsRef = useRef<string[]>([]);
  useEffect(() => {
    urlsRef.current = previews.map(p => p.url);
  }, [previews]);
  useEffect(() => () => urlsRef.current.forEach(URL.revokeObjectURL), []);

  const handleFiles = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList?.length) return;
      setProcessing(true);
      try {
        const incoming = Array.from(fileList).slice(0, Math.max(0, max - previews.length));
        const compressed = await compressAll(incoming);
        const added = compressed.map(file => ({ file, url: URL.createObjectURL(file) }));
        const next = [...previews, ...added];
        setPreviews(next);
        onChange(next.map(p => p.file));
        haptics.tap();
      } finally {
        setProcessing(false);
      }
    },
    [max, onChange, previews]
  );

  function removeAt(index: number) {
    const target = previews[index];
    URL.revokeObjectURL(target.url);
    const next = previews.filter((_, i) => i !== index);
    setPreviews(next);
    onChange(next.map(p => p.file));
  }

  const full = previews.length >= max;
  const totalBytes = previews.reduce((sum, p) => sum + p.file.size, 0);
  const met = previews.length >= min;

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
            met ? "text-success" : "text-fg-subtle"
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

      {!full && (
        <div className="flex justify-center gap-2.5">
          <button
            type="button"
            onClick={() => cameraRef.current?.click()}
            disabled={processing}
            className={cx(
              "flex min-h-control-lg w-full items-center justify-center gap-2 rounded-card text-button",
              "bg-brand text-brand-fg shadow-xs transition duration-fast",
              "hover:bg-brand-hover active:scale-[0.985] disabled:opacity-60"
            )}
          >
            {processing ? (
              <Loader2 className="size-[18px] animate-spin" aria-hidden />
            ) : (
              <Camera className="size-[18px]" aria-hidden />
            )}
            {processing ? "Preparing…" : previews.length === 0 ? "Take photo" : "Take another"}
          </button>
        </div>
      )}

      {totalBytes > 0 && (
        <p className="text-meta text-fg-subtle">
          {formatBytes(totalBytes)} to upload — photos are shrunk on this phone before sending.
        </p>
      )}

      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple={max > 1}
        className="hidden"
        onChange={e => {
          void handleFiles(e.target.files);
          e.target.value = ""; // lets the same file be picked twice in a row
        }}
      />
    </section>
  );
}
