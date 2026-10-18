import React, { useState } from "react";
import { Bell, Send } from "lucide-react";
import { usePushNotifications } from "../../../../../lib/pwa/usePushNotifications";
import { useToast } from "../../../../../components/ui/Toast";
import { Action, Badge, Facts, Notice, Section } from "../ds";

/**
 * Push setup for the device the admin is using now (moved from the Alerts page,
 * audit p.19). It only affects this browser; the test notice goes to this device only.
 */
export function DeviceNotifications({ onOpenDeliveryLog }: { onOpenDeliveryLog: () => void }) {
  const toast = useToast();
  const push = usePushNotifications();
  const [testing, setTesting] = useState(false);
  const permission = push.permission === "unsupported" ? "Not supported" : push.permission === "granted" ? "Allowed" : push.permission === "denied" ? "Blocked in browser settings" : "Not asked yet";

  const enable = async () => {
    const ok = await push.subscribe();
    if (ok) toast.success("This device will now receive dashboard alerts.");
    else toast.info(push.permission === "denied" ? "Notifications are blocked for this site in the browser settings." : "Notification permission wasn't granted.");
  };
  const test = async () => {
    setTesting(true);
    try {
      const ok = await push.sendTestNotification();
      if (ok) toast.success("Test notification sent to this device.");
      else toast.error("The test notification couldn't be delivered to this device.");
    } finally { setTesting(false); }
  };

  return (
    <div className="space-y-4">
      <Section title="This device" description="Dashboard alerts for this browser, even when the tab is closed.">
        <div className="space-y-4 p-4 md:p-5">
          <Facts columns={3} rows={[
            { label: "Status", value: <Badge tone={push.isSubscribed ? "success" : "neutral"}>{push.isSubscribed ? "Receiving alerts" : "Not set up"}</Badge> },
            { label: "Browser permission", value: permission },
            { label: "Platform", value: push.platform }
          ]} />
          {!push.isSupported && <Notice tone="warning">This browser doesn't support push notifications. On iPhone, add the dashboard to the home screen first (iOS 16.4 or later).</Notice>}
          <div className="flex flex-wrap gap-2">
            {!push.isSubscribed ? (
              <Action variant="primary" icon={<Bell />} loading={push.isLoading} disabled={!push.isSupported || push.permission === "denied"} onClick={() => void enable()}>Turn on alerts for this device</Action>
            ) : (
              <>
                <Action icon={<Send />} loading={testing} onClick={() => void test()}>Send a test to this device</Action>
                <Action variant="ghost" loading={push.isLoading} onClick={() => void push.unsubscribe().then(ok => ok ? toast.success("Alerts turned off for this device.") : toast.error("Couldn't turn off alerts for this device."))}>Turn off for this device</Action>
              </>
            )}
          </div>
        </div>
      </Section>
      <Notice tone="info" action={<Action size="sm" onClick={onOpenDeliveryLog}>Open delivery log</Action>}>
        Customer and driver message delivery, and notices to drivers, are in Alerts → Delivery log.
      </Notice>
    </div>
  );
}
