import React, { useEffect, useState } from "react";
import { Loader2, LogOut } from "lucide-react";
import { adminLogout, fetchAdminSession } from "../../api/admin";
import { AdminLoginScreen } from "./AdminLoginScreen";
import { DriversTab } from "./DriversTab";
import { SettingsTab } from "./SettingsTab";

type Tab = "drivers" | "settings";

/**
 * Entry point for the /admin path (see App.tsx's pathname check). Fully independent of
 * the driver login flow -- its own session cookie (tmv_admin_session), its own
 * password, mounted at /api/admin. Replaces TMV-Chat-bot's old Sheets-backed Add/Edit
 * Driver + Settings tab admin surface, which this app no longer depends on.
 */
export function AdminApp() {
  const [checking, setChecking] = useState(true);
  const [loggedIn, setLoggedIn] = useState(false);
  const [tab, setTab] = useState<Tab>("drivers");
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    fetchAdminSession()
      .then(setLoggedIn)
      .finally(() => setChecking(false));
  }, []);

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await adminLogout();
    } finally {
      setLoggedIn(false);
      setLoggingOut(false);
    }
  }

  if (checking) {
    return (
      <div className="h-screen-safe flex items-center justify-center bg-[#0A1A2F] text-white pt-safe pb-safe pl-safe pr-safe">
        <Loader2 className="w-6 h-6 animate-spin text-white/40" />
      </div>
    );
  }

  if (!loggedIn) {
    return <AdminLoginScreen onLoggedIn={() => setLoggedIn(true)} />;
  }

  return (
    <div className="h-screen-safe flex flex-col bg-[#0A1A2F] text-white pt-safe pb-safe pl-safe pr-safe">
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 shrink-0">
        <h1 className="text-sm font-semibold">Admin</h1>
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          className="flex items-center gap-1.5 text-xs text-white/50 hover:text-white/80 disabled:opacity-50 px-2 py-1.5 shrink-0"
        >
          <LogOut className="w-3.5 h-3.5" />
          {loggingOut ? "Signing out…" : "Sign out"}
        </button>
      </div>

      <div className="flex gap-1 px-4 pt-4 shrink-0">
        <TabButton label="Drivers" active={tab === "drivers"} onClick={() => setTab("drivers")} />
        <TabButton label="Settings" active={tab === "settings"} onClick={() => setTab("settings")} />
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-5 max-w-2xl w-full mx-auto">
        {tab === "drivers" ? <DriversTab /> : <SettingsTab />}
      </div>
    </div>
  );
}

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
        active ? "bg-brand/15 text-brand" : "text-white/50 hover:text-white/80"
      }`}
    >
      {label}
    </button>
  );
}
