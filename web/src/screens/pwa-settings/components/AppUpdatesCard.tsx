import React, { useState } from "react";
import { CheckCircle2, DownloadCloud, RefreshCw, RotateCw } from "lucide-react";
import { Alert, Button } from "../../../ui";
import { useToast } from "../../../components/ui/Toast";
import { useServiceWorkerUpdate } from "../hooks/useServiceWorkerUpdate";
import { APP_VERSION_LABEL } from "../../../lib/pwa/version";
import { formatRelativeTime } from "../lib/format";
import { SettingCard } from "./SettingCard";
import { StatusRow } from "./StatusRow";

/**
 * Section 4: real service-worker update checking.
 *
 * `Check for Updates` calls `registration.update()`; if a worker is or becomes
 * `waiting`, `Update Now` posts SKIP_WAITING and the page reloads once when the new
 * worker takes control (handled by the plugin — no reload loop).
 */
export function AppUpdatesCard() {
  const {
    supported,
    needRefresh,
    checking,
    updating,
    lastCheck,
    checkForUpdates,
    applyUpdate,
  } = useServiceWorkerUpdate();
  const toast = useToast();
  const [lastResult, setLastResult] = useState<string | null>(null);

  async function handleCheck() {
    const result = await checkForUpdates();
    if (result === "up-to-date") {
      setLastResult("You're using the latest version.");
      toast.success("You're using the latest version.");
    } else if (result === "update-available") {
      setLastResult("Update available.");
    } else if (result === "unsupported") {
      setLastResult("Automatic updates aren't available in this browser.");
    } else {
      setLastResult("Update check could not be completed. Please try again.");
      toast.error("Update check could not be completed. Please try again.");
    }
  }

  const statusBadge = checking
    ? { value: "Checking…", tone: "info" as const, icon: <RefreshCw aria-hidden className="animate-spin" /> }
    : needRefresh
      ? { value: "Update available", tone: "warning" as const, icon: <DownloadCloud aria-hidden /> }
      : { value: "Up to date", tone: "success" as const, icon: <CheckCircle2 aria-hidden /> };

  return (
    <SettingCard
      icon={<RotateCw />}
      title="App Updates"
      description="Keep TMV BOT updated with the latest features and fixes."
    >
      <div className="flex flex-col gap-3">
        <StatusRow label="Current version" value={APP_VERSION_LABEL} tone="neutral" />
        <StatusRow
          label="Update status"
          value={statusBadge.value}
          tone={statusBadge.tone}
          icon={statusBadge.icon}
        />
        <StatusRow
          label="Last checked"
          value={formatRelativeTime(lastCheck)}
          tone="neutral"
        />

        <div aria-live="polite" className="flex flex-col gap-3">
          {!supported && (
            <Alert tone="info" title="Automatic updates unavailable">
              This browser doesn't support service workers. Reload the page to pick up
              the latest version.
              <div className="mt-2">
                <Button
                  variant="secondary"
                  size="sm"
                  iconLeft={<RotateCw />}
                  onClick={() => window.location.reload()}
                >
                  Reload page
                </Button>
              </div>
            </Alert>
          )}

          {supported && needRefresh && (
            <Alert tone="warning" title="Update available">
              A new version of TMV BOT is ready to install.
              <div className="mt-2">
                <Button
                  variant="primary"
                  size="md"
                  loading={updating}
                  iconLeft={<DownloadCloud />}
                  onClick={() => void applyUpdate()}
                >
                  Update Now
                </Button>
              </div>
            </Alert>
          )}

          {supported && !needRefresh && lastResult && (
            <p className="text-helper text-fg-subtle">{lastResult}</p>
          )}
        </div>

        {supported && (
          <Button
            variant="secondary"
            size="md"
            fullWidth
            loading={checking}
            iconLeft={<RefreshCw />}
            onClick={() => void handleCheck()}
          >
            Check for Updates
          </Button>
        )}
      </div>
    </SettingCard>
  );
}
