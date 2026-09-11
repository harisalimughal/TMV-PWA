import React, { useEffect, useRef, useState } from "react";
import { Camera, FileUp, Loader2, X } from "lucide-react";
import { compressAll, formatBytes } from "../lib/image";
import { haptics } from "../lib/haptics";
import type { PhotoCaptureMeta } from "../lib/geo";
import { reverseGeocodeLive } from "../api/jobs";
import { cx } from "../ui";
import { CameraCaptureModal } from "./camera";

export interface PhotoPickerProps {
  label: string;
  /** Minimum the caller requires -- shown as a live "1 of 2" counter. */
  min?: number;
  max: number;
  /**
   * `metas` is parallel to `files` — where/when each photo was taken (null for a
   * library upload, which has no shutter moment to record). Callers that don't care
   * (`onChange={setPhotos}`) can simply ignore the second argument.
   */
  onChange: (files: File[], metas: Array<PhotoCaptureMeta | null>) => void;
  /** Rendered under the label, e.g. what the photo needs to show. */
  hint?: string;
  allowUpload?: boolean;
  /** Accept camera captures immediately instead of showing Retake / Use photo. */
  autoAcceptCapture?: boolean;
  /**
   * When provided, the built-in "Take photo" button is NOT rendered; instead this is
   * called with a function that opens the camera (and with `null` on unmount). Lets a
   * caller drive capture from elsewhere — e.g. a button in the screen's sticky dock.
   */
  registerCapture?: (open: (() => void) | null) => void;
  /**
   * Photos to start with — used to re-hydrate the picker when the workflow returns to
   * a photo step the driver had already added photos to (they're kept in memory by
   * the parent, keyed per step, so navigating back and forward doesn't lose them).
   */
  initialFiles?: File[];
  /** Capture metadata to start with — parallel to `initialFiles`. */
  initialMeta?: Array<PhotoCaptureMeta | null>;
  /** Photos already uploaded to the server for this step, shown alongside newly
   *  captured ones. Deleting one calls `onRemoveRemote` with its id. */
  remoteFiles?: RemotePhoto[];
  onRemoveRemote?: (id: string) => void;
  /** Hides the `label` heading (the count still shows) -- for a screen whose own
   *  step title already says what the photo is for, so this section doesn't repeat
   *  it. `label` is still used for alt text and the camera modal's title either way. */
  labelHidden?: boolean;
}

export interface RemotePhoto {
  id: string;
  url: string;
  /** Where/when this photo was captured, if the driver's device recorded it at the
   *  time — absent for photos taken before this feature existed. */
  capturedAt?: string;
  location?: PhotoCaptureMeta["location"];
  /** A short place name for `location`, resolved server-side — absent when there was
   *  no location or the lookup failed (falls back to raw coordinates). */
  locationName?: string;
}

interface Preview {
  url: string;
  file: File;
  meta: PhotoCaptureMeta | null;
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
export function PhotoPicker({
  label,
  min = 0,
  max,
  onChange,
  hint,
  allowUpload = false,
  autoAcceptCapture = false,
  registerCapture,
  initialFiles,
  initialMeta,
  remoteFiles,
  onRemoveRemote,
  labelHidden = false
}: PhotoPickerProps) {
  const [previews, setPreviews] = useState<Preview[]>(() =>
    (initialFiles ?? []).map((file, i) => ({
      file,
      url: URL.createObjectURL(file),
      meta: initialMeta?.[i] ?? null
    }))
  );
  const [processing, setProcessing] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Hand a camera-open trigger to the caller (e.g. a docked "Take photo" button),
  // and take it back on unmount / step change.
  useEffect(() => {
    if (!registerCapture) return;
    registerCapture(() => setCameraOpen(true));
    return () => registerCapture(null);
  }, [registerCapture]);

  // Revoke every URL this component ever created, on unmount.
  const urlsRef = useRef<string[]>([]);
  useEffect(() => {
    urlsRef.current = previews.map(p => p.url);
  }, [previews]);
  useEffect(() => () => urlsRef.current.forEach(URL.revokeObjectURL), []);

  // Fire-and-forget: resolves a place name for a freshly captured photo's location
  // live, well before that photo has actually uploaded anywhere, then merges it into
  // this specific preview once it resolves -- the caption upgrades itself from raw
  // coordinates to a real place a moment after capture instead of only once the photo
  // has finished uploading (see api/jobs.ts's reverseGeocodeLive). Matched by object
  // URL, which is unique per preview and stable for its lifetime here.
  function resolveLocationName(url: string, location: NonNullable<PhotoCaptureMeta["location"]>) {
    void reverseGeocodeLive(location.lat, location.lng).then(locationName => {
      if (!locationName) return;
      setPreviews(current => {
        const next = current.map(p => (p.url === url && p.meta ? { ...p, meta: { ...p.meta, locationName } } : p));
        onChange(next.map(p => p.file), next.map(p => p.meta));
        return next;
      });
    });
  }

  async function addFiles(files: File[], metas: Array<PhotoCaptureMeta | null> = files.map(() => null)) {
    setProcessing(true);
    try {
      const compressed = await compressAll(files.slice(0, max));
      const metaSlice = metas.slice(0, max);
      // Promise.all inside compressAll preserves order, so index-pairing with the
      // metas we sliced from the same input array stays correct.
      const added: Preview[] = compressed.map((file, i) => ({
        file,
        url: URL.createObjectURL(file),
        meta: metaSlice[i] ?? null
      }));
      if (max === 1) {
        previews.forEach(preview => URL.revokeObjectURL(preview.url));
      }
      const next = max === 1 ? added.slice(0, 1) : [...previews, ...added].slice(0, max);
      setPreviews(next);
      onChange(next.map(p => p.file), next.map(p => p.meta));
      if (next.length >= max) setCameraOpen(false);
      haptics.tap();

      // Only the ones just added -- an already-resolved (or already-attempted)
      // preview from a previous addFiles call is left alone.
      for (const preview of added) {
        if (preview.meta?.location) resolveLocationName(preview.url, preview.meta.location);
      }
    } finally {
      setProcessing(false);
    }
  }

  async function handleCapture(file: File, meta: PhotoCaptureMeta) {
    await addFiles([file], [meta]);
  }

  function removeAt(index: number) {
    const target = previews[index];
    URL.revokeObjectURL(target.url);
    const next = previews.filter((_, i) => i !== index);
    setPreviews(next);
    onChange(next.map(p => p.file), next.map(p => p.meta));
  }

  const remote = remoteFiles ?? [];
  const total = remote.length + previews.length;
  // Keep the pre-existing behaviour for callers without server photos (max===1 stays
  // replaceable); when server photos are in play, "full" is a hard total cap.
  const full = remote.length > 0 ? total >= max : max > 1 && previews.length >= max;
  const totalBytes = previews.reduce((sum, p) => sum + p.file.size, 0);
  const met = total >= min;
  const captureLabel = total === 0 ? "Take photo" : "Take another";

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          {!labelHidden && <h3 className="text-heading text-fg">{label}</h3>}
          {hint && <p className="mt-0.5 text-helper text-fg-muted">{hint}</p>}
        </div>
        <span
          className={cx(
            "shrink-0 text-label font-semibold tabular-nums",
            met ? "text-success" : "text-fg-subtle",
          )}
        >
          {total}
          {max > 1 ? ` / ${max}` : min > 0 ? " / 1" : ""}
        </span>
      </div>

      {(remote.length > 0 || previews.length > 0) && (
        <ul className="m-0 grid list-none grid-cols-3 gap-2.5 p-0">
          {remote.map((photo, index) => (
            <li
              key={photo.id}
              className="relative aspect-square animate-in zoom-in-95 overflow-hidden rounded-card border border-line bg-surface-sunken"
            >
              <img src={photo.url} alt={`${label}, photo ${index + 1}`} className="h-full w-full object-cover" />
              {onRemoveRemote && (
                <button
                  type="button"
                  onClick={() => onRemoveRemote(photo.id)}
                  className="absolute right-1.5 top-1.5 flex size-8 items-center justify-center rounded-pill bg-black/65 text-white backdrop-blur-sm transition-transform active:scale-90"
                  aria-label={`Remove photo ${index + 1}`}
                >
                  <X className="size-4" aria-hidden />
                </button>
              )}
            </li>
          ))}
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

      {!full && !allowUpload && !registerCapture && (
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
        onCapture={(file, meta) => void handleCapture(file, meta)}
        autoAcceptCapture={autoAcceptCapture}
        title={`Take ${label.toLowerCase()}`}
      />
    </section>
  );
}
