import { useEffect, useState } from "react";
import { DownloadCloud, X } from "lucide-react";
import { useServiceWorkerUpdate } from "../screens/pwa-settings/hooks/useServiceWorkerUpdate";

const DISMISS_KEY = "tmv-pwa:update-banner-dismissed";

/**
 * App-wide "a new version is available" prompt. Shown whenever a service worker is
 * waiting, so drivers who never open PWA Settings still get fixes. Dismissible for
 * the session; it returns on the next load while the update is still pending.
 *
 * Fixed above the mobile tab bar (and the safe-area inset) so it never covers a
 * screen header; below modals and toasts in the stack.
 */
export function UpdateBanner() {
  const { needRefresh, updating, applyUpdate } = useServiceWorkerUpdate();
  const [updateRequested, setUpdateRequested] = useState(() => {
    try {
      return new URLSearchParams(window.location.search).get("update") === "app";
    } catch {
      return false;
    }
  });
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      return false;
    }
  });

  // A fresh "waiting" worker should re-show the banner even if dismissed earlier.
  useEffect(() => {
    if (needRefresh) {
      try {
        if (sessionStorage.getItem(DISMISS_KEY) !== "1") setDismissed(false);
      } catch {
        /* ignore */
      }
    }
  }, [needRefresh]);

  useEffect(() => {
    if (!updateRequested || !needRefresh) return;
    setUpdateRequested(false);
    try {
      window.history.replaceState({}, "", window.location.pathname || "/");
    } catch {
      /* ignore */
    }
    void applyUpdate();
  }, [updateRequested, needRefresh, applyUpdate]);

  if (!needRefresh || dismissed) return null;

  function dismiss() {
    setDismissed(true);
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 z-40 flex justify-center px-3"
      style={{
        bottom:
          "calc(env(safe-area-inset-bottom) + var(--bottom-nav-height, 0px) + 12px)",
      }}
    >
      <div className="pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-card border border-line-strong bg-surface py-2.5 pl-4 pr-2.5 text-fg shadow-md">
        <DownloadCloud className="size-[18px] shrink-0 text-fg-muted" aria-hidden />
        <span className="flex-1 text-[13.5px] font-medium leading-snug">
          A new version of TMV BOT is available.
        </span>
        <button
          type="button"
          disabled={updating}
          onClick={() => void applyUpdate()}
          className="h-10 shrink-0 rounded-[11px] bg-fg px-4 text-[13.5px] font-bold text-bg transition-transform duration-fast active:scale-[0.93] disabled:opacity-60"
        >
          Refresh
        </button>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="grid size-9 shrink-0 place-items-center rounded-[10px] text-fg-muted transition-transform duration-fast active:scale-[0.93]"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
