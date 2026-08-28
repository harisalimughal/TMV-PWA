import React, { useState } from "react";
import { LogOut, Truck } from "lucide-react";
import { logout, type DriverProfile } from "../api/auth";

interface HomeScreenProps {
  driver: DriverProfile;
  onLoggedOut: () => void;
}

export function HomeScreen({ driver, onLoggedOut }: HomeScreenProps) {
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await logout();
    } finally {
      onLoggedOut();
    }
  }

  return (
    <div className="h-screen-safe flex flex-col bg-[#0A1A2F] text-white pt-safe pb-safe pl-safe pr-safe">
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-brand/20 flex items-center justify-center text-xs font-bold text-brand">
            {driver.initials || driver.fullName.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <div className="text-sm font-semibold leading-tight">{driver.fullName}</div>
            <div className="text-xs text-white/40 leading-tight">{driver.email}</div>
          </div>
        </div>
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          className="flex items-center gap-1.5 text-xs text-white/50 hover:text-white/80 disabled:opacity-50 px-2 py-1.5"
        >
          <LogOut className="w-3.5 h-3.5" />
          {loggingOut ? "Signing out…" : "Sign out"}
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-4">
        <div className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center">
          <Truck className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-lg font-bold">You're signed in</h1>
        <p className="text-sm text-white/60 max-w-xs">
          Job list, evidence capture, and the rest of the workflow aren't built yet --
          this confirms your login works end to end.
        </p>
      </div>
    </div>
  );
}
