import React from "react";
import { X } from "lucide-react";

interface ModalProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

/** Full-screen overlay on mobile widths (which is all this app targets) -- matches
 * "hand the phone to the customer to sign" UX: the modal takes over the screen so
 * there's no ambiguity about what device/surface they're signing on, and Cancel
 * clearly hands control back to the driver without touching workflow state. */
export function Modal({ title, onClose, children }: ModalProps) {
  return (
    <div className="fixed inset-0 z-50 bg-admin-bg flex flex-col pt-safe pb-safe pl-safe pr-safe">
      <div className="flex items-center justify-between px-4 py-4 border-b border-admin-line bg-white shrink-0">
        <h2 className="text-sm font-semibold text-admin-ink">{title}</h2>
        <button onClick={onClose} className="text-admin-muted hover:text-admin-ink p-1 -mr-1" aria-label="Close">
          <X className="w-5 h-5" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-5">{children}</div>
    </div>
  );
}
