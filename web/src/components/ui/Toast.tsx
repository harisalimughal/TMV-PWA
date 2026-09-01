import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";

type ToastTone = "success" | "error" | "info";

interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
  onClick?: () => void;
}

interface ToastOptions {
  /** Makes the whole toast clickable (e.g. open whatever a push notification was
   *  about) without disturbing its own Dismiss button, which stays independently
   *  clickable via stopPropagation. */
  onClick?: () => void;
}

interface ToastApi {
  success: (message: string, opts?: ToastOptions) => void;
  error: (message: string, opts?: ToastOptions) => void;
  info: (message: string, opts?: ToastOptions) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error("useToast must be used inside <ToastProvider>");
  return api;
}

const TONE_STYLES: Record<ToastTone, { wrap: string; icon: React.ReactNode }> = {
  success: {
    wrap: "bg-fg text-bg",
    icon: <CheckCircle2 className="size-[18px] shrink-0 text-success" aria-hidden />
  },
  error: {
    wrap: "bg-fg text-bg",
    icon: <AlertTriangle className="size-[18px] shrink-0 text-danger" aria-hidden />
  },
  info: {
    wrap: "bg-fg text-bg",
    icon: <Info className="size-[18px] shrink-0" aria-hidden />
  }
};

/**
 * Toasts render top-anchored rather than bottom-anchored: the bottom of the screen is
 * where the primary action lives on every screen in this app, and a toast that covers
 * the button the driver just failed to press is worse than no toast.
 *
 * The live region is polite + atomic so screen readers announce the whole message
 * once, which is also what makes "you can't submit yet, here's why" reachable to AT --
 * previously nothing announced a failed submit at all.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const push = useCallback((tone: ToastTone, message: string, opts?: ToastOptions) => {
    const id = nextId.current++;
    setToasts(prev => [...prev.filter(t => t.message !== message), { id, tone, message, onClick: opts?.onClick }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), tone === "error" ? 6000 : 3500);
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      success: (message, opts) => push("success", message, opts),
      error: (message, opts) => push("error", message, opts),
      info: (message, opts) => push("info", message, opts)
    }),
    [push]
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 top-0 z-[300] flex flex-col items-center gap-2 px-3 pt-[calc(env(safe-area-inset-top)+12px)]"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {toasts.map(toast => (
          <div
            key={toast.id}
            role={toast.onClick ? "button" : undefined}
            tabIndex={toast.onClick ? 0 : undefined}
            onClick={toast.onClick}
            onKeyDown={
              toast.onClick
                ? event => {
                    if (event.key === "Enter" || event.key === " ") toast.onClick!();
                  }
                : undefined
            }
            className={`pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-card px-3.5 py-2.5 shadow-md animate-in slide-in-from-top-4 ${
              toast.onClick ? "cursor-pointer" : ""
            } ${TONE_STYLES[toast.tone].wrap}`}
          >
            {TONE_STYLES[toast.tone].icon}
            <span className="flex-1 text-[13px] font-medium leading-snug">{toast.message}</span>
            <button
              onClick={event => {
                event.stopPropagation();
                setToasts(prev => prev.filter(t => t.id !== toast.id));
              }}
              className="-mr-1 shrink-0 p-1 opacity-70 hover:opacity-100"
              aria-label="Dismiss"
            >
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/** Scroll an element into view and briefly ring it -- used to point at the field or
 *  control that's blocking a submit, rather than only naming it in a toast. */
export function useHighlight() {
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  return useCallback((element: HTMLElement | null) => {
    if (!element) return;
    element.scrollIntoView({ behavior: "smooth", block: "center" });
    element.classList.add("ring-2", "ring-warning", "ring-offset-2", "rounded-2xl");
    const timer = window.setTimeout(() => {
      element.classList.remove("ring-2", "ring-warning", "ring-offset-2");
    }, 2200);
    timers.current.push(timer);
  }, []);
}
