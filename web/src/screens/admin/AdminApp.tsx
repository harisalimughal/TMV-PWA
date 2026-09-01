import React, { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { adminLogout, fetchAdminSession } from "../../api/admin";
import { AdminLoginScreen } from "./AdminLoginScreen";
import { Layout } from "./dashboard/Layout";
import { OverviewPage } from "./dashboard/pages/OverviewPage";
import { LiveFleetPage } from "./dashboard/pages/LiveFleetPage";
import { JobsPage } from "./dashboard/pages/JobsPage";
import { FinishedJobsPage } from "./dashboard/pages/FinishedJobsPage";
import { NotificationsPage } from "./dashboard/pages/NotificationsPage";
import { DriversPage } from "./dashboard/pages/DriversPage";
import { ExceptionsPage } from "./dashboard/pages/ExceptionsPage";
import { ScenariosPage } from "./dashboard/pages/ScenariosPage";
import { ParkingLiabilityPage } from "./dashboard/pages/ParkingLiabilityPage";
import { ActivityPage } from "./dashboard/pages/ActivityPage";
import { ReportsPage } from "./dashboard/pages/ReportsPage";
import { MessagingPage } from "./dashboard/pages/MessagingPage";
import { PricingSettingsPage } from "./dashboard/pages/PricingSettingsPage";
import { usePushNotifications } from "../../lib/pwa/usePushNotifications";

/**
 * Entry point for the /admin path on dashboard.themanvan.co.uk (see App.tsx's
 * hostname+pathname check). Fully independent of the driver login flow -- its own
 * session cookie (tmv_admin_session), its own password, mounted at /api/admin.
 *
 * The bulk of this -- Layout + all 14 pages -- is TMV-Chat-bot's dashboard/web ported
 * into tmv-pwa (see ./dashboard/*), so this domain can run entirely off tmv-pwa's own
 * Mongo backend instead of the retired Sheets/Drive-dependent project. "settings" and
 * "pricing" both route to the same real PricingSettingsPage -- the source's two
 * separate pages there were both non-functional UI mockups covering the same ground
 * (crew/packing/overtime rates); nothing was lost by consolidating them into the one
 * real version.
 */
export function AdminApp() {
  const [checking, setChecking] = useState(true);
  const [loggedIn, setLoggedIn] = useState(false);
  const [activeSection, setActiveSection] = useState<string>("overview");

  useEffect(() => {
    fetchAdminSession()
      .then(setLoggedIn)
      .finally(() => setChecking(false));
  }, []);

  // Same auto-prompt as the driver app's App.tsx: fires the browser's own "Allow
  // notifications?" dialog right on login instead of leaving it for the admin to find
  // in Pricing Settings themselves. It can only ever prompt, not silently subscribe --
  // that's a hard browser rule, not something either app can work around -- but this
  // removes the settings-hunt before that prompt appears. Fires at most once per app
  // load, only while permission is still "default" (never decided); a denied prompt is
  // never retried here (the browser blocks JS from re-showing it after a denial).
  const { permission: pushPermission, isSupported: pushSupported, subscribe: subscribeToPush } =
    usePushNotifications();
  const autoPushPromptedRef = useRef(false);
  useEffect(() => {
    if (!loggedIn) return;
    if (autoPushPromptedRef.current) return;
    if (!pushSupported || pushPermission !== "default") return;
    autoPushPromptedRef.current = true;
    const timer = setTimeout(() => void subscribeToPush(), 1200);
    return () => clearTimeout(timer);
  }, [loggedIn, pushSupported, pushPermission, subscribeToPush]);

  /**
   * Section state lives in ?section=. pushState was already being called on every
   * change, but nothing listened for popstate -- so the browser's Back button changed
   * the URL and left the UI on the same page, which is worse than not pushing history
   * at all. This listener closes that loop.
   */
  useEffect(() => {
    const readSection = () => {
      const sec = new URLSearchParams(window.location.search).get("section");
      setActiveSection(sec || "overview");
    };
    readSection();
    window.addEventListener("popstate", readSection);
    return () => window.removeEventListener("popstate", readSection);
  }, []);

  function handleSelectSection(section: string) {
    if (section === activeSection) return; // don't stack duplicate history entries
    setActiveSection(section);
    const url = new URL(window.location.href);
    url.searchParams.set("section", section);
    window.history.pushState({ section }, "", url.toString());
  }

  async function handleLogout() {
    try {
      await adminLogout();
    } finally {
      setLoggedIn(false);
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
    <Layout activeSection={activeSection} onSelectSection={handleSelectSection} onLogout={handleLogout}>
      {activeSection === "overview" && <OverviewPage onSelectSection={handleSelectSection} />}
      {activeSection === "livefleet" && <LiveFleetPage onSelectSection={handleSelectSection} />}
      {activeSection === "jobs" && <JobsPage />}
      {activeSection === "finished" && <FinishedJobsPage />}
      {activeSection === "notifications" && <NotificationsPage />}
      {activeSection === "checkin" && <ScenariosPage kind="checkin" />}
      {activeSection === "checkout" && <ScenariosPage kind="checkout" />}
      {activeSection === "parking" && <ParkingLiabilityPage />}
      {activeSection === "liability" && <ScenariosPage kind="liability" />}
      {activeSection === "drivers" && <DriversPage />}
      {activeSection === "exceptions" && <ExceptionsPage onOpenJob={() => handleSelectSection("jobs")} />}
      {activeSection === "pricing" && <PricingSettingsPage />}
      {activeSection === "activity" && <ActivityPage />}
      {activeSection === "reports" && <ReportsPage />}
      {activeSection === "messaging" && <MessagingPage />}
      {activeSection === "settings" && <PricingSettingsPage />}
    </Layout>
  );
}
