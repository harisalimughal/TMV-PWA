import React, { useRef, useState } from "react";
import { Modal, Button } from "../ui";
import { useToast } from "./ui/Toast";
import { SignaturePad, type SignaturePadHandle } from "./SignaturePad";

export interface SignatureModalProps {
  open: boolean;
  onClose: () => void;
  /** Receives the flattened PNG blob. May be async (e.g. an upload); keep the
   *  modal open until it resolves by awaiting inside. */
  onSave: (blob: Blob) => void | Promise<void>;
  title?: string;
  /** One line of plain instruction shown above the pad. */
  instruction?: string;
  /** The agreement / confirmation copy the customer is signing against. */
  agreementText?: string;
  /** Name the signature is attributed to, shown as a reminder. */
  signerName?: string;
  /** True while onSave is in flight. */
  busy?: boolean;
  /** 0..1 upload progress, or null. */
  progress?: number | null;
}

/**
 * The signature experience, opened deliberately — never shown inline in a form.
 * A full-screen sheet: instruction, the agreement text if there is one, a large
 * canvas that fills the space, an inline Clear, and Cancel / Save signature in a
 * sticky footer. Save stays blocked until there's ink. Focus trap, Esc-to-close
 * and focus restore come from <Modal>.
 */
export function SignatureModal({
  open,
  onClose,
  onSave,
  title = "Customer signature",
  instruction = "Ask the customer to sign below.",
  agreementText,
  signerName,
  busy = false,
  progress = null
}: SignatureModalProps) {
  const padRef = useRef<SignaturePadHandle>(null);
  const [hasInk, setHasInk] = useState(false);
  const toast = useToast();

  async function handleSave() {
    const blob = await padRef.current?.toBlob();
    if (!blob) {
      toast.error("Couldn't read the signature. Try signing again.");
      return;
    }
    await onSave(blob);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      dismissible={!busy}
      title={title}
      size="fullscreen"
      footer={
        <div className="grid grid-cols-[auto_1fr] gap-2.5">
          <Button variant="secondary" size="lg" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            size="lg"
            fullWidth
            loading={busy}
            blockedReason={hasInk ? undefined : "The customer needs to sign in the box above."}
            onBlocked={reason => toast.error(reason)}
            onClick={() => void handleSave()}
          >
            {busy
              ? progress !== null
                ? `Saving ${Math.round(progress * 100)}%`
                : "Saving…"
              : "Save signature"}
          </Button>
        </div>
      }
    >
      <div className="flex h-full flex-col gap-3">
        <p className="text-body text-fg-muted">{instruction}</p>

        {agreementText && (
          <div className="rounded-card border border-line bg-surface-sunken px-4 py-3">
            <p className="mb-1.5 text-eyebrow uppercase text-fg-subtle">
              Please read before signing
            </p>
            <p className="text-body text-fg">{agreementText}</p>
          </div>
        )}

        {signerName && (
          <p className="text-helper text-fg-muted">
            Signing as <strong className="font-semibold text-fg">{signerName}</strong>
          </p>
        )}

        <SignaturePad ref={padRef} fill onChange={setHasInk} placeholder="Sign here" />

        {busy && progress !== null && (
          <div className="h-1.5 overflow-hidden rounded-pill bg-line" role="status" aria-label="Saving signature">
            <div
              className="h-full rounded-pill bg-brand transition-[width] duration-fast"
              style={{ width: `${Math.max(4, progress * 100)}%` }}
            />
          </div>
        )}
      </div>
    </Modal>
  );
}
