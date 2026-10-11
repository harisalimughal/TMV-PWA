import React, { useEffect, useState } from "react";
import { SegmentedControl } from "../../../../ui";
import { navigateAdmin } from "../utils/reportNavigation";
import { defaultScenarioFilters, type ScenarioFilterControl } from "../hooks/useScenarioFilters";
import { ScenariosPage } from "./ScenariosPage";
import { ParkingLiabilityPage } from "./ParkingLiabilityPage";
import "./liabilityPage.css";

const TABS = ["checkin", "checkout", "parking", "liability"] as const;
type LiabilityTab = typeof TABS[number];
export const LIABILITY_SECTIONS = ["liabilities", ...TABS] as readonly string[];
const OPTIONS = [
  { value: "checkin" as const, label: "Check In" }, { value: "checkout" as const, label: "Check Out" },
  { value: "parking" as const, label: "Parking Liability" }, { value: "liability" as const, label: "Liability Reports" }
];

function currentTab(): LiabilityTab {
  const params = new URLSearchParams(window.location.search);
  const section = params.get("section");
  if (TABS.includes(section as LiabilityTab)) return section as LiabilityTab;
  const tab = params.get("liabilityTab");
  return TABS.includes(tab as LiabilityTab) ? tab as LiabilityTab : "checkin";
}

export function LiabilityPage() {
  const [tab, setTab] = useState(currentTab);
  const [filters, setFilters] = useState(defaultScenarioFilters);
  useEffect(() => {
    const read = () => setTab(currentTab());
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);
  const selectTab = (next: LiabilityTab) => {
    if (next === tab) return;
    const url = new URL(window.location.href);
    url.searchParams.set("section", "liabilities");
    url.searchParams.set("liabilityTab", next);
    navigateAdmin(url.pathname + url.search);
  };
  const filterControl: ScenarioFilterControl = { value: filters, onChange: patch => setFilters(previous => ({ ...previous, ...patch })) };
  return <div className="mx-auto max-w-[1440px] space-y-5">
    <div>
      <SegmentedControl aria-label="Liability views" value={tab} onChange={selectTab} options={OPTIONS} className="liability-view-switcher" />
    </div>
    {tab === "parking" ? <ParkingLiabilityPage key={tab} filterControl={filterControl} /> : <ScenariosPage key={tab} kind={tab} filterControl={filterControl} />}
  </div>;
}
