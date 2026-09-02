import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { deleteDriver, fetchDrivers, saveDriver } from "../api";
import {
  Plus,
  AlertTriangle,
  ShieldCheck,
  Mail,
  Phone,
  Truck,
  Edit3,
  Trash2,
  UserX
} from "lucide-react";
import { DateRangePicker } from "../components/DateRangePicker";
import { getAvatarColor, formatVanReg } from "../utils/drivers";
import { AddDriverModal } from "../components/AddDriverModal";
import { DriverSummaryItem } from "../types";
import { Button } from "../../../../ui";

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
  // hasAccount is false for a code that only shows up because some job's
  // driverInitials matches it -- e.g. typed straight into a Calendar title -- with
  // nobody ever added via Add Driver. Those jobs stay assigned exactly as they are;
  // this only keeps a driver-less initials code from cluttering the roster with a
  // card that has no account behind it to edit, deactivate or delete. If a real
  // driver is later added with the same initials, this same job then folds into
  // their real card automatically (drivers-summary.routes.ts groups by initials).
  const roster = allDrivers.filter(d => d.initials !== "UNASSIGNED" && d.hasAccount);

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

  const handleDelete = async (driver: DriverSummaryItem) => {
    if (!driver.email) return;
    if (
      !window.confirm(
        `Permanently delete ${driver.fullName}? This cannot be undone -- unlike Deactivate, there is no way to restore this driver afterwards. Their past jobs keep the "${driver.initials}" initials but will no longer show a name, email or phone.`
      )
    ) {
      return;
    }
    try {
      await deleteDriver(driver.email);
      queryClient.invalidateQueries({ queryKey: ["drivers_summary"] });
    } catch (err: any) {
      window.alert(err?.message || "Failed to delete driver.");
    }
  };

  return (
    <div className="space-y-6 max-w-[1440px] mx-auto pb-12">
      <div className="flex items-center justify-between px-2">
        <div>
          <h2 className="text-title text-fg">Drivers</h2>
        </div>
        <Button onClick={() => setIsAddModalOpen(true)} iconLeft={<Plus />}>
          Add driver
        </Button>
      </div>

      {/* TOOLBAR */}
      <div className="p-2 bg-white rounded-module shadow-sm border border-transparent flex flex-wrap items-center gap-4">
        <DateRangePicker from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />

        <div className="w-[1px] h-6 bg-admin-line ml-2 mr-2" />

        <span className="text-[13px] text-admin-muted font-medium">
          {isLoading ? "..." : `${roster.filter(d => d.active).length} active drivers`}
        </span>
      </div>

      {/* DRIVER CARDS GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 items-stretch">
        {!isLoading && roster.map((driver) => (
          <div
            key={driver.initials}
            className="bg-white rounded-module shadow-[0_4px_20px_rgb(0,0,0,0.03)] border border-admin-line p-6 flex flex-col justify-between hover:-translate-y-0.5 hover:shadow-md transition-all cursor-pointer relative group"
          >
            {/* Header Row */}
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="flex min-w-0 items-center gap-3">
                <div className={`w-10 h-10 shrink-0 rounded-full flex items-center justify-center font-bold text-[14px] ${getAvatarColor(driver.initials)}`}>
                  {driver.initials}
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-admin-ink text-[16px] flex items-center gap-1.5 leading-tight">
                    <span className="truncate">{driver.fullName}</span>
                    {driver.active && (
                      <span title="Verified Active" className="cursor-help shrink-0">
                        <ShieldCheck className="w-4 h-4 text-[#10b981]" />
                      </span>
                    )}
                  </h3>
                </div>
              </div>

              <div className="flex shrink-0 flex-col items-end gap-2">
                <span className={`px-2 py-0.5 rounded-control text-[11px] font-bold uppercase tracking-wider ${
                  driver.active ? "bg-admin-status-green-bg text-admin-status-green" : "bg-admin-surface text-admin-muted"
                }`}>
                  {driver.active ? "Active" : "Inactive"}
                </span>

                {/* Overflow menu triggers. Hover-reveal only from md up -- below that
                    (this card grid's single-column mobile layout) touch has no real
                    hover, so a tap would just trigger the hover state instead of the
                    button underneath it; always visible there instead. */}
                <div className="flex items-center gap-1 opacity-100 transition md:opacity-0 md:group-hover:opacity-100">
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
                    <UserX className="w-4 h-4" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(driver); }}
                    title="Delete Driver Permanently"
                    className="p-1 rounded-full text-admin-muted hover:bg-admin-status-red hover:text-white transition"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Contact / Van Reg Line */}
            <div className="flex flex-col gap-2 mb-6 text-[13px] text-admin-muted">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                <span className="flex min-w-0 items-center gap-1.5"><Mail className="w-3.5 h-3.5 shrink-0" /> <span className="truncate">{driver.email || "—"}</span></span>
                <span className="flex min-w-0 items-center gap-1.5"><Phone className="w-3.5 h-3.5 shrink-0" /> <span className="truncate">{driver.phone || "—"}</span></span>
              </div>
              {driver.vanRegistration && (
                <div className="flex items-center gap-1.5 mt-1">
                  <Truck className="w-4 h-4 text-admin-ink-2" />
                  <span className="px-2 py-1 rounded-control border border-admin-line bg-admin-surface font-mono font-bold text-admin-ink tracking-widest text-[12px] shadow-sm uppercase">
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
              <div className={`mt-5 p-2.5 rounded-control flex items-center gap-2 text-[12px] font-semibold border ${
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
