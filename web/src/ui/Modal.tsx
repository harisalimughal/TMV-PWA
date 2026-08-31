import React, { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";
import { cx } from "./cx";
import { IconButton } from "./IconButton";

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export type ModalSize = "sm" | "md" | "lg" | "fullscreen";

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
  children: React.ReactNode;
}

const SIZES: Record<ModalSize, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
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
  children
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement as HTMLElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && dismissible) {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const nodes = panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (!nodes || nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown, true);
    panelRef.current?.focus();

    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = prevOverflow;
      restoreRef.current?.focus?.();
    };
  }, [open, onClose, dismissible]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center p-0 sm:p-4"
      onMouseDown={event => {
        if (dismissible && event.target === event.currentTarget) onClose();
      }}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] animate-in fade-in" aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cx(
          "relative flex w-full flex-col overflow-hidden bg-surface outline-none",
          "rounded-t-panel sm:rounded-panel shadow-md",
          "max-h-[92vh] animate-in slide-in-from-bottom-5 sm:zoom-in-95",
          SIZES[size]
        )}
      >
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h2 id={titleId} className={cx("text-heading font-semibold text-fg truncate", hideTitle && "sr-only")}>
            {title}
          </h2>
          {dismissible && <IconButton aria-label="Close" icon={<X />} size="sm" onClick={onClose} />}
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto scroll-touch px-4 py-4">{children}</div>

        {footer && <div className="border-t border-line px-4 py-3 pb-safe">{footer}</div>}
      </div>
    </div>
  );
}
