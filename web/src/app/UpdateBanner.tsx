import { useEffect, useState } from "react";
import { DownloadCloud, X } from "lucide-react";
import { Button } from "../ui";
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
      <div className="pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-card bg-fg px-3.5 py-2.5 text-bg shadow-md">
        <DownloadCloud className="size-[18px] shrink-0" aria-hidden />
        <span className="flex-1 text-[13px] font-medium leading-snug">
          A new version of TMV BOT is available.
        </span>
        <Button
          variant="secondary"
          size="sm"
          loading={updating}
          onClick={() => void applyUpdate()}
        >
          Refresh
        </Button>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="-mr-1 shrink-0 p-1 opacity-70 transition-opacity hover:opacity-100"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
