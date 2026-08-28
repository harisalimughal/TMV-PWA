import React, { useEffect, useState } from "react";
import { Truck, Wifi, WifiOff } from "lucide-react";

type BackendStatus = "checking" | "ok" | "down";

export function App() {
  const [status, setStatus] = useState<BackendStatus>("checking");

  useEffect(() => {
    fetch("/healthz")
      .then(res => (res.ok ? setStatus("ok") : setStatus("down")))
      .catch(() => setStatus("down"));
  }, []);

  return (
    // h-screen-safe (dvh, not vh) + safe-area padding: this shell is the one place every
    // screen in the app will nest inside, so getting the keyboard/notch handling right
    // here once is what makes every other screen correct for free.
    <div className="h-screen-safe flex flex-col bg-[#0A1A2F] text-white pt-safe pb-safe pl-safe pr-safe">
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-4">
        <div className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center">
          <Truck className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-xl font-bold">TMV Driver</h1>
        <p className="text-sm text-white/60 max-w-xs">
          Scaffold running. Chat interface, camera capture, and login are not built yet --
          this screen exists to prove the PWA shell (safe areas, keyboard-safe layout,
          installability) and the backend connection both work.
        </p>

        <div className="mt-4 flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 text-xs font-medium">
          {status === "checking" && <span className="text-white/50">Checking backend…</span>}
          {status === "ok" && (
            <>
              <Wifi className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-emerald-400">Backend connected</span>
            </>
          )}
          {status === "down" && (
            <>
              <WifiOff className="w-3.5 h-3.5 text-red-400" />
              <span className="text-red-400">Backend unreachable</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
