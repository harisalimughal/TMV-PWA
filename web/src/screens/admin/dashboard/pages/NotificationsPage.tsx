import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Download,
  Search,
  Bell,
  BellRing,
  AlertTriangle,
  Mail,
  Smartphone,
  Send,
  Radio,
  CheckCircle2,
  Loader2
} from "lucide-react";
import { fetchNotifications, NotificationRow } from "../api";
import { DateRangePicker } from "../components/DateRangePicker";
import { formatLondonDateTime } from "../utils/date";
import { getAvatarColor } from "../utils/drivers";
import { downloadCsv, toCsv } from "../utils/csv";
import { usePushNotifications } from "../../../../lib/pwa/usePushNotifications";
import { SendBroadcastPushModal } from "../components/SendBroadcastPushModal";
import { useToast } from "../../../../components/ui/Toast";

const STATUS_PILL: Record<NotificationRow["email"]["state"], string> = {
  sent: "bg-admin-status-green-bg text-admin-status-green",
  failed: "bg-admin-status-red-bg text-admin-status-red",
  pending: "bg-amber-100 text-amber-700",
  skipped: "bg-admin-surface text-admin-muted",
  disabled: "bg-admin-surface text-admin-muted"
};

const STATUS_LABEL: Record<NotificationRow["email"]["state"], string> = {
  sent: "Sent",
  failed: "Failed",
  pending: "Pending",
  skipped: "No target",
  disabled: "SMS off"
};

const normalizePhone = (phone?: string) => {
  if (!phone) return { formatted: "—", isInvalid: true };
  const cleaned = phone.replace(/\D/g, "");
  if (cleaned.length < 10) return { formatted: phone, isInvalid: true };
  if (cleaned.startsWith("447") && cleaned.length === 12) {
    return { formatted: `0${cleaned.slice(2, 6)} ${cleaned.slice(6)}`, isInvalid: false };
  }
  if (cleaned.startsWith("07") && cleaned.length === 11) {
    return { formatted: `${cleaned.slice(0, 5)} ${cleaned.slice(5)}`, isInvalid: false };
  }
  return { formatted: phone, isInvalid: false };
};

// Columns for the notifications export. Cell encoding (CSV quoting + spreadsheet
// formula-injection guard) is handled centrally by toCsv/sanitizeCsvCell -- this file
// no longer carries its own escaper.
const NOTIFICATION_CSV_COLUMNS: Array<{ header: string; value: (r: NotificationRow) => unknown }> = [
  { header: "Job ID", value: r => r.jobId },
  { header: "Customer", value: r => r.customerName },
  { header: "Driver", value: r => r.driverInitials },
  { header: "Started", value: r => formatLondonDateTime(r.actualStart) },
  { header: "Email address", value: r => r.customerEmail },
  { header: "Email", value: r => STATUS_LABEL[r.email.state] },
  { header: "Phone number", value: r => r.customerPhone },
  { header: "SMS", value: r => STATUS_LABEL[r.sms.state] }
];

// Real email/SMS delivery status, from the classic bot's own ActivityLog rows (see
// dashboard/server/routes/notifications.route.ts) -- not a fabricated per-job hash.
export function NotificationsPage() {
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const [from, setFrom] = useState<string | undefined>();
  const [to, setTo] = useState<string | undefined>();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [broadcastModalOpen, setBroadcastModalOpen] = useState(false);
  const [testingMyDevice, setTestingMyDevice] = useState(false);

  const toast = useToast();
  const {
    isSubscribed,
    isLoading: pushLoading,
    subscribe: subscribePush,
    sendTestNotification
  } = usePushNotifications();

  const handleTestMyDevice = async () => {
    setTestingMyDevice(true);
    try {
      const ok = await sendTestNotification();
      if (ok) toast.success("Test push notification sent to your device!");
      else toast.error("Could not deliver test push.");
    } finally {
      setTestingMyDevice(false);
    }
  };

  const handleEnablePush = async () => {
    const ok = await subscribePush();
    if (ok) toast.success("This device is now subscribed to push notifications!");
    else toast.info("Push notification permission not granted.");
  };

  const { data, isLoading, error } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => fetchNotifications()
  });

  const allRows = data?.rows || [];

  const dateFiltered = allRows.filter(r => {
    if (from && r.actualStart < from) return false;
    if (to && r.actualStart > to) return false;
    return true;
  });

  const filtered = dateFiltered.filter(r => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!r.jobId.toLowerCase().includes(q) && !(r.customerName || "").toLowerCase().includes(q)) return false;
    }
    if (statusFilter === "Sent" && r.email.state !== "sent" && r.sms.state !== "sent") return false;
    if (statusFilter === "Failed" && r.email.state !== "failed" && r.sms.state !== "failed") return false;
    if (statusFilter === "Pending" && r.email.state !== "pending" && r.sms.state !== "pending") return false;
    return true;
  });

  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="space-y-6 max-w-[1440px] mx-auto">
      {/* PAGE HEADER */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-2">
        <div className="flex items-center gap-3">
          <Bell className="w-6 h-6 text-admin-brand" />
          <h1 className="text-title text-fg">Notifications & Web Push</h1>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setBroadcastModalOpen(true)}
            className="h-10 px-4 rounded-control bg-admin-brand hover:bg-admin-brand-hover text-white text-button shadow-sm transition flex items-center gap-2"
          >
            <Send className="w-4 h-4" /> Send Push Notice
          </button>
          <button
            onClick={() =>
              downloadCsv(
                `notifications-${new Date().toISOString().slice(0, 10)}.csv`,
                toCsv(filtered, NOTIFICATION_CSV_COLUMNS)
              )
            }
            disabled={!filtered.length}
            className="h-10 px-4 rounded-control border border-line-strong bg-surface hover:bg-surface-sunken text-fg text-button shadow-sm transition flex items-center gap-2 disabled:opacity-50"
          >
            <Download className="w-4 h-4" /> Export CSV
          </button>
        </div>
      </div>

      {/* PWA & PUSH NOTIFICATION DASHBOARD CARD */}
      <div className="p-5 bg-white rounded-module border border-admin-line shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-admin-brand-soft text-admin-brand flex items-center justify-center border border-admin-brand/20 shrink-0">
            {isSubscribed ? <BellRing className="w-6 h-6 text-admin-brand" /> : <Radio className="w-6 h-6 text-admin-brand" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-[15px] font-bold text-admin-ink">PWA Push Notification System</h3>
              <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                isSubscribed ? "bg-admin-status-green-bg text-admin-status-green border border-admin-status-green/30" : "bg-admin-surface text-admin-muted border border-admin-line"
              }`}>
                {isSubscribed ? "This Device: Subscribed" : "This Device: Not Subscribed"}
              </span>
            </div>
            <p className="text-[13px] text-admin-ink-2 mt-0.5 max-w-2xl">
              Web Push allows dispatching real-time notifications to driver phones and admin screens even when the app is closed. Compatible with Android and iOS 16.4+.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-stretch md:self-auto shrink-0">
          {!isSubscribed ? (
            <button
              onClick={handleEnablePush}
              disabled={pushLoading}
              className="h-9 px-3 rounded-control bg-admin-brand-soft hover:bg-admin-brand-soft/80 text-admin-brand text-[13px] font-bold transition flex items-center gap-1.5 border border-admin-brand/20"
            >
              <Bell className="w-4 h-4" /> Enable Device Alerts
            </button>
          ) : (
            <button
              onClick={handleTestMyDevice}
              disabled={testingMyDevice}
              className="h-9 px-3 rounded-control border border-admin-line bg-admin-surface hover:bg-white text-admin-ink text-[13px] font-medium transition flex items-center gap-1.5 shadow-sm"
            >
              {testingMyDevice ? <Loader2 className="w-4 h-4 animate-spin text-admin-brand" /> : <Send className="w-4 h-4 text-admin-brand" />}
              Test My Device
            </button>
          )}
          <button
            onClick={() => setBroadcastModalOpen(true)}
            className="h-9 px-3 rounded-control bg-admin-surface hover:bg-white text-admin-ink border border-admin-line text-[13px] font-medium transition flex items-center gap-1.5 shadow-sm"
          >
            <Send className="w-4 h-4 text-admin-ink-2" /> Broadcast Notice
          </button>
        </div>
      </div>

      {/* TOOLBAR */}
      <div className="p-2 bg-white rounded-module shadow-sm border border-admin-line flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-1 bg-admin-surface p-1 rounded-card">
          {["All", "Sent", "Failed", "Pending"].map((s) => (
            <button
              key={s}
              onClick={() => { setStatusFilter(s); setPage(1); }}
              className={`px-3 py-1.5 rounded-control text-[12px] font-medium transition ${
                statusFilter === s ? "bg-white text-admin-ink shadow-sm" : "text-admin-muted hover:text-admin-ink"
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        <div className="w-[1px] h-6 bg-admin-line mx-2" />

        <DateRangePicker from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); setPage(1); }} />

        <div className="flex-1 min-w-[200px] relative">
          <Search className="w-4 h-4 text-admin-muted absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by customer name or job ID..."
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
            className="w-full h-9 pl-9 pr-3 rounded-card bg-admin-surface border border-admin-line text-[13px] text-admin-ink placeholder:text-admin-muted outline-none focus:border-admin-brand transition"
          />
        </div>
      </div>

      {/* TABLE CONTENT */}
      {isLoading && (
        <div className="p-12 text-center bg-white rounded-module border border-admin-line">
          <span className="text-admin-muted font-medium">Loading notifications...</span>
        </div>
      )}

      {error && (
        <div className="p-12 text-center bg-white rounded-module border border-admin-status-red/20 text-admin-status-red">
          Failed to load notification logs.
        </div>
      )}

      {!isLoading && !error && filtered.length === 0 && (
        <div className="p-12 text-center bg-white rounded-module border border-admin-line text-admin-muted">
          No notifications match the selected filters.
        </div>
      )}

      {!isLoading && !error && filtered.length > 0 && (
        <div className="bg-white rounded-module shadow-sm border border-admin-line overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-admin-line bg-admin-surface/60 text-eyebrow text-fg-subtle">
                  <th className="py-3 px-4 font-bold">Job ID</th>
                  <th className="py-3 px-4 font-bold">Customer</th>
                  <th className="py-3 px-4 font-bold">Driver</th>
                  <th className="py-3 px-4 font-bold">Started (UK)</th>
                  <th className="py-3 px-4 font-bold">Email Target</th>
                  <th className="py-3 px-4 font-bold">Email Status</th>
                  <th className="py-3 px-4 font-bold">SMS Target</th>
                  <th className="py-3 px-4 font-bold">SMS Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-admin-line">
                {pageRows.map((row) => {
                  const driverInit = row.driverInitials || "UN";
                  const phoneInfo = normalizePhone(row.customerPhone);
                  const startedTime = formatLondonDateTime(row.actualStart);

                  return (
                    <tr key={row.jobId} className="hover:bg-admin-surface/40 transition">
                      <td className="px-4 py-3 text-[13px] font-mono font-medium text-admin-ink">
                        {row.jobId}
                      </td>

                      <td className="px-4 text-[14px] text-admin-ink font-medium">
                        <span className="truncate max-w-[150px] inline-block">{row.customerName || "—"}</span>
                      </td>

                      <td className="px-4">
                        <div className="flex items-center gap-2">
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-[10px] ${driverInit === "UN" ? "bg-admin-surface border border-admin-line text-admin-muted" : getAvatarColor(driverInit)}`}>
                            {driverInit}
                          </div>
                        </div>
                      </td>

                      <td className="px-4 text-[13px] text-admin-muted tabular-nums">{startedTime}</td>

                      <td className="px-4 text-[13px] text-admin-ink">
                        {row.customerEmail ? (
                          <span className="flex items-center gap-1.5">
                            <Mail className="w-3.5 h-3.5 text-admin-muted shrink-0" />
                            <span className="truncate max-w-[180px]">{row.customerEmail}</span>
                          </span>
                        ) : (
                          <span className="text-admin-muted italic">No email</span>
                        )}
                      </td>

                      <td className="px-4">
                        <span
                          className={`px-2 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider inline-flex items-center gap-1 ${STATUS_PILL[row.email.state]}`}
                          title={row.email.detail || undefined}
                        >
                          {STATUS_LABEL[row.email.state]}
                        </span>
                      </td>

                      <td className="px-4 text-[13px]">
                        {phoneInfo.isInvalid ? (
                          <span className="flex items-center gap-1.5 text-admin-muted">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                            {phoneInfo.formatted}
                          </span>
                        ) : (
                          <span className="flex items-center gap-1.5 text-admin-ink tabular-nums font-mono">
                            <Smartphone className="w-3.5 h-3.5 text-admin-muted shrink-0" />
                            {phoneInfo.formatted}
                          </span>
                        )}
                      </td>

                      <td className="px-4">
                        <span
                          className={`px-2 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider inline-flex items-center gap-1 ${STATUS_PILL[row.sms.state]}`}
                          title={row.sms.detail || undefined}
                        >
                          {STATUS_LABEL[row.sms.state]}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!isLoading && !error && filtered.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-2 text-[13px] text-admin-muted pb-8">
          <span>Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, filtered.length)} of {filtered.length}</span>
          <div className="flex gap-2 shrink-0">
            <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1.5 border border-line-strong rounded-control bg-surface hover:bg-surface-sunken disabled:opacity-50 transition text-button text-fg shadow-xs">Previous</button>
            <button disabled={page * pageSize >= filtered.length} onClick={() => setPage(p => p + 1)} className="px-3 py-1.5 border border-line-strong rounded-control bg-surface hover:bg-surface-sunken disabled:opacity-50 transition text-button text-fg shadow-xs">Next</button>
          </div>
        </div>
      )}

      {/* Broadcast Push Modal */}
      <SendBroadcastPushModal
        isOpen={broadcastModalOpen}
        onClose={() => setBroadcastModalOpen(false)}
      />
    </div>
  );
}
