import React, { useRef, useState } from "react";
import { Camera, X } from "lucide-react";

interface PhotoPickerProps {
  label: string;
  max: number;
  onChange: (files: File[]) => void;
}

/** Controlled sibling of CameraCapture -- that component has its own internal submit
 * button (right for the main job-photo steps, which each upload immediately). Scenario
 * forms submit everything -- fields, photos, and signature -- together at the end, so
 * this just collects files and reports the current list up via onChange, with no
 * submit action of its own. */
export function PhotoPicker({ label, max, onChange }: PhotoPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);

  function handleFiles(fileList: FileList | null) {
    if (!fileList?.length) return;
    const next = [...files, ...Array.from(fileList)].slice(0, max);
    setFiles(next);
    previews.forEach(url => URL.revokeObjectURL(url));
    setPreviews(next.map(file => URL.createObjectURL(file)));
    onChange(next);
  }

  function removeAt(index: number) {
    URL.revokeObjectURL(previews[index]);
    const next = files.filter((_, i) => i !== index);
    setFiles(next);
    setPreviews(previews.filter((_, i) => i !== index));
    onChange(next);
  }

  return (
    <div className="flex flex-col gap-3">
      <span className="text-xs font-medium text-white/60 pl-1">{label}</span>
      {previews.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {previews.map((src, index) => (
            <div key={src} className="relative aspect-square rounded-lg overflow-hidden bg-white/5">
              <img src={src} alt={`${label} ${index + 1}`} className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => removeAt(index)}
                className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 flex items-center justify-center text-white"
                aria-label="Remove photo"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      {files.length < max && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-white/20 py-6 text-white/60 hover:border-brand hover:text-brand transition-colors"
        >
          <Camera className="w-5 h-5" />
          <span className="text-sm font-medium">{files.length === 0 ? "Add photo" : "Add another"}</span>
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple={max > 1}
        className="hidden"
        onChange={e => handleFiles(e.target.files)}
      />
    </div>
  );
}
