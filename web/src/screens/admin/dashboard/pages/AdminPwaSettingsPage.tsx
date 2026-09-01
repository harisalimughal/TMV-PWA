import React, { useState } from "react";
import { Smartphone, Bell, BellRing, Send, Loader2, Radio, CheckCircle2, Download, RefreshCw, HardDrive, Cpu } from "lucide-react";
import { usePushNotifications } from "../../../../lib/pwa/usePushNotifications";
import { SendBroadcastPushModal } from "../components/SendBroadcastPushModal";
import { useToast } from "../../../../components/ui/Toast";
import { InstallAppCard } from "../../../pwa-settings/components/InstallAppCard";
import { InstallationStatusCard } from "../../../pwa-settings/components/InstallationStatusCard";
import { AppUpdatesCard } from "../../../pwa-settings/components/AppUpdatesCard";
import { OfflineModeCard } from "../../../pwa-settings/components/OfflineModeCard";
import { StorageCard } from "../../../pwa-settings/components/StorageCard";
import { DiagnosticsSection } from "../../../pwa-settings/components/DiagnosticsSection";

export function AdminPwaSettingsPage() {
  const toast = useToast();
  const [broadcastModalOpen, setBroadcastModalOpen] = useState(false);
  const [testing, setTesting] = useState(false);

  const {
    permission,
    isSupported,
    isSubscribed,
    isLoading: pushLoading,
    subscribe,
    sendTestNotification
  } = usePushNotifications();

  const handleEnable = async () => {
    const ok = await subscribe();
    if (ok) toast.success("Push notifications enabled on this device!");
    else toast.info("Push notification permission not granted.");
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      const ok = await sendTestNotification();
      if (ok) toast.success("Test push notification sent! Check your device/screen.");
      else toast.error("Could not deliver test notification.");
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-[1440px] mx-auto pb-24">
      {/* PAGE HEADER */}
      <div className="bg-white p-6 rounded-module border border-admin-line shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Smartphone className="w-5 h-5 text-admin-brand" />
            <h2 className="text-title text-fg">PWA & Push Notification Settings</h2>
          </div>
          <p className="text-[14px] text-admin-muted max-w-3xl">
            Manage device push notifications, Progressive Web App (PWA) installation, offline caches, and real-time operational alerts for Android, iOS, and desktop browsers.
          </p>
        </div>

        <button
          onClick={() => setBroadcastModalOpen(true)}
          className="h-10 px-4 rounded-control bg-admin-brand hover:bg-admin-brand-hover text-white text-button shadow-sm transition flex items-center gap-2 shrink-0"
        >
          <Send className="w-4 h-4" /> Broadcast Notice to Drivers
        </button>
      </div>

      {/* WEB PUSH NOTIFICATIONS CARD */}
      <div className="bg-white p-6 rounded-module border border-admin-line shadow-sm space-y-5">
        <div className="flex items-start justify-between border-b border-admin-line pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-admin-brand-soft text-admin-brand flex items-center justify-center border border-admin-brand/20">
              {isSubscribed ? <BellRing className="w-5 h-5 text-admin-brand" /> : <Bell className="w-5 h-5 text-admin-brand" />}
            </div>
            <div>
              <h3 className="text-[16px] font-bold text-admin-ink">Device Web Push Status</h3>
              <p className="text-[13px] text-admin-muted">
                Receive instant alerts for urgent job changes, driver exceptions, and customer updates.
              </p>
            </div>
          </div>

          <span className={`px-3 py-1 rounded-full text-[12px] font-bold ${
            isSubscribed
              ? "bg-admin-status-green-bg text-admin-status-green border border-admin-status-green/30"
              : permission === "denied"
              ? "bg-admin-status-red-bg text-admin-status-red border border-admin-status-red/30"
              : "bg-admin-surface text-admin-muted border border-admin-line"
          }`}>
            {isSubscribed ? "Active & Subscribed" : permission === "denied" ? "Blocked in Browser" : "Not Enabled"}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-2">
          {!isSubscribed ? (
            <button
              onClick={handleEnable}
              disabled={pushLoading}
              className="h-10 px-4 rounded-control bg-admin-brand hover:bg-admin-brand-hover text-white text-button shadow-sm transition flex items-center gap-2"
            >
              {pushLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bell className="w-4 h-4" />}
              Enable Push Notifications on This Device
            </button>
          ) : (
            <button
              onClick={handleTest}
              disabled={testing}
              className="h-10 px-4 rounded-control border border-admin-line bg-admin-surface hover:bg-white text-admin-ink text-button transition flex items-center gap-2 shadow-sm"
            >
              {testing ? <Loader2 className="w-4 h-4 animate-spin text-admin-brand" /> : <Send className="w-4 h-4 text-admin-brand" />}
              Send Test Notification to This Device
            </button>
          )}

          <button
            onClick={() => setBroadcastModalOpen(true)}
            className="h-10 px-4 rounded-control bg-admin-surface hover:bg-white text-admin-ink border border-admin-line text-button transition flex items-center gap-2 shadow-sm"
          >
            <Send className="w-4 h-4 text-admin-ink-2" />
            Send Notice to Driver(s)
          </button>
        </div>
      </div>

      {/* PWA DIAGNOSTICS & SYSTEM STATUS GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <InstallAppCard />
        <AppUpdatesCard />
        <OfflineModeCard />
        <StorageCard />
      </div>

      {/* SYSTEM DIAGNOSTICS */}
      <div className="bg-white p-6 rounded-module border border-admin-line shadow-sm">
        <DiagnosticsSection />
      </div>

      {/* BROADCAST MODAL */}
      <SendBroadcastPushModal
        isOpen={broadcastModalOpen}
        onClose={() => setBroadcastModalOpen(false)}
      />
    </div>
  );
}
