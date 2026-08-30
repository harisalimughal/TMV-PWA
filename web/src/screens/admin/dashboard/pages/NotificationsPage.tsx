import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Download,
  Search,
  Bell,
  AlertTriangle,
  Mail,
  Smartphone
} from "lucide-react";
import { fetchNotifications, NotificationRow } from "../api";
import { DateRangePicker } from "../components/DateRangePicker";
import { formatLondonDateTime } from "../utils/date";
import { getAvatarColor } from "../utils/drivers";

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

function downloadCsv(filename: string, rows: NotificationRow[]) {
  const columns = ["Job ID", "Customer", "Driver", "Started", "Email address", "Email", "Phone number", "SMS"];
  const csvValue = (v: unknown) => {
    let s = v == null ? "" : String(v);
    if (/[",\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [columns.join(",")];
  for (const r of rows) {
    lines.push([
      r.jobId, r.customerName, r.driverInitials, formatLondonDateTime(r.actualStart),
      r.customerEmail, STATUS_LABEL[r.email.state], r.customerPhone, STATUS_LABEL[r.sms.state]
    ].map(csvValue).join(","));
  }
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// Real email/SMS delivery status, from the classic bot's own ActivityLog rows (see
// dashboard/server/routes/notifications.route.ts) -- not a fabricated per-job hash.
export function NotificationsPage() {
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const [from, setFrom] = useState<string | undefined>();
  const [to, setTo] = useState<string | undefined>();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");

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
          <h1 className="text-[20px] font-bold text-admin-ink">Notifications</h1>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => downloadCsv(`notifications-${new Date().toISOString().slice(0, 10)}.csv`, filtered)}
            disabled={!filtered.length}
            className="h-10 px-4 rounded-[12px] border border-admin-line bg-white hover:bg-admin-surface text-admin-ink text-[13px] font-medium shadow-sm transition flex items-center gap-2 disabled:opacity-50"
          >
            <Download className="w-4 h-4" /> Export CSV
          </button>
        </div>
      </div>

      {/* TOOLBAR */}
      <div className="p-2 bg-white rounded-[16px] shadow-sm border border-admin-line flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-1 bg-admin-surface p-1 rounded-xl">
          {["All", "Sent", "Failed", "Pending"].map((s) => (
            <button
              key={s}
              onClick={() => { setStatusFilter(s); setPage(1); }}
              className={`px-3 py-1.5 rounded-[8px] text-[12px] font-medium transition ${
                statusFilter === s ? "bg-white text-admin-ink shadow-sm" : "text-admin-muted hover:text-admin-ink"
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        <div className="w-[1px] h-6 bg-admin-line mx-2" />

        <DateRangePicker from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); setPage(1); }} />

        <div className="w-[1px] h-6 bg-admin-line mx-2" />

        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-admin-muted absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search Job ID or Customer..."
            value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); setPage(1); }}
            className="w-full h-9 pl-9 pr-3 rounded-[8px] border border-admin-line bg-white text-[13px] outline-none focus:border-admin-brand focus:ring-1 focus:ring-admin-brand transition"
          />
        </div>

        <span className="text-[13px] text-admin-muted font-medium pr-2">
          {isLoading ? "..." : `${filtered.length} records`}
        </span>
      </div>

      {isLoading && (
        <div className="h-64 bg-white rounded-[24px] border border-admin-line animate-pulse flex items-center justify-center">
          <span className="text-admin-muted font-medium">Loading notifications...</span>
        </div>
      )}

      {error && (
        <div className="p-8 text-center text-admin-status-red bg-admin-status-red-bg rounded-[24px] border border-admin-status-red/20 shadow-sm">
          Failed to load notification logs.
        </div>
      )}

      {!isLoading && !error && (
        <div className="bg-white rounded-[20px] shadow-[0_4px_20px_rgb(0,0,0,0.03)] border border-admin-line overflow-hidden">
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left text-[14px] border-collapse whitespace-nowrap">
              <thead>
                <tr className="border-b border-admin-line bg-[#F7F7F7]/50">
                  <th className="py-4 px-4 font-semibold text-[12px] text-admin-muted uppercase tracking-wider pl-6">Job ID</th>
                  <th className="py-4 px-4 font-semibold text-[12px] text-admin-muted uppercase tracking-wider">Customer</th>
                  <th className="py-4 px-4 font-semibold text-[12px] text-admin-muted uppercase tracking-wider">Driver</th>
                  <th className="py-4 px-4 font-semibold text-[12px] text-admin-muted uppercase tracking-wider">Started</th>
                  <th className="py-4 px-4 font-semibold text-[12px] text-admin-muted uppercase tracking-wider">Email Address</th>
                  <th className="py-4 px-4 font-semibold text-[12px] text-admin-muted uppercase tracking-wider">Email</th>
                  <th className="py-4 px-4 font-semibold text-[12px] text-admin-muted uppercase tracking-wider">Phone Number</th>
                  <th className="py-4 px-4 font-semibold text-[12px] text-admin-muted uppercase tracking-wider">SMS</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-admin-line">
                {pageRows.map((row) => {
                  const startedTime = row.actualStart ? formatLondonDateTime(row.actualStart) : "—";
                  const driverInit = row.driverInitials || "UN";
                  const phoneInfo = normalizePhone(row.customerPhone);

                  return (
                    <tr key={row.jobId} className="h-[60px] group transition select-none hover:bg-[#F9FAFB]">
                      <td className="px-6">
                        <span className="font-medium text-admin-ink text-[14px]">{row.jobId}</span>
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
            <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1.5 border border-admin-line rounded-[8px] bg-white hover:bg-admin-surface disabled:opacity-50 transition font-medium text-admin-ink shadow-sm">Previous</button>
            <button disabled={page * pageSize >= filtered.length} onClick={() => setPage(p => p + 1)} className="px-3 py-1.5 border border-admin-line rounded-[8px] bg-white hover:bg-admin-surface disabled:opacity-50 transition font-medium text-admin-ink shadow-sm">Next</button>
          </div>
        </div>
      )}
    </div>
  );
}
