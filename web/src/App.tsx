import React, { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { fetchSession, type DriverProfile } from "./api/auth";
import { LoginScreen } from "./screens/LoginScreen";
import { HomeScreen } from "./screens/HomeScreen";

type SessionState =
  | { status: "checking" }
  | { status: "signed-out" }
  | { status: "signed-in"; driver: DriverProfile };

export function App() {
  const [session, setSession] = useState<SessionState>({ status: "checking" });

  useEffect(() => {
    fetchSession()
      .then(driver => setSession(driver ? { status: "signed-in", driver } : { status: "signed-out" }))
      .catch(() => setSession({ status: "signed-out" }));
  }, []);

  if (session.status === "checking") {
    // h-screen-safe (dvh, not vh) + safe-area padding: this shell is the one place every
    // screen in the app nests inside, so getting the keyboard/notch handling right here
    // once is what makes every other screen correct for free.
    return (
      <div className="h-screen-safe flex items-center justify-center bg-[#0A1A2F] text-white pt-safe pb-safe pl-safe pr-safe">
        <Loader2 className="w-6 h-6 animate-spin text-white/40" />
      </div>
    );
  }

  if (session.status === "signed-in") {
    return (
      <HomeScreen driver={session.driver} onLoggedOut={() => setSession({ status: "signed-out" })} />
    );
  }

  return (
    <LoginScreen onLoggedIn={driver => setSession({ status: "signed-in", driver })} />
  );
}
