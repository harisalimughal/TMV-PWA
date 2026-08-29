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
 * password, mounted at /api/admin. Visually matches TMV-Chat-bot's dashboard (same
 * admin-* color tokens, same header treatment as Layout.tsx's collapsed brand icon)
 * so this and the eventual replacement of that dashboard look like one product, even
 * though this one only covers Drivers + Settings and runs entirely off tmv-pwa's own
 * Mongo backend -- no Sheets dependency, unlike the dashboard it visually matches.
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
      <div className="min-h-screen flex items-center justify-center bg-admin-bg">
        <Loader2 className="w-6 h-6 animate-spin text-admin-muted" />
      </div>
    );
  }

  if (!loggedIn) {
    return <AdminLoginScreen onLoggedIn={() => setLoggedIn(true)} />;
  }

  return (
    <div className="min-h-screen bg-admin-bg font-sans">
      <div className="bg-white border-b border-admin-line">
        <div className="max-w-[1440px] mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src="/tmv-logo.png"
              alt="TMV"
              className="w-8 h-8 rounded-lg object-contain bg-admin-surface border border-admin-line p-0.5"
              title="The Man Van Operations"
            />
            <h1 className="text-[15px] font-bold text-admin-ink">Operations</h1>
          </div>
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="flex items-center gap-1.5 text-[13px] font-medium text-admin-muted hover:text-admin-ink disabled:opacity-50 px-2 py-1.5 transition"
          >
            <LogOut className="w-3.5 h-3.5" />
            {loggingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>

        <div className="max-w-[1440px] mx-auto px-6 flex items-center gap-6">
          <TabButton label="Drivers" active={tab === "drivers"} onClick={() => setTab("drivers")} />
          <TabButton label="Settings" active={tab === "settings"} onClick={() => setTab("settings")} />
        </div>
      </div>

      <div className="max-w-[1440px] mx-auto px-6 py-6">{tab === "drivers" ? <DriversTab /> : <SettingsTab />}</div>
    </div>
  );
}

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`py-3 text-[14px] font-semibold border-b-2 transition ${
        active ? "text-admin-brand border-admin-brand" : "text-admin-muted border-transparent hover:text-admin-ink"
      }`}
    >
      {label}
    </button>
  );
}
