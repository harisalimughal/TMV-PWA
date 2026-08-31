import { useCallback, useEffect, useState } from "react";
import {
  browserSupportsInstallPrompt,
  getPlatform,
  isInAppBrowser,
  isIosSafari,
  isStandalone,
} from "../../../lib/pwa/platform";
import { resolveInstallStatus } from "../../../lib/pwa/install-status";
import type { InstallOutcome, InstallStatus, Platform } from "../../../lib/pwa/types";

interface PwaInstall {
  status: InstallStatus;
  platform: Platform;
  installed: boolean;
  /** A native prompt is currently available to fire. */
  canPrompt: boolean;
  /** Inside a social / in-app web view (iOS guidance needs to mention Safari). */
  inAppBrowser: boolean;
  /** Fires the native prompt. Resolves with the user's choice, or `"unavailable"`. */
  promptInstall: () => Promise<InstallOutcome>;
}

function readEnv() {
  const captured =
    typeof window !== "undefined" ? window.__tmvInstallPrompt ?? null : null;
  const installed = isStandalone();
  const platform = getPlatform();
  return {
    installed,
    canPrompt: !!captured,
    platform,
    iosSafari: isIosSafari(),
    chromium: browserSupportsInstallPrompt(),
    inAppBrowser: isInAppBrowser(),
  };
}

/**
 * Owns install detection + the `beforeinstallprompt` flow.
 *
 * The event itself is captured pre-React by an inline script in index.html (it can
 * fire before the bundle executes) and stashed on `window.__tmvInstallPrompt`; this
 * hook reads that, then keeps in sync via the `tmv:installprompt` / `tmv:appinstalled`
 * custom events and a `display-mode` media-query listener.
 */
export function usePwaInstall(): PwaInstall {
  const [env, setEnv] = useState(readEnv);

  useEffect(() => {
    const refresh = () => setEnv(readEnv());

    window.addEventListener("tmv:installprompt", refresh);
    window.addEventListener("tmv:appinstalled", refresh);
    window.addEventListener("appinstalled", refresh);

    const mql = window.matchMedia?.("(display-mode: standalone)");
    mql?.addEventListener?.("change", refresh);

    // A late-arriving event that beat the listener registration.
    refresh();

    return () => {
      window.removeEventListener("tmv:installprompt", refresh);
      window.removeEventListener("tmv:appinstalled", refresh);
      window.removeEventListener("appinstalled", refresh);
      mql?.removeEventListener?.("change", refresh);
    };
  }, []);

  const promptInstall = useCallback(async (): Promise<InstallOutcome> => {
    const evt = typeof window !== "undefined" ? window.__tmvInstallPrompt : null;
    if (!evt) return "unavailable";
    try {
      await evt.prompt();
      const choice = await evt.userChoice;
      // The event is single-use — drop it so the UI stops offering the button.
      window.__tmvInstallPrompt = null;
      window.dispatchEvent(new Event("tmv:installprompt"));
      return choice.outcome === "accepted" ? "accepted" : "dismissed";
    } catch {
      window.__tmvInstallPrompt = null;
      window.dispatchEvent(new Event("tmv:installprompt"));
      return "unavailable";
    }
  }, []);

  return {
    status: resolveInstallStatus(env),
    platform: env.platform,
    installed: env.installed,
    canPrompt: env.canPrompt,
    inAppBrowser: env.inAppBrowser,
    promptInstall,
  };
}
