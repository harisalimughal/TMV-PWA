import React, { useEffect, useState } from "react";
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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sec = params.get("section");
    if (sec) setActiveSection(sec);
  }, []);

  function handleSelectSection(section: string) {
    setActiveSection(section);
    const url = new URL(window.location.href);
    url.searchParams.set("section", section);
    window.history.pushState({}, "", url.toString());
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
