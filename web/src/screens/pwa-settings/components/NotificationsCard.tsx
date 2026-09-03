import React, { useState } from "react";
import { Bell, BellOff, BellRing, Send, CheckCircle2 } from "lucide-react";
import { Alert, Button } from "../../../ui";
import { useToast } from "../../../components/ui/Toast";
import { getPlatform, isStandalone } from "../../../lib/pwa/platform";
import { usePushNotifications } from "../../../lib/pwa/usePushNotifications";
import { SettingCard } from "./SettingCard";
import { StatusRow } from "./StatusRow";

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

export function NotificationsCard() {
  const {
    permission,
    isSupported,
    isSubscribed,
    isLoading,
    subscribe,
    unsubscribe,
    sendTestNotification
  } = usePushNotifications();

  const toast = useToast();
  const [testing, setTesting] = useState(false);
  const platform = getPlatform();
  const standalone = isStandalone();

  async function handleEnable() {
    const success = await subscribe();
    if (success) {
      toast.success("Push notifications enabled!");
    } else {
      if (Notification.permission === "denied") {
        toast.info("Notifications were blocked in settings.");
      } else {
        toast.error("Failed to enable push notifications.");
      }
    }
  }

  async function handleTest() {
    setTesting(true);
    try {
      const ok = await sendTestNotification();
      if (ok) {
        toast.success("Test notification sent! Check your device.");
      } else {
        toast.error("Failed to send test notification.");
      }
    } finally {
      setTesting(false);
    }
  }

  const isGranted = permission === "granted";

  return (
    <SettingCard
      icon={<Bell />}
      title="Push Notifications"
      description="Enable notifications after installing the app so this device can receive job alerts."
    >
      <div className="flex flex-col gap-3" aria-live="polite">
        <StatusRow
          label="Push Status"
          value={
            isSubscribed
              ? "Active & Subscribed"
              : isGranted
              ? "Permission Allowed"
              : permission === "denied"
              ? "Blocked"
              : permission === "unsupported"
              ? "Not supported"
              : "Not enabled"
          }
          tone={isSubscribed || isGranted ? "success" : permission === "denied" ? "danger" : "neutral"}
          icon={
            isSubscribed ? (
              <BellRing className="text-success" aria-hidden />
            ) : isGranted ? (
              <CheckCircle2 className="text-success" aria-hidden />
            ) : permission === "denied" ? (
              <BellOff className="text-danger" aria-hidden />
            ) : (
              <Bell aria-hidden />
            )
          }
        />

        {/* iOS Web Push Requirement: Must be added to Home Screen on iOS */}
        {platform === "ios" && !standalone && (
          <Alert tone="info" title="iPhone / iPad Notification Tip">
            Add TMV BOT to the Home Screen from Safari first. Then open the installed app and enable notifications here.
          </Alert>
        )}

        {platform === "android" && !standalone && (
          <Alert tone="info" title="Android Notification Tip">
            Install TMV BOT from Chrome using Install app or Add to Home screen, then enable notifications here.
          </Alert>
        )}

        {/* Action Button: Enable */}
        {(!isGranted || !isSubscribed) && permission !== "denied" && permission !== "unsupported" && (
          <Button
            variant="primary"
            size="md"
            fullWidth
            loading={isLoading}
            iconLeft={<Bell />}
            onClick={() => void handleEnable()}
          >
            Enable Push Notifications
          </Button>
        )}

        {/* Action Button: Send Test */}
        {isSubscribed && (
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="md"
              fullWidth
              loading={testing}
              iconLeft={<Send />}
              onClick={() => void handleTest()}
            >
              Send Test Notification
            </Button>
          </div>
        )}

        {permission === "denied" && (
          <Alert tone="warning" title="Notifications are blocked in your device settings.">
            {blockedGuidance()}
          </Alert>
        )}

        {permission === "unsupported" && (
          <Alert tone="info" title="Not available in this browser">
            This browser doesn&apos;t support Web Push notifications. Try Chrome or Edge on desktop/Android, or Safari on iOS 16.4+.
          </Alert>
        )}

        {isSubscribed && (
          <p className="text-helper text-fg-subtle">
            Your phone is registered to receive background notifications even when the app is closed.
          </p>
        )}
      </div>
    </SettingCard>
  );
}
