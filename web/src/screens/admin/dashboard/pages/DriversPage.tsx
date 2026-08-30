import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchDrivers, saveDriver } from "../api";
import {
  Plus,
  AlertTriangle,
  Inbox,
  ShieldCheck,
  Mail,
  Phone,
  Truck,
  Edit3
} from "lucide-react";
import { DateRangePicker } from "../components/DateRangePicker";
import { getAvatarColor, formatVanReg } from "../utils/drivers";
import { AddDriverModal } from "../components/AddDriverModal";
import { DriverSummaryItem } from "../types";

export function DriversPage() {
  const queryClient = useQueryClient();
  const [from, setFrom] = useState<string | undefined>();
  const [to, setTo] = useState<string | undefined>();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingDriver, setEditingDriver] = useState<DriverSummaryItem | null>(null);

  // Real roster + real per-driver stats (assigned/completed/revenue/missing evidence,
  // avg delay/duration) -- all computed server-side against actual job data, not the
  // old localStorage-backed roster + a re-aggregation of fetchJobs() here.
  const { data, isLoading } = useQuery({
    queryKey: ["drivers_summary", from, to],
    queryFn: () => fetchDrivers(from, to),
    staleTime: 30000
  });

  const allDrivers = data?.drivers ?? [];
  // The real /drivers/summary endpoint already buckets jobs with no driver assigned
  // under a synthetic "UNASSIGNED" entry -- no need to recompute that client-side.
  const unassigned = allDrivers.find(d => d.initials === "UNASSIGNED");
  const roster = allDrivers.filter(d => d.initials !== "UNASSIGNED");

  const handleDeactivate = async (driver: DriverSummaryItem) => {
    if (!driver.email) return;
    if (!window.confirm(`Are you sure you want to deactivate ${driver.fullName}? They will be blocked from the app.`)) return;
    await saveDriver({
      initials: driver.initials,
      fullName: driver.fullName,
      email: driver.email,
      phone: driver.phone,
      vanRegistration: driver.vanRegistration,
      active: false
    });
    queryClient.invalidateQueries({ queryKey: ["drivers_summary"] });
  };

  return (
    <div className="space-y-6 max-w-[1440px] mx-auto pb-12">
      <div className="flex items-center justify-between px-2">
        <div>
          <h2 className="text-[20px] font-bold text-admin-ink">Drivers</h2>
        </div>
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="flex items-center gap-2 px-5 py-2.5 bg-[#2563EB] text-white rounded-full font-semibold shadow-sm hover:bg-blue-700 transition"
        >
          <Plus className="w-4 h-4" /> Add Driver
        </button>
      </div>

      {/* TOOLBAR */}
      <div className="p-2 bg-white rounded-[16px] shadow-sm border border-transparent flex flex-wrap items-center gap-4">
        <DateRangePicker from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />

        <div className="w-[1px] h-6 bg-admin-line ml-2 mr-2" />

        <span className="text-[13px] text-admin-muted font-medium">
          {isLoading ? "..." : `${roster.filter(d => d.active).length} active drivers`}
        </span>
      </div>

      {/* UNASSIGNED QUEUE (Isolated Top Tile) */}
      {unassigned && unassigned.assigned > 0 && (
        <div className="bg-[#FFFBEB] border border-amber-200 rounded-[16px] p-5 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 border border-amber-200 border-dashed">
              <Inbox className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-[16px] font-bold text-amber-900">Unassigned Jobs Queue</h3>
              <p className="text-[13px] text-amber-700/80 mt-0.5">These jobs have no driver assigned yet.</p>
            </div>
          </div>
          <div className="flex gap-8">
            <div className="text-center">
              <span className="block text-[24px] font-bold font-mono text-amber-600">{unassigned.assigned}</span>
              <span className="block text-[11px] font-semibold uppercase text-amber-600/70 tracking-wider">Jobs Pending</span>
            </div>
            <div className="text-center">
              <span className="block text-[24px] font-bold font-mono text-amber-600">£{(unassigned.revenuePounds || 0).toFixed(0)}</span>
              <span className="block text-[11px] font-semibold uppercase text-amber-600/70 tracking-wider">Potential Rev</span>
            </div>
          </div>
        </div>
      )}

      {/* DRIVER CARDS GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 items-stretch">
        {!isLoading && roster.map((driver) => (
          <div
            key={driver.initials}
            className="bg-white rounded-[20px] shadow-[0_4px_20px_rgb(0,0,0,0.03)] border border-admin-line p-6 flex flex-col justify-between hover:-translate-y-0.5 hover:shadow-md transition-all cursor-pointer relative group"
          >
            {/* Header Row */}
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-[14px] ${getAvatarColor(driver.initials)}`}>
                  {driver.initials}
                </div>
                <div>
                  <h3 className="font-bold text-admin-ink text-[16px] flex items-center gap-1.5 leading-tight">
                    {driver.fullName}
                    {driver.active && (
                      <span title="Verified Active" className="cursor-help">
                        <ShieldCheck className="w-4 h-4 text-[#10b981]" />
                      </span>
                    )}
                  </h3>
                </div>
              </div>

              <div className="flex flex-col items-end gap-2">
                <span className={`px-2 py-0.5 rounded-[4px] text-[11px] font-bold uppercase tracking-wider ${
                  driver.active ? "bg-admin-status-green-bg text-admin-status-green" : "bg-admin-surface text-admin-muted"
                }`}>
                  {driver.active ? "Active" : "Inactive"}
                </span>

                {/* Overflow menu triggers */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                  <button
                    onClick={(e) => { e.stopPropagation(); setEditingDriver(driver); }}
                    title="Edit Driver"
                    className="p-1 rounded-full text-admin-muted hover:bg-admin-brand hover:text-white transition"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeactivate(driver); }}
                    title="Deactivate Driver"
                    className="p-1 rounded-full text-admin-muted hover:bg-admin-status-red hover:text-white transition"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
                  </button>
                </div>
              </div>
            </div>

            {/* Contact / Van Reg Line */}
            <div className="flex flex-col gap-2 mb-6 text-[13px] text-admin-muted">
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" /> {driver.email || "—"}</span>
                <span className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" /> {driver.phone || "—"}</span>
              </div>
              {driver.vanRegistration && (
                <div className="flex items-center gap-1.5 mt-1">
                  <Truck className="w-4 h-4 text-admin-ink-2" />
                  <span className="px-2 py-1 rounded-[4px] border border-admin-line bg-admin-surface font-mono font-bold text-admin-ink tracking-widest text-[12px] shadow-sm uppercase">
                    {formatVanReg(driver.vanRegistration)}
                  </span>
                </div>
              )}
            </div>

            {/* Stats Grid 2x2 */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-5">
              <div>
                <span className="text-admin-muted block text-[12px] mb-1">Completed Jobs</span>
                <div className="flex items-baseline gap-2">
                  <span className="font-bold text-admin-ink text-[18px] tabular-nums leading-none">
                    {driver.completed} / {driver.assigned}
                  </span>
                </div>
                <span className="text-[11px] text-admin-status-green font-semibold mt-1.5 block tracking-wide">
                  {driver.completionRate}% COMPLETION
                </span>
              </div>

              <div>
                <span className="text-admin-muted block text-[12px] mb-1">Revenue Handled</span>
                <span className="font-bold text-admin-ink text-[18px] tabular-nums leading-none block">
                  {driver.revenueFormatted}
                </span>
                <span className="text-[11px] text-admin-muted font-medium mt-1.5 block tracking-wide">
                  £{driver.cashCollectedPounds.toFixed(2)} CASH
                </span>
              </div>

              <div>
                <span className="text-admin-muted block text-[12px] mb-1">Avg Start Delay</span>
                <span className={`font-bold text-[16px] tabular-nums leading-none block ${driver.avgDelayMinutes > 15 ? 'text-admin-status-red' : 'text-admin-status-green'}`}>
                  +{driver.avgDelayMinutes} mins
                </span>
              </div>

              <div>
                <span className="text-admin-muted block text-[12px] mb-1">Avg Move Time</span>
                <span className="font-bold text-admin-ink text-[16px] tabular-nums leading-none block">
                  {driver.avgDurationMinutes} mins
                </span>
              </div>
            </div>

            {/* Evidence Banner */}
            {driver.missingEvidenceCount > 0 && (
              <div className={`mt-5 p-2.5 rounded-[8px] flex items-center gap-2 text-[12px] font-semibold border ${
                driver.missingEvidenceCount >= 10
                  ? "bg-[#FEF2F2] text-admin-status-red border-[#FECACA]"
                  : "bg-[#FFFBEB] text-amber-700 border-[#FDE68A]"
              }`}>
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{driver.missingEvidenceCount} missing/failed evidence uploads</span>
              </div>
            )}
          </div>
        ))}
      </div>

      <AddDriverModal
        isOpen={isAddModalOpen || !!editingDriver}
        onClose={() => { setIsAddModalOpen(false); setEditingDriver(null); }}
        driverToEdit={editingDriver}
      />
    </div>
  );
}
