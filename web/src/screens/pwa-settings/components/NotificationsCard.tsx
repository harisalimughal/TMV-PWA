import React, { useState } from "react";
import { Bell, BellOff, BellRing } from "lucide-react";
import { Alert, Button } from "../../../ui";
import { useToast } from "../../../components/ui/Toast";
import { getPlatform } from "../../../lib/pwa/platform";
import { useNotificationPermission } from "../hooks/useNotificationPermission";
import type { NotificationPermissionState } from "../../../lib/pwa/types";
import { SettingCard } from "./SettingCard";
import { StatusRow } from "./StatusRow";

const PRESENTATION: Record<
  NotificationPermissionState,
  { label: string; tone: "success" | "danger" | "neutral" }
> = {
  granted: { label: "Allowed", tone: "success" },
  denied: { label: "Blocked", tone: "danger" },
  default: { label: "Not enabled", tone: "neutral" },
  unsupported: { label: "Not supported", tone: "neutral" },
};

function blockedGuidance(): string {
  switch (getPlatform()) {
    case "ios":
      return "Open iOS Settings › Notifications › TMV BOT and turn Allow Notifications on.";
    case "android":
      return "Open your browser's site settings for this page and set Notifications to Allow.";
    default:
      return "Click the padlock (or tune) icon next to the address bar, then set Notifications to Allow.";
  }
}

/**
 * Section 7: notification permission state + a gesture-driven request.
 *
 * Permission only — there is no push backend in this project, so this never calls
 * `PushManager.subscribe()`. `pushCapable` makes the distinction visible and the
 * code is structured so a subscription step can be added later.
 */
export function NotificationsCard() {
  const { permission, supported, pushCapable, request } = useNotificationPermission();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const presentation = PRESENTATION[permission];

  async function handleEnable() {
    setBusy(true);
    try {
      const next = await request();
      if (next === "granted") toast.success("Notifications enabled");
      else if (next === "denied") toast.info("Notifications not enabled");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SettingCard
      icon={<Bell />}
      title="Notifications"
      description="Allow TMV BOT to send important job and app notifications."
    >
      <div className="flex flex-col gap-3" aria-live="polite">
        <StatusRow
          label="Permission"
          value={presentation.label}
          tone={presentation.tone}
          icon={
            permission === "granted" ? (
              <BellRing aria-hidden />
            ) : permission === "denied" ? (
              <BellOff aria-hidden />
            ) : (
              <Bell aria-hidden />
            )
          }
        />

        {permission === "default" && (
          <Button
            variant="primary"
            size="md"
            fullWidth
            loading={busy}
            iconLeft={<Bell />}
            onClick={() => void handleEnable()}
          >
            Enable Notifications
          </Button>
        )}

        {permission === "denied" && (
          <Alert tone="warning" title="Notifications are blocked in your browser settings.">
            {blockedGuidance()}
          </Alert>
        )}

        {permission === "unsupported" && (
          <Alert tone="info" title="Not available here">
            This browser doesn't support notifications. Try Chrome or Edge on desktop,
            or install the app on Android.
          </Alert>
        )}

        {permission === "granted" && (
          <p className="text-helper text-fg-subtle">
            {pushCapable
              ? "Notifications are allowed. Push delivery for job alerts will activate once it's switched on for your account."
              : "Notifications are allowed for this browser session. Background push delivery isn't available on this device."}
          </p>
        )}

        {!supported && permission !== "unsupported" && (
          <p className="text-helper text-fg-subtle">
            Notification support is limited in this browser.
          </p>
        )}
      </div>
    </SettingCard>
  );
}
