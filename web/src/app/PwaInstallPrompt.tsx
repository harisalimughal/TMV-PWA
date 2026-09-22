import React, { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { Button, IconButton } from "../ui";
import { useToast } from "../components/ui/Toast";
import { usePwaInstall } from "../screens/pwa-settings/hooks/usePwaInstall";

const DISMISSED_KEY = "tmv:pwa_install_prompt_dismissed";

function wasDismissedThisSession() {
  try {
    return sessionStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

function markDismissedThisSession() {
  try {
    sessionStorage.setItem(DISMISSED_KEY, "1");
  } catch {
    /* no-op: session storage can be unavailable in hardened browsers */
  }
}

/**
 * Global Chrome/Edge install call-to-action. Chrome exposes the real install dialog
 * only after `beforeinstallprompt` has fired; the inline script in index.html stores
 * that one-shot event before React mounts, and this component makes it visible from
 * the first app screen instead of hiding it in settings.
 */
export function PwaInstallPrompt() {
  const { status, promptInstall } = usePwaInstall();
  const toast = useToast();
  const [dismissed, setDismissed] = useState(wasDismissedThisSession);
  const [busy, setBusy] = useState(false);
  const canInstallNow = status === "installable";
  const canInstallFromMenu = status === "needs-browser-menu";
  const visible = (canInstallNow || canInstallFromMenu) && !dismissed;

  useEffect(() => {
    if (status !== "installable") setBusy(false);
  }, [status]);

  if (!visible) return null;

  async function install() {
    setBusy(true);
    const outcome = await promptInstall();
    setBusy(false);

    if (outcome === "accepted") {
      toast.success("Installing TMV Driver...");
      return;
    }

    if (outcome === "dismissed") {
      toast.info("Installation dismissed");
      markDismissedThisSession();
      setDismissed(true);
      return;
    }

    toast.error("The install prompt isn't available right now.");
  }

  function dismiss() {
    markDismissedThisSession();
    setDismissed(true);
  }

  return (
    <aside
      className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+82px)] z-[220] px-3 sm:bottom-5"
      aria-label="Install TMV Driver"
    >
      <div className="pointer-events-auto mx-auto flex w-full max-w-sm items-center gap-3 rounded-card border border-line-strong bg-surface px-3.5 py-3 shadow-lg">
        <Download className="size-5 shrink-0 text-brand" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-bold text-fg">Install TMV Driver</p>
          <p className="truncate text-[12.5px] text-fg-muted">
            {canInstallNow ? "Open faster from your home screen." : "Use Chrome menu > Install app."}
          </p>
        </div>
        {canInstallNow && (
          <Button size="sm" onClick={install} loading={busy}>
            Install App
          </Button>
        )}
        <IconButton aria-label="Dismiss install prompt" icon={<X />} onClick={dismiss} className="shrink-0" />
      </div>
    </aside>
  );
}
