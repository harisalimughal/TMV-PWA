import React, { useEffect, useState } from "react";
import { AlertCircle, ChevronRight, Loader2, Plus } from "lucide-react";
import { fetchDrivers, type AdminDriver } from "../../api/admin";
import { DriverFormModal } from "./DriverFormModal";

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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white/70">{drivers.length} driver{drivers.length === 1 ? "" : "s"}</h2>
        <button
          onClick={() => setEditing("new")}
          className="flex items-center gap-1.5 text-xs font-semibold text-brand hover:text-brand-dark bg-brand/10 hover:bg-brand/15 rounded-lg px-3 py-2 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Add driver
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="w-6 h-6 animate-spin text-white/40" />
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-3">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      ) : drivers.length === 0 ? (
        <div className="rounded-xl bg-white/5 border border-white/10 px-4 py-6 text-center text-sm text-white/50">
          No drivers yet. Add one to get started.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {drivers.map(driver => (
            <button
              key={driver.email}
              onClick={() => setEditing(driver)}
              className="w-full text-left rounded-xl border border-white/10 bg-white/5 hover:border-white/20 px-4 py-3.5 flex items-center gap-3 transition-colors"
            >
              <div className="w-9 h-9 rounded-full bg-brand/20 flex items-center justify-center text-xs font-bold text-brand shrink-0">
                {driver.initials || driver.fullName.slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-semibold truncate">{driver.fullName}</span>
                  {!driver.active && (
                    <span className="text-[10px] font-bold uppercase tracking-wide text-white/50 bg-white/10 px-1.5 py-0.5 rounded shrink-0">
                      Inactive
                    </span>
                  )}
                  {!driver.hasPassword && (
                    <span className="text-[10px] font-bold uppercase tracking-wide text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded shrink-0">
                      No password
                    </span>
                  )}
                </div>
                <div className="text-xs text-white/40 truncate">
                  {driver.email} · {driver.phone || "no phone"} · {driver.vanRegistration || "no van"}
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-white/30 shrink-0" />
            </button>
          ))}
        </div>
      )}

      {editing && (
        <DriverFormModal
          driver={editing === "new" ? null : editing}
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
