import React, { useEffect, useState } from "react";
import { AlertTriangle, Edit3, Loader2, Mail, Phone, Plus, ShieldCheck, Truck } from "lucide-react";
import { fetchDrivers, saveDriver, type AdminDriver } from "../../api/admin";
import { DriverFormModal } from "./DriverFormModal";

/** Same palette-cycling approach as TMV-Chat-bot's dashboard utils/drivers.ts's
 * getAvatarColor -- deterministic per initials, not random per render. */
const AVATAR_COLORS = [
  "bg-blue-100 text-blue-700",
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-700",
  "bg-violet-100 text-violet-700",
  "bg-pink-100 text-pink-700",
  "bg-cyan-100 text-cyan-700"
];
function avatarColor(initials: string): string {
  let hash = 0;
  for (const ch of initials) hash = (hash * 31 + ch.charCodeAt(0)) % AVATAR_COLORS.length;
  return AVATAR_COLORS[Math.abs(hash)];
}

/**
 * Ported from TMV-Chat-bot's dashboard/web/src/pages/DriversPage.tsx -- same card
 * grid, same visual language. The per-driver job-performance stats there (completed
 * jobs, revenue, avg delay, missing evidence) came from a job-aggregation endpoint
 * this admin surface doesn't have -- tmv-pwa's own job data isn't wired into a
 * /drivers/summary equivalent, so this stays a roster view (contact info, van reg,
 * active status) rather than a performance dashboard.
 */
export function DriversTab() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drivers, setDrivers] = useState<AdminDriver[]>([]);
  const [editing, setEditing] = useState<AdminDriver | null | "new">(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setDrivers(await fetchDrivers());
    } catch (err: any) {
      setError(err?.message || "Couldn't load drivers.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleDeactivate(driver: AdminDriver) {
    if (!window.confirm(`Are you sure you want to deactivate ${driver.fullName}? They will be blocked from the app.`)) return;
    await saveDriver({
      initials: driver.initials,
      fullName: driver.fullName,
      email: driver.email,
      phone: driver.phone,
      vanRegistration: driver.vanRegistration,
      role: driver.role,
      active: false
    });
    load();
  }

  return (
    <div className="space-y-6 max-w-[1440px] mx-auto pb-12">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[20px] font-bold text-admin-ink">Drivers</h2>
          <p className="text-[13px] text-admin-muted mt-0.5">
            {loading ? "..." : `${drivers.filter(d => d.active).length} active driver${drivers.filter(d => d.active).length === 1 ? "" : "s"}`}
          </p>
        </div>
        <button
          onClick={() => setEditing("new")}
          className="flex items-center gap-2 px-5 py-2.5 bg-admin-brand text-white rounded-full font-semibold shadow-sm hover:bg-admin-brand-dark transition"
        >
          <Plus className="w-4 h-4" /> Add Driver
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-admin-muted" />
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 text-[13px] text-admin-status-red bg-admin-status-red-bg border border-[#FECACA] rounded-xl px-4 py-3">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      ) : drivers.length === 0 ? (
        <div className="bg-white rounded-[20px] border border-admin-line px-6 py-10 text-center text-[14px] text-admin-muted">
          No drivers yet. Add one to get started.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 items-stretch">
          {drivers.map(driver => (
            <div
              key={driver.email}
              className="bg-white rounded-[20px] shadow-[0_4px_20px_rgb(0,0,0,0.03)] border border-admin-line p-6 flex flex-col justify-between hover:-translate-y-0.5 hover:shadow-md transition-all relative group"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-[14px] ${avatarColor(driver.initials)}`}>
                    {driver.initials || "?"}
                  </div>
                  <div>
                    <h3 className="font-bold text-admin-ink text-[16px] flex items-center gap-1.5 leading-tight">
                      {driver.fullName}
                      {driver.active && (
                        <span title="Active" className="cursor-help">
                          <ShieldCheck className="w-4 h-4 text-admin-status-green" />
                        </span>
                      )}
                    </h3>
                  </div>
                </div>

                <div className="flex flex-col items-end gap-2">
                  <span
                    className={`px-2 py-0.5 rounded-[4px] text-[11px] font-bold uppercase tracking-wider ${
                      driver.active ? "bg-admin-status-green-bg text-admin-status-green" : "bg-admin-surface text-admin-muted"
                    }`}
                  >
                    {driver.active ? "Active" : "Inactive"}
                  </span>
                  {!driver.hasPassword && (
                    <span className="px-2 py-0.5 rounded-[4px] text-[11px] font-bold uppercase tracking-wider bg-admin-status-amber-bg text-admin-status-amber">
                      No password
                    </span>
                  )}

                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                    <button
                      onClick={() => setEditing(driver)}
                      title="Edit Driver"
                      className="p-1 rounded-full text-admin-muted hover:bg-admin-brand hover:text-white transition"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    {driver.active && (
                      <button
                        onClick={() => handleDeactivate(driver)}
                        title="Deactivate Driver"
                        className="p-1 rounded-full text-admin-muted hover:bg-admin-status-red hover:text-white transition"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2 text-[13px] text-admin-muted">
                <div className="flex items-center gap-4">
                  <span className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" /> {driver.email || "—"}</span>
                  <span className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" /> {driver.phone || "—"}</span>
                </div>
                {driver.vanRegistration && (
                  <div className="flex items-center gap-1.5 mt-1">
                    <Truck className="w-4 h-4 text-admin-ink-2" />
                    <span className="px-2 py-1 rounded-[4px] border border-admin-line bg-admin-surface font-mono font-bold text-admin-ink tracking-widest text-[12px] shadow-sm uppercase">
                      {driver.vanRegistration}
                    </span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <DriverFormModal
          driver={editing === "new" ? null : editing}
          existingDrivers={drivers}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </div>
  );
}
