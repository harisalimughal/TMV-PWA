import React from "react";
import { useUrlState } from "../hooks/useUrlState";
import { guardNavigation } from "../utils/unsavedChanges";
import { sectionHref, navigateTo } from "../navigation";
import { PageHeader, TabPanel, Tabs } from "../components/ds";
import { PricingSettings } from "../components/settings/PricingSettings";
import { BookingPricingStatus } from "../components/settings/BookingPricingStatus";
import { MessageTemplates } from "../components/settings/MessageTemplates";
import { DeviceNotifications } from "../components/settings/DeviceNotifications";
import { GoogleCalendarSettings } from "../components/settings/GoogleCalendarSettings";
import { ApiCredentials } from "../components/settings/ApiCredentials";

export const SETTINGS_TABS = ["pricing", "templates", "notifications", "integrations", "api"] as const;
export type SettingsTab = typeof SETTINGS_TABS[number];
const LABELS: Record<SettingsTab, string> = { pricing: "Pricing", templates: "Message templates", notifications: "Notifications", integrations: "Integrations", api: "API credentials" };
const SCOPE: Record<SettingsTab, string> = {
  pricing: "Rates used when job prices are calculated.",
  templates: "Text and on/off state of every message the app sends.",
  notifications: "Dashboard alerts on this device.",
  integrations: "Connections to other services.",
  api: "SMS and fleet-tracking credentials."
};

export function SettingsPage() {
  const [state, update] = useUrlState({ tab: "pricing" });
  const tab: SettingsTab = (SETTINGS_TABS as readonly string[]).includes(state.tab) ? state.tab as SettingsTab : "pricing";
  // Switching tab unmounts the editor, so unsaved edits go through the same guard as leaving the page.
  const select = (next: SettingsTab) => { if (next !== tab) guardNavigation(() => update({ tab: next }, { push: true })); };
  return (
    <div className="max-w-[1100px] space-y-4">
      <PageHeader title="Settings" scope={SCOPE[tab]} />
      <Tabs idBase="settings" label="Settings sections" value={tab} onChange={select} tabs={SETTINGS_TABS.map(id => ({ id, label: LABELS[id] }))} />
      <TabPanel idBase="settings" id={tab}>
        {tab === "pricing" && <div className="space-y-4"><PricingSettings /><BookingPricingStatus /></div>}
        {tab === "templates" && <MessageTemplates />}
        {tab === "notifications" && <DeviceNotifications onOpenDeliveryLog={() => guardNavigation(() => navigateTo(sectionHref("alerts", { view: "delivery" })))} />}
        {tab === "integrations" && <GoogleCalendarSettings />}
        {tab === "api" && <ApiCredentials />}
      </TabPanel>
    </div>
  );
}
