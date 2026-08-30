import React, { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { fetchSession, type DriverProfile } from "./api/auth";
import { LoginScreen } from "./screens/LoginScreen";
import { ForgotPasswordScreen } from "./screens/ForgotPasswordScreen";
import { ResetPasswordScreen } from "./screens/ResetPasswordScreen";
import { JobListScreen } from "./screens/JobListScreen";
import { JobWorkflowScreen } from "./screens/JobWorkflowScreen";
import { AdminApp } from "./screens/admin/AdminApp";

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

  // Admin is a whole separate app (its own login, its own session cookie) -- bail out
  // before ever touching the driver session check below, same reasoning as
  // /reset-password's early return.
  //
  // This same server/bundle answers both chat.themanvan.co.uk (nginx -> this
  // container's driver-app port) and dashboard.themanvan.co.uk (nginx -> this same
  // container, repointed off the old TMV-Chat-bot dashboard). On the dashboard domain
  // the admin app owns every path, not just /admin -- that domain's whole purpose is
  // the dashboard now, so the bare root ("dashboard.themanvan.co.uk/" with no path)
  // should land there too, not silently fall through to the driver login screen as if
  // it were an unrecognised path. localhost keeps the path-gated check instead (dev
  // convenience: lets a local server still switch between driver app and admin by
  // path alone, matching how chat.themanvan.co.uk continues to work everywhere else).
  const path = window.location.pathname;
  const hostname = window.location.hostname;
  const isAdmin =
    hostname === "dashboard.themanvan.co.uk" ||
    (hostname === "localhost" && (path === "/admin" || path === "/admin/"));

  useEffect(() => {
    if (isAdmin) return;
    const resetToken = resetTokenFromUrl();
    if (resetToken) {
      setView({ name: "reset-password", token: resetToken });
      return;
    }
    fetchSession()
      .then(driver => setView(driver ? { name: "jobs", driver } : { name: "login" }))
      .catch(() => setView({ name: "login" }));
  }, []);

  if (isAdmin) {
    return <AdminApp />;
  }

  if (view.name === "checking") {
    // h-screen-safe (dvh, not vh) + safe-area padding: this shell is the one place
    // every screen nests inside, so getting the keyboard/notch handling right here
    // once is what makes every other screen correct for free.
    return (
      <div className="h-screen-safe flex items-center justify-center bg-admin-bg text-admin-ink pt-safe pb-safe pl-safe pr-safe">
        <Loader2 className="w-6 h-6 animate-spin text-admin-muted" />
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
