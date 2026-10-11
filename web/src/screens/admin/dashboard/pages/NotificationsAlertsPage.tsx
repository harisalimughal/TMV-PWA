import React, { useEffect, useState } from "react";
import { SegmentedControl } from "../../../../ui";
import { navigateAdmin } from "../utils/reportNavigation";
import { NotificationsPage } from "./NotificationsPage";
import { AlertsPage } from "./AlertsPage";

type NotificationsTab = "notifications" | "alerts";
function currentTab(): NotificationsTab {
  const params = new URLSearchParams(window.location.search);
  return params.get("section") === "alerts" || params.get("notificationsTab") === "alerts" ? "alerts" : "notifications";
}

export function NotificationsAlertsPage() {
  const [tab, setTab] = useState(currentTab);
  useEffect(() => {
    const read = () => setTab(currentTab());
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);
  const selectTab = (next: NotificationsTab) => {
    if (next === tab) return;
    const url = new URL(window.location.href);
    url.searchParams.set("section", "notifications");
    url.searchParams.set("notificationsTab", next);
    navigateAdmin(url.pathname + url.search);
  };
  return <div className="mx-auto max-w-[1440px] space-y-6">
    <div className="flex justify-end">
      <SegmentedControl aria-label="Notifications and alerts views" value={tab} onChange={selectTab}
        options={[{ value: "notifications" as const, label: "Notifications" }, { value: "alerts" as const, label: "Alerts" }]} />
    </div>
    {tab === "notifications" ? <NotificationsPage /> : <AlertsPage />}
  </div>;
}
