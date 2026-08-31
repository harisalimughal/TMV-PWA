import React, { useState } from "react";
import { Download, Info, MonitorSmartphone, Share } from "lucide-react";
import { Alert, Button } from "../../../ui";
import { useToast } from "../../../components/ui/Toast";
import { usePwaInstall } from "../hooks/usePwaInstall";
import { SettingCard } from "./SettingCard";
import { IosInstallSheet } from "./IosInstallSheet";

/**
 * Section 1 + 2: the primary install call-to-action. Exactly one of the branches
 * below renders, chosen from `usePwaInstall().status`. No branch shows a control that
 * can't do anything — where the platform can't install programmatically it shows
 * guidance instead.
 */
export function InstallAppCard() {
  const { status, promptInstall, inAppBrowser } = usePwaInstall();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [iosSheetOpen, setIosSheetOpen] = useState(false);

  async function handleInstall() {
    setBusy(true);
    try {
      const outcome = await promptInstall();
      if (outcome === "accepted") toast.success("Installing TMV BOT…");
      else if (outcome === "dismissed") toast.info("Installation dismissed");
      else toast.error("The install prompt isn't available right now.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SettingCard
      icon={<MonitorSmartphone />}
      title="Install App"
      description="Install TMV BOT on this device for faster access and an app-like experience."
    >
      <div className="flex flex-col gap-3" aria-live="polite">
        {status === "installed" && (
          <Alert tone="success" title="Installed on this device">
            You're running the installed TMV BOT app. Updates are handled below.
          </Alert>
        )}

        {status === "installable" && (
          <Button
            variant="primary"
            size="lg"
            fullWidth
            loading={busy}
            iconLeft={<Download />}
            onClick={handleInstall}
          >
            Install App
          </Button>
        )}

        {status === "ios-safari" && (
          <Button
            variant="primary"
            size="lg"
            fullWidth
            iconLeft={<Share />}
            onClick={() => setIosSheetOpen(true)}
          >
            Install on iPhone / iPad
          </Button>
        )}

        {status === "ios-other-browser" && (
          <>
            <Alert tone="warning" title="Open in Safari to install">
              On iPhone and iPad, TMV BOT can only be added to the Home Screen from
              Safari.
            </Alert>
            <Button
              variant="secondary"
              size="md"
              fullWidth
              iconLeft={<Info />}
              onClick={() => setIosSheetOpen(true)}
            >
              Show me how
            </Button>
          </>
        )}

        {status === "needs-browser-menu" && (
          <Alert tone="info" title="Install from your browser menu">
            Your browser can install this app, but it hasn't offered the prompt yet.
            Open the browser menu and choose{" "}
            <strong className="font-semibold">Install app</strong> or{" "}
            <strong className="font-semibold">Add to Home screen</strong>.
          </Alert>
        )}

        {status === "unsupported" && (
          <Alert tone="info" title="Installation not supported here">
            This browser can't install web apps. Try Chrome or Edge on desktop, or
            Chrome / Safari on a phone.
          </Alert>
        )}
      </div>

      <IosInstallSheet
        open={iosSheetOpen}
        onClose={() => setIosSheetOpen(false)}
        inAppOrOtherBrowser={status === "ios-other-browser" || inAppBrowser}
      />
    </SettingCard>
  );
}
