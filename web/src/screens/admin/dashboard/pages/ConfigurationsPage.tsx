import React, { useEffect, useState } from "react";
import { SegmentedControl } from "../../../../ui";
import { navigateAdmin } from "../utils/reportNavigation";
import { PricingSettingsPage } from "./PricingSettingsPage";
import { MessagingPage } from "./MessagingPage";

export const CONFIGURATION_SECTIONS = ["configurations", "pricing", "messaging", "settings"] as readonly string[];
type ConfigurationTab = "pricing" | "messaging";
function currentTab(): ConfigurationTab {
  const params = new URLSearchParams(window.location.search);
  const section = params.get("section");
  if (section === "messaging") return "messaging";
  if (section === "pricing" || section === "settings") return "pricing";
  return params.get("configurationTab") === "messaging" ? "messaging" : "pricing";
}

export function ConfigurationsPage() {
  const [tab, setTab] = useState(currentTab);
  useEffect(() => {
    const read = () => setTab(currentTab());
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);
  const selectTab = (next: ConfigurationTab) => {
    if (next === tab) return;
    const url = new URL(window.location.href);
    url.searchParams.set("section", "configurations");
    url.searchParams.set("configurationTab", next);
    navigateAdmin(url.pathname + url.search);
  };
  return <div className="mx-auto max-w-[1440px] space-y-6">
    <div className="flex justify-end">
      <SegmentedControl aria-label="Configuration views" value={tab} onChange={selectTab}
        className="grid w-full grid-cols-2 sm:inline-flex sm:w-auto [&_button]:min-w-0 [&_button]:h-auto [&_button]:min-h-11 [&_button]:whitespace-normal sm:[&_button]:h-9 sm:[&_button]:min-h-0 sm:[&_button]:whitespace-nowrap"
        options={[{ value: "pricing" as const, label: "Pricing Settings" }, { value: "messaging" as const, label: "Messaging Content" }]} />
    </div>
    {tab === "pricing" ? <PricingSettingsPage /> : <MessagingPage />}
  </div>;
}
