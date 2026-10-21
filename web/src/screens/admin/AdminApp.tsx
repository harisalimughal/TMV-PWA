import React, { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ADMIN_SESSION_EXPIRED } from "../../lib/adminTransport";
import { clearSearchHistory } from "./dashboard/search/history";
import { Loader2 } from "lucide-react";
import { adminLogout, fetchAdminSession } from "../../api/admin";
import { AdminLoginScreen } from "./AdminLoginScreen";
import { Layout } from "./dashboard/Layout";
// Pages are imported statically: the dashboard loads as one chunk (AdminApp-*), which
// App.tsx fetches on demand. If pages are ever code-split with React.lazy, the extra
// chunks stay out of the driver PWA's precache automatically (chunk graph in
// scripts/adminChunks.ts), and `npm run check:precache` verifies it.
import { OverviewPage } from "./dashboard/pages/OverviewPage";
import { LiveFleetPage } from "./dashboard/pages/LiveFleetPage";
import { JobsPage } from "./dashboard/pages/JobsPage";
import { BookingsPage } from "./dashboard/bookings/BookingsPage";
import { ActivityPage } from "./dashboard/pages/ActivityPage";
import { VehiclesPage } from "./dashboard/pages/VehiclesPage";
import { AlertsCenterPage } from "./dashboard/pages/AlertsCenterPage";
import { DriversPage } from "./dashboard/pages/DriversPage";
import { DriverReportPage } from "./dashboard/pages/DriverReportPage";
import { EvidencePage } from "./dashboard/pages/EvidencePage";
import { SettingsPage } from "./dashboard/pages/SettingsPage";
import { MaintenancePage } from "./dashboard/pages/MaintenancePage";
import { LogsPage } from "./dashboard/pages/LogsPage";
import { JobDetailRoute } from "./dashboard/components/JobDetailModal";
import { ROUTE_TITLES, navigateTo, resolveRoute, sectionHref, type RouteId } from "./dashboard/navigation";
import { cancelPendingNavigation, confirmPendingNavigation, guardNavigation, usePendingNavigation } from "./dashboard/utils/unsavedChanges";
import { ConfirmDialog } from "../../ui";
import { usePushNotifications } from "../../lib/pwa/usePushNotifications";
import { useServiceWorkerUpdate } from "../pwa-settings/hooks/useServiceWorkerUpdate";
import { useAdminTheme } from "./dashboard/hooks/useAdminTheme";
import "./dashboard/adminTheme.css";

/**
 * Entry point for the /admin path on dashboard.themanvan.co.uk (see App.tsx's
 * hostname+pathname check). Fully independent of the driver login flow -- its own
 * session cookie (tmv_admin_session), its own password, mounted at /api/admin.
 *
 * Routing lives in ?section= (see dashboard/navigation.ts for the eight destinations
 * and the legacy-name mapping). Legacy URLs are rewritten in place to their canonical
 * form, so bookmarks made before the redesign keep working.
 */
export function AdminApp() {
  const queryClient = useQueryClient();
  const [sessionMessage, setSessionMessage] = useState("");
  const [checking, setChecking] = useState(true);
  const [loggedIn, setLoggedIn] = useState(false);
  const [route, setRoute] = useState<RouteId>(() => resolveRoute(window.location.search).route);
  const pendingNavigation = usePendingNavigation();
  useAdminTheme();

  useEffect(() => {
    const expired = () => {
      queryClient.clear();
      clearSearchHistory();
      setLoggedIn(false);
      setSessionMessage("Your admin session expired. Sign in again to continue.");
    };
    window.addEventListener(ADMIN_SESSION_EXPIRED, expired);
    return () => window.removeEventListener(ADMIN_SESSION_EXPIRED, expired);
  }, [queryClient]);

  useEffect(() => {
    fetchAdminSession()
      .then(setLoggedIn)
      .finally(() => setChecking(false));
  }, []);

  // The dashboard is a desktop ops tool, not an offline PWA -- apply a waiting
  // service-worker update automatically (loop-guarded in the registration singleton).
  const { needRefresh, applyUpdate } = useServiceWorkerUpdate();
  useEffect(() => {
    if (!needRefresh) return;
    const t = setTimeout(() => void applyUpdate(), 2000);
    return () => clearTimeout(t);
  }, [needRefresh, applyUpdate]);

  // Fires the browser's own "Allow notifications?" prompt once per load while the
  // permission is still undecided. It can only prompt, never silently subscribe.
  const { permission: pushPermission, isSupported: pushSupported, subscribe: subscribeToPush } = usePushNotifications();
  const autoPushPromptedRef = useRef(false);
  useEffect(() => {
    if (!loggedIn || autoPushPromptedRef.current) return;
    if (!pushSupported || pushPermission !== "default") return;
    autoPushPromptedRef.current = true;
    const timer = setTimeout(() => void subscribeToPush(), 1200);
    return () => clearTimeout(timer);
  }, [loggedIn, pushSupported, pushPermission, subscribeToPush]);

  // Section state lives in the URL; Back/Forward re-read it. Legacy names are
  // replaced with their canonical query (replaceState: no extra history entry).
  useEffect(() => {
    const read = () => {
      const resolved = resolveRoute(window.location.search);
      if (resolved.canonical) {
        window.history.replaceState(window.history.state, "", `${window.location.pathname}?${resolved.canonical.toString()}`);
      }
      setRoute(resolved.route);
    };
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);

  useEffect(() => { document.title = `${ROUTE_TITLES[route]} · TMV Admin`; }, [route]);
  // Scope the admin palette to the document while the dashboard is mounted, so dialogs
  // rendered in portals use it too and the driver app keeps its own tokens.
  useEffect(() => {
    const root = document.documentElement;
    const previousTheme = root.dataset.theme;
    root.classList.add("tmv-admin");
    // Base tokens the admin theme does not override (info/neutral, bar) stay light.
    root.dataset.theme = "light";
    return () => {
      root.classList.remove("tmv-admin");
      if (previousTheme === undefined) delete root.dataset.theme; else root.dataset.theme = previousTheme;
    };
  }, []);

  /** Sidebar / palette / in-page navigation to a destination. Starts from a clean
   *  query string (scoped URL state) and asks before discarding unsaved edits. */
  const handleSelectSection = useCallback((section: string, params?: Record<string, string | undefined>) => {
    const resolved = resolveRoute(`?section=${encodeURIComponent(section)}`);
    const target = resolved.route;
    const extra = { ...Object.fromEntries(resolved.canonical ? Array.from(resolved.canonical.entries()).filter(([key]) => key !== "section") : []), ...params };
    const href = sectionHref(target, extra);
    if (href === window.location.pathname + window.location.search) return;
    guardNavigation(() => navigateTo(href));
  }, []);

  async function handleLogout() {
    try {
      await adminLogout();
      queryClient.clear();
      clearSearchHistory();
      setLoggedIn(false);
      setSessionMessage("");
    } catch (error) {
      setSessionMessage((error as Error)?.message || "Sign out failed. Please try again.");
    }
  }

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-admin-bg">
        <Loader2 className="w-6 h-6 animate-spin text-admin-muted" aria-label="Checking session" />
      </div>
    );
  }

  if (!loggedIn) {
    return <>{sessionMessage && <p role="alert" className="border-b border-admin-line bg-admin-surface px-4 py-3 text-center text-sm text-admin-ink">{sessionMessage}</p>}<AdminLoginScreen onLoggedIn={() => { setSessionMessage(""); setLoggedIn(true); }} /></>;
  }

  return (
    <Layout activeSection={route} onSelectSection={handleSelectSection} onLogout={handleLogout}>
      {sessionMessage && <p role="alert" className="rounded-xl border border-admin-status-red/30 bg-admin-status-red-bg p-4 text-admin-status-red">{sessionMessage}</p>}
      {route === "overview" && <OverviewPage onSelectSection={handleSelectSection} />}
      {route === "bookings" && <BookingsPage />}
      {route === "jobs" && <JobsPage />}
      {route === "activity" && <ActivityPage />}
      {route === "drivers" && <DriversPage />}
      {route === "driverreport" && <DriverReportPage />}
      {route === "livefleet" && <LiveFleetPage />}
      {route === "vehicles" && <VehiclesPage />}
      {route === "evidence" && <EvidencePage />}
      {route === "alerts" && <AlertsCenterPage onSelectSection={handleSelectSection} />}
      {route === "settings" && <SettingsPage />}
      {route === "maintenance" && <MaintenancePage />}
      {route === "logs" && <LogsPage />}
      <JobDetailRoute />
      <ConfirmDialog
        open={pendingNavigation}
        onClose={cancelPendingNavigation}
        onConfirm={confirmPendingNavigation}
        title="Discard unsaved changes?"
        body="You have changes on this page that haven't been saved. Leaving now discards them."
        confirmLabel="Discard and leave"
        cancelLabel="Stay on page"
        tone="danger"
      />
    </Layout>
  );
}
