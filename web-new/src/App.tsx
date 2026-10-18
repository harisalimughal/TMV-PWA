import React, { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { fetchSession, type DriverProfile } from "./api/auth";
import { LoginScreen } from "./screens/LoginScreen";
import { ForgotPasswordScreen } from "./screens/ForgotPasswordScreen";
import { ResetPasswordScreen } from "./screens/ResetPasswordScreen";
import { JobListScreen } from "./screens/JobListScreen";
import { PendingSubmissionsScreen } from "./screens/PendingSubmissionsScreen";
import { JobActivityScreen } from "./screens/JobActivityScreen";
import { MessagesScreen } from "./screens/MessagesScreen";
import { JobWorkflowScreen } from "./screens/JobWorkflowScreen";
import { LiabilityScreen, type LiabilityCheckpoint } from "./screens/LiabilityScreen";
import { AccountSettingsScreen } from "./screens/AccountSettingsScreen";
import { VanScreen } from "./screens/VanScreen";
import { logout } from "./api/auth";
import { setUnauthorizedHandler } from "./lib/http";
import { startOutboxSync } from "./lib/outbox";
import { AppLayout, type TabId } from "./app/AppLayout";
import { DevicePreview } from "./app/DevicePreview";
import { UpdateBanner } from "./app/UpdateBanner";
import { PwaInstallPrompt } from "./app/PwaInstallPrompt";
import { ConfirmDialog } from "./ui";
import { isAdminLocation, shouldRedirectAdminPath } from "./lib/adminHost";
import { useConfirm } from "./ui/ConfirmProvider";
import { hasUnsavedWork } from "./screens/workflow/stepRules";
import { useToast } from "./components/ui/Toast";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { InAppNotificationListener } from "./components/InAppNotificationListener";
import { usePushNotifications } from "./lib/pwa/usePushNotifications";

/**
 * The admin dashboard is loaded on demand.
 *
 * It used to be a static import, which meant Leaflet, Recharts, Luxon and all 14
 * dashboard pages were in the same chunk as the driver app: 1,150kB of JavaScript
 * parsed on a driver's phone to render a list of jobs, and precached by the service
 * worker on top of that. Splitting it here takes the driver bundle to ~235kB. The
 * dashboard itself is unaffected -- it loads its own chunk once, on a desktop
 * connection.
 */
function lazyAdmin(load: () => Promise<{ default: React.ComponentType }>) {
  return React.lazy(() =>
    load().catch((error: any) => {
      const isChunkError =
        error?.message?.includes("Failed to fetch dynamically imported module") ||
        error?.message?.includes("Importing a module script failed") ||
        error?.message?.includes("Expected a JavaScript-or-Wasm module script") ||
        error?.name === "ChunkLoadError";

      if (isChunkError && !sessionStorage.getItem("tmv:admin_chunk_reloaded")) {
        sessionStorage.setItem("tmv:admin_chunk_reloaded", "1");
        if (typeof caches !== "undefined") {
          caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k)))).finally(() => {
            window.location.reload();
          });
        } else {
          window.location.reload();
        }
        return new Promise<{ default: () => React.JSX.Element }>(() => {});
      }
      sessionStorage.removeItem("tmv:admin_chunk_reloaded");
      throw error;
    })
  );
}

/** Aurora admin: `/admin` on localhost, every other path on admin hosts. */
const AdminApp = lazyAdmin(() => import("./screens/admin/AdminApp").then(m => ({ default: m.AdminApp })));

type View =
  | { name: "checking" }
  | { name: "reset-password"; token: string }
  | { name: "login" }
  | { name: "forgot-password" }
  // ---- tab destinations (chrome: sidebar on desktop, bottom nav on mobile) ----
  | { name: "jobs"; driver: DriverProfile }
  | { name: "pending-submissions"; driver: DriverProfile }
  | { name: "liability"; driver: DriverProfile; checkpoint?: LiabilityCheckpoint; jobId?: string }
  | { name: "van"; driver: DriverProfile }
  | { name: "messages"; driver: DriverProfile }
  | { name: "settings"; driver: DriverProfile }
  // ---- drill-in flows (own the whole screen, no tab chrome) -------------------
  | { name: "job"; driver: DriverProfile; jobId: string; returnTo?: "jobs" | "pending-submissions" }
  | { name: "job-activity"; driver: DriverProfile; jobId: string; returnTo?: "jobs" | "messages" };

const TAB_FOR_VIEW: Record<string, TabId> = {
  jobs: "jobs",
  job: "jobs",
  "pending-submissions": "jobs",
  messages: "jobs",
  "job-activity": "jobs",
  liability: "liability",
  van: "van",
  settings: "profile"
};

/** The only real deep link this app honours outside its own navigation: the
 *  password-reset email points at /reset-password?token=... A pathname check is
 *  lighter than a router for a PWA this size. */
function resetTokenFromUrl(): string | null {
  if (window.location.pathname !== "/reset-password") return null;
  return new URLSearchParams(window.location.search).get("token");
}

/**
 * /admin only means anything on the dashboard domain (see isAdmin in App() below) or
 * on localhost for local dev -- see the comment there. Anywhere else, chiefly
 * chat.themanvan.co.uk, it used to silently fall through to the ordinary driver app
 * rendered under a misleading /admin URL, with no admin functionality behind it at
 * all. Redirected to "/" before React ever mounts, so nothing renders under that path.
 * The retired classic admin URL /temp is redirected to "/" on every host.
 */
(() => {
  try {
    if (typeof window === "undefined") return;
    const { hostname, pathname } = window.location;
    if (shouldRedirectAdminPath(hostname, pathname)) {
      window.location.replace("/");
    }
  } catch {
    /* no-op */
  }
})();

/**
 * A tapped "message from the office" notification opens `/?tab=activity&job=<id>`. Captured once at
 * module load, like SHORTCUT_TAB below, so it survives the session check and a StrictMode double mount.
 */
const ACTIVITY_JOB: string | null = (() => {
  try {
    if (typeof window === "undefined" || window.location.pathname !== "/") return null;
    const params = new URLSearchParams(window.location.search);
    return params.get("tab") === "activity" ? params.get("job") : null;
  } catch {
    return null;
  }
})();

/**
 * Manifest app-shortcut landing (?tab=jobs|storage|profile). Captured once at module
 * load — before React mounts — and the param is stripped immediately, so a
 * StrictMode double-mount can't lose it mid-session-check.
 */
const SHORTCUT_TAB: string | null = (() => {
  try {
    if (typeof window === "undefined") return null;
    const tab = new URLSearchParams(window.location.search).get("tab");
    if (tab && window.location.pathname === "/") {
      window.history.replaceState({}, "", "/");
    }
    return tab;
  } catch {
    return null;
  }
})();

function FullScreenSpinner({ label }: { label: string }) {
  return (
    <div
      className="h-screen-safe flex flex-col items-center justify-center gap-3 bg-bg text-fg pt-safe pb-safe"
      role="status"
      aria-live="polite"
    >
      <Loader2 className="size-6 animate-spin text-fg-subtle" aria-hidden />
      <span className="text-[14px] text-fg-muted">{label}</span>
    </div>
  );
}

export function App() {
  const confirm = useConfirm();
  const [view, setView] = useState<View>({ name: "checking" });
  /** Set when the driver was bounced out mid-session, so LoginScreen can explain why
   *  rather than just appearing without warning. */
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const toast = useToast();

  // Admin is a separate app with its own login and session cookie, so it bails out
  // before the driver session check ever runs.
  //
  // The same bundle answers both chat.themanvan.co.uk (driver app) and
  // dashboard.themanvan.co.uk (the dashboard, repointed off the retired project). On
  // the dashboard domain the admin app owns every path including the bare root --
  // that domain's whole purpose is the dashboard. localhost keeps the path-gated check
  // so a local server can still switch between the two by path alone.
  const path = window.location.pathname;
  const hostname = window.location.hostname;
  // Admin hostnames: dashboard.themanvan.co.uk plus any VITE_ADMIN_HOSTNAMES given at
  // build time (staging/preview hosts). See lib/adminHost.ts.
  const isAdmin = isAdminLocation(hostname, path);


  /** Called by lib/http whenever any authenticated request comes back 401. */
  const handleUnauthorized = useCallback(() => {
    setAuthNotice("Your session expired. Sign in again to carry on.");
    setView({ name: "login" });
  }, []);

  const handleLogout = useCallback(async () => {
    setConfirmLogout(false);
    await logout();
    toast.info("Signed out");
    setView({ name: "login" });
  }, [toast]);

  useEffect(() => {
    if (isAdmin) return;
    setUnauthorizedHandler(handleUnauthorized);
    return () => setUnauthorizedHandler(null);
  }, [isAdmin, handleUnauthorized]);

  // Retries anything sitting in the offline outbox, on startup and on reconnect.
  useEffect(() => {
    if (isAdmin) return;
    return startOutboxSync();
  }, [isAdmin]);

  // Prompts for push notifications automatically on login, instead of requiring the
  // driver to find Settings > PWA Settings > Enable Push themselves. The browser's own
  // "Allow notifications?" dialog can never be shown without a real one, so this can't
  // silently subscribe anyone -- what it removes is the multi-tap hunt through
  // settings before that dialog even appears; it's now one tap on login, on every
  // device. Fires at most once per app load, and only while permission is still
  // "default" (never decided) -- a driver who dismissed/denied it is never re-prompted
  // by this (the browser itself won't let JS re-trigger that dialog after a denial;
  // re-enabling then requires the driver's own browser/OS settings).
  const { permission: pushPermission, isSupported: pushSupported, subscribe: subscribeToPush } =
    usePushNotifications();
  const autoPushPromptedRef = useRef(false);
  useEffect(() => {
    if (isAdmin) return;
    if (!("driver" in view)) return; // only once genuinely logged in, on a real driver screen
    if (autoPushPromptedRef.current) return;
    if (!pushSupported || pushPermission !== "default") return;
    autoPushPromptedRef.current = true;
    const timer = setTimeout(() => {
      void subscribeToPush().then(success => {
        if (success) {
          toast.success("Push notifications enabled!");
        } else if (Notification.permission === "denied") {
          toast.info("Notifications were blocked in settings.");
        } else {
          // Permission was granted but the subscribe/save step itself failed
          // (e.g. no service worker yet, or /api/push/subscribe rejected the
          // request) -- this used to fail with zero visible trace, so a driver's
          // device could sit un-subscribed indefinitely with nothing in the UI or
          // logs pointing at why. Settings > PWA Settings still has the manual
          // "Enable Push Notifications" retry button for this case.
          toast.error("Couldn't enable push notifications. Try again from Settings.");
        }
      });
    }, 1200);
    return () => clearTimeout(timer);
  }, [isAdmin, view, pushSupported, pushPermission, subscribeToPush, toast]);

  useEffect(() => {
    if (isAdmin) return;
    const resetToken = resetTokenFromUrl();
    if (resetToken) {
      setView({ name: "reset-password", token: resetToken });
      return;
    }
    fetchSession()
      .then(driver => {
        if (!driver) {
          setView({ name: "login" });
          return;
        }
        setView(ACTIVITY_JOB ? { name: "job-activity", driver, jobId: ACTIVITY_JOB, returnTo: "jobs" } : SHORTCUT_TAB === "profile" ? { name: "settings", driver } : { name: "jobs", driver });
      })
      .catch(() => setView({ name: "login" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  if (isAdmin) {
    // The admin owns its own theme (html.tmv-admin + data-admin-theme, see
    // screens/admin/dashboard/adminTheme.css). AdminApp pins the document to the
    // light token base while mounted; a data-theme here would re-declare every token
    // on this subtree and mask the admin palette. `display: contents` keeps it out of layout.
    return (
      <div style={{ display: "contents" }}>
        <ErrorBoundary>
          <Suspense fallback={<FullScreenSpinner label="Loading Operations…" />}>
            <AdminApp />
          </Suspense>
        </ErrorBoundary>
      </div>
    );
  }

  let screen: React.ReactNode;
  switch (view.name) {
    case "checking":
      screen = <FullScreenSpinner label="Checking your session…" />;
      break;

    case "reset-password":
      screen = (
        <ResetPasswordScreen
          token={view.token}
          onDone={driver => {
            window.history.replaceState({}, "", "/");
            setView({ name: "jobs", driver });
          }}
        />
      );
      break;

    case "forgot-password":
      screen = <ForgotPasswordScreen onBack={() => setView({ name: "login" })} />;
      break;

    case "login":
      screen = (
        <LoginScreen
          notice={authNotice}
          onLoggedIn={driver => {
            setAuthNotice(null);
            setView({ name: "jobs", driver });
          }}
          onForgotPassword={() => setView({ name: "forgot-password" })}
        />
      );
      break;

    case "job":
      screen = (
        <JobWorkflowScreen
          jobId={view.jobId}
          onBack={() => setView(view.returnTo === "pending-submissions" ? { name: "pending-submissions", driver: view.driver } : { name: "jobs", driver: view.driver })}
        />
      );
      break;

    case "messages":
      screen = <MessagesScreen onBack={() => setView({ name: "jobs", driver: view.driver })} onOpenJob={jobId => setView({ name: "job-activity", driver: view.driver, jobId, returnTo: "messages" })} />;
      break;

    case "job-activity":
      screen = <JobActivityScreen jobId={view.jobId} onBack={() => setView(view.returnTo === "messages" ? { name: "messages", driver: view.driver } : { name: "jobs", driver: view.driver })} />;
      break;

    case "pending-submissions":
      screen = <PendingSubmissionsScreen onOpenJob={jobId => setView({ name: "job", driver: view.driver, jobId, returnTo: "pending-submissions" })} />;
      break;

    case "liability":
      screen = (
        <LiabilityScreen
          initialCheckpoint={view.checkpoint}
          initialJobId={view.jobId}
        />
      );
      break;

    case "settings":
      screen = (
        <AccountSettingsScreen
          driver={view.driver}
          onLogout={() => setConfirmLogout(true)}
        />
      );
      break;

    case "van":
      screen = <VanScreen driver={view.driver} />;
      break;

    case "jobs":
    default:
      screen = (
        <JobListScreen
          driver={view.driver}
          onOpenJob={jobId => setView({ name: "job", driver: view.driver, jobId })}
          onOpenProfile={() => setView({ name: "settings", driver: view.driver })}
          onOpenPendingSubmissions={() => setView({ name: "pending-submissions", driver: view.driver })}
          onOpenMessages={() => setView({ name: "messages", driver: view.driver })}
        />
      );
      break;
  }

  // Auth screens carry their own full-viewport layout (a desktop split, a phone
  // column) and aren't wrapped in the app chrome.
  const isAuthView =
    view.name === "checking" ||
    view.name === "login" ||
    view.name === "forgot-password" ||
    view.name === "reset-password";

  const isTabView =
    view.name === "jobs" ||
    view.name === "pending-submissions" ||
    view.name === "liability" ||
    view.name === "van" ||
    view.name === "settings" ||
    view.name === "job";

  let framed: React.ReactNode;
  if (isAuthView) {
    framed = screen;
  } else if (isTabView && "driver" in view) {
    // Jobs / Liability / Van / Profile get the sidebar (desktop) + bottom nav (mobile).
    // The keyed wrapper gives each tab a subtle entry transition; the sidebar and
    // bottom nav sit outside it and stay put.
    framed = (
      <AppLayout
        active={TAB_FOR_VIEW[view.name]}
        onSelect={async tab => {
          const d = view.driver;
          // Desktop sidebar is still visible on a job; don't silently drop unsent photos.
          if (
            view.name === "job" &&
            hasUnsavedWork() &&
            !(await confirm({
              title: "Discard unsent photos?",
              body: "You've taken photos on this step that haven't been sent yet. Leaving now discards them.",
              confirmLabel: "Discard and leave",
              tone: "danger"
            }))
          ) {
            return;
          }
          setView(
            tab === "jobs"
              ? { name: "jobs", driver: d }
              : tab === "liability"
                ? { name: "liability", driver: d }
                : tab === "van"
                  ? { name: "van", driver: d }
                  : { name: "settings", driver: d }
          );
        }}
        driver={view.driver}
        onLogout={() => setConfirmLogout(true)}
        onOpenPendingSubmissions={() => setView({ name: "pending-submissions", driver: view.driver })}
        pendingSubmissionsActive={view.name === "pending-submissions"}
        showTopBar={view.name !== "job"}
        showBottomNav={view.name !== "job"}
      >
        <div key={view.name} className="screen-enter h-full">
          {screen}
        </div>
      </AppLayout>
    );
  } else {
    // Drill-in flow — owns the whole viewport, its own back navigation.
    framed = (
      <div className="screen-enter h-screen-safe">
        {screen}
      </div>
    );
  }

  return (
    <DevicePreview>
      <InAppNotificationListener />
      {framed}
      {/* One bottom stack so the two prompts never overlap each other, sitting just
       *  above the tab bar (its measured height already includes the safe area). Hidden
       *  on drill-in flows, where the step's own dock owns the bottom of the screen. */}
      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(max(var(--bottom-nav-h,0px),env(safe-area-inset-bottom))+12px)] z-[220] flex flex-col items-center gap-2 px-3 lg:bottom-5">
        <UpdateBanner hidden={view.name === "job"} />
        <PwaInstallPrompt hidden={view.name === "job" || isAuthView} />
      </div>
      <ConfirmDialog
        open={confirmLogout}
        onClose={() => setConfirmLogout(false)}
        onConfirm={() => void handleLogout()}
        title="Sign out?"
        body="You'll need your email and password to get back in. Anything saved on this phone but not yet sent stays queued and will send once you're back online."
        confirmLabel="Sign out"
        cancelLabel="Stay signed in"
        tone="danger"
      />
    </DevicePreview>
  );
}
