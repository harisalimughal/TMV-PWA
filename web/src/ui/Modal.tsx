import React, { useId, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cx } from "./cx";
import { IconButton } from "./IconButton";
import { useDialogFocus } from "./useDialogFocus";


export type ModalSize = "sm" | "md" | "lg" | "xl" | "2xl" | "3xl" | "fullscreen";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  /** Hide the header title visually (still labels the dialog). */
  hideTitle?: boolean;
  size?: ModalSize;
  /** Sticky footer, e.g. a row of buttons. */
  footer?: React.ReactNode;
  /** Set false to keep Esc / backdrop click from closing (e.g. mid-submit). */
  dismissible?: boolean;
  /** Responsive bottom sheet, centered dialog, or full-height left navigation drawer. */
  placement?: "responsive" | "center" | "left";
  children: React.ReactNode;
}

const SIZES: Record<ModalSize, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-4xl",
  "2xl": "max-w-5xl",
  "3xl": "max-w-6xl",
  fullscreen: "max-w-none w-full h-full rounded-none sm:rounded-none"
};

/**
 * Centred dialog. Focus trap, Esc-to-close, scroll lock and focus restore — folded in
 * from the previous components/Modal.tsx. Use for confirmations and small focused
 * tasks; for large editing flows use <Sheet> or a dedicated screen.
 */
export function Modal({
  open,
  onClose,
  title,
  hideTitle,
  size = "md",
  footer,
  dismissible = true,
  placement = "responsive",
  children
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  const titleId = useId();

  useDialogFocus(open, panelRef, onClose, dismissible);

  if (!open) return null;

  return createPortal(
    <div
      className={cx(
        "fixed inset-0 z-[100] flex",
        placement === "left" ? "items-stretch justify-start" : placement === "center" ? "items-center justify-center p-4" : "items-end justify-center p-0 sm:items-center sm:p-4"
      )}
      onMouseDown={event => {
        if (dismissible && event.target === event.currentTarget) onClose();
      }}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] animate-in fade-in" aria-hidden="true" onMouseDown={() => { if (dismissible) onClose(); }} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cx(
          "relative flex flex-col overflow-hidden bg-surface outline-none",
          placement === "left" ? "h-screen-safe w-[min(320px,85vw)] shadow-md" : "w-full",
          placement !== "left" && (placement === "center" ? "rounded-panel shadow-md" : "rounded-t-panel sm:rounded-panel shadow-md"),
          placement !== "left" && (placement === "center" ? "max-h-[92vh] animate-in zoom-in-95" : "max-h-[92vh] animate-in slide-in-from-bottom-5 sm:zoom-in-95"),
          placement !== "left" && SIZES[size]
        )}
      >
        <div className={cx("flex items-center justify-between gap-3 border-b border-line px-4 py-3", placement === "left" && "pt-[calc(env(safe-area-inset-top)+12px)]")}>
          <h2 id={titleId} className={cx("text-heading font-semibold text-fg truncate", hideTitle && "sr-only")}>
            {title}
          </h2>
          {dismissible && <IconButton aria-label="Close" icon={<X />} size="sm" onClick={onClose} />}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto scroll-touch px-4 py-4">{children}</div>

        {footer && (
          <div
            className={cx(
              "border-t border-line px-4 py-3",
              placement === "center"
                ? "pb-3"
                : "pb-[calc(var(--bottom-nav-h,0px)+env(safe-area-inset-bottom)+12px)]"
            )}
          >
            {footer}
          </div>
        )}
      </div>
    </div>, document.body
  );
}
