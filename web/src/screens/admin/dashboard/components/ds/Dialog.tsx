import React, { useId, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cx } from "../../../../../ui/cx";
import { focusRing } from "./primitives";
import { useDialogFocus } from "../../../../../ui/useDialogFocus";

/**
 * Large centred record dialog with a sticky header and footer and one scrolling body
 * (full screen below `md`, with safe-area padding). Same dialog semantics as the Drawer:
 * focus moves in and is trapped, Escape and the scrim close it, focus returns to the
 * opener, and the page behind is scroll-locked and stays mounted. Rendered through a
 * portal, as the project's overlay rules require.
 */
export function Dialog({ open, onClose, title, subtitle, headerExtra, headerActions, fullScreen = false, footer, children, labelledBy, bodyLabel = "Details" }: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Sticky block under the title: badges, tabs. */
  headerExtra?: React.ReactNode;
  headerActions?: React.ReactNode;
  fullScreen?: boolean;
  footer?: React.ReactNode;
  children: React.ReactNode;
  labelledBy?: string;
  bodyLabel?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useDialogFocus(open, panelRef, onClose);

  if (!open) return null;
  return createPortal(
    <div className={cx("fixed inset-0 z-[90] flex items-stretch justify-center print:hidden", !fullScreen && "md:items-center md:p-6")}>
      <div aria-hidden className="tmv-scrim tmv-drawer-scrim absolute inset-0 animate-in fade-in motion-reduce:animate-none" onMouseDown={() => onCloseRef.current()} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy ?? titleId}
        tabIndex={-1}
        style={{ outline: "none" }}
        data-testid="center-dialog"
        className={cx("relative flex h-full w-full flex-col overflow-hidden bg-surface outline-none animate-in fade-in zoom-in-95 motion-reduce:animate-none md:rounded-2xl md:border md:border-admin-line md:shadow-2xl", !fullScreen && "md:h-[min(92vh,920px)] md:max-w-[min(1160px,100%)]")}
      >
        <div className="flex flex-wrap items-start gap-2 border-b border-admin-line bg-surface px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] md:px-6 md:pt-4">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="truncate text-[20px] font-bold leading-7 text-admin-ink">{title}</h2>
            {subtitle && <div className="mt-0.5 text-[13.5px] text-admin-ink-2">{subtitle}</div>}
          </div>
          {headerActions && <div className="order-last flex w-full flex-wrap items-center gap-2 sm:order-none sm:w-auto">{headerActions}</div>}
          <button type="button" onClick={() => onCloseRef.current()} aria-label="Close" className={cx("grid h-10 w-10 shrink-0 place-items-center rounded-lg text-admin-ink-2 hover:bg-admin-surface hover:text-admin-ink", focusRing)}>
            <X aria-hidden className="h-5 w-5" />
          </button>
        </div>
        {headerExtra && <div className="border-b border-admin-line bg-surface px-4 md:px-6">{headerExtra}</div>}
        <div tabIndex={0} aria-label={bodyLabel} className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-admin-bg px-4 py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-admin-brand md:px-6 md:py-5">{children}</div>
        {footer && <div className="border-t border-admin-line bg-surface px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:px-6">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}
