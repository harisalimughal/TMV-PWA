import React, { useRef, useState } from "react";
import { Camera, Loader2, X } from "lucide-react";

interface CameraCaptureProps {
  label: string;
  maxPhotos: number;
  submitting: boolean;
  onSubmit: (files: File[]) => void;
}

/** A plain `<input type="file" capture="environment">` -- this is the one piece of
 * "camera access" a web app gets without native APIs, but it's exactly what's needed
 * here: opens the phone's camera directly (not a gallery picker) on iOS/Android home-
 * screen-installed PWAs, which is the only install mode this app supports anyway. */
export function CameraCapture({ label, maxPhotos, submitting, onSubmit }: CameraCaptureProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);

  function handleFiles(fileList: FileList | null) {
    if (!fileList?.length) return;
    const next = [...files, ...Array.from(fileList)].slice(0, maxPhotos);
    setFiles(next);
    previews.forEach(url => URL.revokeObjectURL(url));
    setPreviews(next.map(file => URL.createObjectURL(file)));
  }

  function removeAt(index: number) {
    URL.revokeObjectURL(previews[index]);
    setFiles(files.filter((_, i) => i !== index));
    setPreviews(previews.filter((_, i) => i !== index));
  }

  return (
    <div className="flex flex-col gap-4">
      {previews.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {previews.map((src, index) => (
            <div key={src} className="relative aspect-square rounded-xl overflow-hidden bg-white/5">
              <img src={src} alt={`${label} ${index + 1}`} className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => removeAt(index)}
                className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/60 flex items-center justify-center text-white"
                aria-label="Remove photo"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {files.length < maxPhotos && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-white/20 py-10 text-white/60 hover:border-brand hover:text-brand transition-colors"
        >
          <Camera className="w-7 h-7" />
          <span className="text-sm font-medium">
            {files.length === 0 ? `Take ${label} photo` : "Add another photo"}
          </span>
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple={maxPhotos > 1}
        className="hidden"
        onChange={e => handleFiles(e.target.files)}
      />

      <button
        type="button"
        disabled={files.length === 0 || submitting}
        onClick={() => onSubmit(files)}
        className="flex items-center justify-center gap-2 rounded-xl bg-brand hover:bg-brand-dark transition-colors py-3.5 text-sm font-semibold disabled:opacity-40"
      >
        {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
        {submitting ? "Uploading…" : `Upload ${files.length || ""} photo${files.length === 1 ? "" : "s"}`}
      </button>
    </div>
  );
}
