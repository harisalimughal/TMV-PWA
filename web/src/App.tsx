import React, { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { fetchSession, type DriverProfile } from "./api/auth";
import { LoginScreen } from "./screens/LoginScreen";
import { ForgotPasswordScreen } from "./screens/ForgotPasswordScreen";
import { ResetPasswordScreen } from "./screens/ResetPasswordScreen";
import { JobListScreen } from "./screens/JobListScreen";
import { JobWorkflowScreen } from "./screens/JobWorkflowScreen";

type View =
  | { name: "checking" }
  | { name: "reset-password"; token: string }
  | { name: "login" }
  | { name: "forgot-password" }
  | { name: "jobs"; driver: DriverProfile }
  | { name: "job"; driver: DriverProfile; jobId: string };

/** Only one real "deep link" this app needs to honour outside its own in-app
 * navigation: the password-reset email points at /reset-password?token=... A tiny
 * pathname check up front is simpler and lighter than pulling in a router for a PWA
 * this size -- everything else is plain view-state, matching how little "routing"
 * the original chat-bot workflow ever needed either. */
function resetTokenFromUrl(): string | null {
  if (window.location.pathname !== "/reset-password") return null;
  return new URLSearchParams(window.location.search).get("token");
}

export function App() {
  const [view, setView] = useState<View>({ name: "checking" });

  useEffect(() => {
    const resetToken = resetTokenFromUrl();
    if (resetToken) {
      setView({ name: "reset-password", token: resetToken });
      return;
    }
    fetchSession()
      .then(driver => setView(driver ? { name: "jobs", driver } : { name: "login" }))
      .catch(() => setView({ name: "login" }));
  }, []);

  if (view.name === "checking") {
    // h-screen-safe (dvh, not vh) + safe-area padding: this shell is the one place
    // every screen nests inside, so getting the keyboard/notch handling right here
    // once is what makes every other screen correct for free.
    return (
      <div className="h-screen-safe flex items-center justify-center bg-[#0A1A2F] text-white pt-safe pb-safe pl-safe pr-safe">
        <Loader2 className="w-6 h-6 animate-spin text-white/40" />
      </div>
    );
  }

  if (view.name === "reset-password") {
    return (
      <ResetPasswordScreen
        token={view.token}
        onDone={driver => {
          window.history.replaceState({}, "", "/");
          setView({ name: "jobs", driver });
        }}
      />
    );
  }

  if (view.name === "forgot-password") {
    return <ForgotPasswordScreen onBack={() => setView({ name: "login" })} />;
  }

  if (view.name === "login") {
    return (
      <LoginScreen
        onLoggedIn={driver => setView({ name: "jobs", driver })}
        onForgotPassword={() => setView({ name: "forgot-password" })}
      />
    );
  }

  if (view.name === "job") {
    return <JobWorkflowScreen jobId={view.jobId} onBack={() => setView({ name: "jobs", driver: view.driver })} />;
  }

  return (
    <JobListScreen
      driver={view.driver}
      onLoggedOut={() => setView({ name: "login" })}
      onOpenJob={jobId => setView({ name: "job", driver: view.driver, jobId })}
    />
  );
}
