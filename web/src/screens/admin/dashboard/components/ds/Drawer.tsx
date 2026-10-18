import React, { useId, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cx } from "../../../../../ui/cx";
import { focusRing } from "./primitives";
import { useDialogFocus } from "../../../../../ui/useDialogFocus";


/**
 * Right-hand detail panel (full screen below `md`). Dialog semantics, focus moves in
 * on open and is trapped, Escape closes, focus returns to whatever opened it, and
 * the page behind keeps its scroll position because it never unmounts.
 */
export function Drawer({ open, onClose, title, subtitle, headerExtra, footer, children, width = "lg", labelledBy }: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  headerExtra?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  width?: "md" | "lg" | "xl";
  labelledBy?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  const titleId = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useDialogFocus(open, panelRef, onClose);

  if (!open) return null;
  const widths = { md: "md:max-w-[560px]", lg: "md:max-w-[760px]", xl: "md:max-w-[min(960px,calc(100vw-240px))]" };
  return createPortal(
    <div className="fixed inset-0 z-[90] flex justify-end print:hidden">
      <div aria-hidden className="tmv-scrim tmv-drawer-scrim absolute inset-0 animate-in fade-in" onMouseDown={() => onCloseRef.current()} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy ?? titleId}
        tabIndex={-1}
        // The panel only takes focus programmatically (on open); the global :focus-visible ring is for keyboard targets.
        style={{ outline: "none" }}
        className={cx("relative flex h-full w-full flex-col bg-admin-bg shadow-md outline-none animate-in slide-in-from-right-10 motion-reduce:animate-none md:border-l md:border-admin-line", widths[width])}
      >
        <div className="flex items-start gap-1 border-b border-admin-line bg-white px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 md:gap-2 md:px-6">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="truncate text-[20px] font-bold leading-7 text-admin-ink">{title}</h2>
            {subtitle && <div className="mt-0.5 text-[13.5px] text-admin-ink-2">{subtitle}</div>}
          </div>
          <button type="button" onClick={() => onCloseRef.current()} aria-label="Close" className={cx("grid h-10 w-10 shrink-0 place-items-center rounded-lg text-admin-ink-2 hover:bg-admin-surface hover:text-admin-ink", focusRing)}>
            <X aria-hidden className="h-5 w-5" />
          </button>
        </div>
        {headerExtra && <div className="border-b border-admin-line bg-white px-4 md:px-6">{headerExtra}</div>}
        <div tabIndex={0} aria-label="Details" className="min-h-0 flex-1 overflow-y-auto px-4 py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-admin-brand md:px-6 md:py-5">{children}</div>
        {footer && <div className="border-t border-admin-line bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:px-6">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}
