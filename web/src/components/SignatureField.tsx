import React from "react";
import { Check, PenLine } from "lucide-react";
import { Button } from "../ui";

export interface SignatureFieldProps {
  signed: boolean;
  /** Object URL of the captured signature PNG, shown as a preview once signed. */
  previewUrl?: string | null;
  onOpen: () => void;
  onClear: () => void;
  label?: string;
  required?: boolean;
  /** Shown under the label while unsigned. */
  instruction?: string;
}

/**
 * The signature's place in a form: a compact card, NOT a live canvas. While
 * unsigned it shows the label, a "Required" marker and one button that opens the
 * full-screen pad. Once signed it shows a preview of the mark plus Change / Clear.
 */
export function SignatureField({
  signed,
  previewUrl,
  onOpen,
  onClear,
  label = "Customer signature",
  required = true,
  instruction = "They sign to accept the completed move."
}: SignatureFieldProps) {
  return (
    <div className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-label font-semibold text-fg-muted">{label}</span>
        {signed ? (
          <span className="inline-flex items-center gap-1 text-meta font-semibold text-success">
            <Check className="size-3.5 stroke-[3]" aria-hidden />
            Signed
          </span>
        ) : (
          required && <span className="text-meta font-medium text-fg-subtle">Required</span>
        )}
      </div>

      {signed && previewUrl ? (
        <>
          <div className="overflow-hidden rounded-control border border-line bg-white">
            <img src={previewUrl} alt="Customer signature" className="h-28 w-full object-contain" />
          </div>
          <div className="flex gap-4">
            <button
              type="button"
              onClick={onOpen}
              className="text-label font-semibold text-brand transition-colors hover:text-brand-hover"
            >
              Change signature
            </button>
            <button
              type="button"
              onClick={onClear}
              className="text-label font-semibold text-fg-muted transition-colors hover:text-danger"
            >
              Clear signature
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="text-helper text-fg-subtle">{instruction}</p>
          <Button variant="secondary" fullWidth iconLeft={<PenLine />} onClick={onOpen}>
            Open signature pad
          </Button>
        </>
      )}
    </div>
  );
}
