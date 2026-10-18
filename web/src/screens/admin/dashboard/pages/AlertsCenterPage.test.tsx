import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../../../../components/ui/Toast";
import { AlertsCenterPage, normalizePhone } from "./AlertsCenterPage";

const mocks = vi.hoisted(() => ({ fetchNotifications: vi.fn(), fetchAlerts: vi.fn(), dismissNotifications: vi.fn(), dismissAlerts: vi.fn() }));
vi.mock("../api", async () => ({ ...(await vi.importActual<object>("../api")), ...mocks }));
vi.mock("../hooks/useAttention", async () => ({
  ...(await vi.importActual<object>("../hooks/useAttention")),
  useAttention: () => ({ items: [], sources: [], failed: [], loading: false, lastUpdated: null, refetch: vi.fn(), jobsTruncated: false })
}));
const push = vi.hoisted(() => ({ isSupported: true, isSubscribed: true, isLoading: false, permission: "granted", subscribe: vi.fn() }));
vi.mock("../../../../lib/pwa/usePushNotifications", () => ({ usePushNotifications: () => push }));
vi.mock("../../../../api/admin", () => ({ fetchDrivers: vi.fn().mockResolvedValue([{ initials: "SD", fullName: "Sam Driver", active: true }]) }));
vi.mock("../../../../lib/adminTransport", () => ({ adminFetch: vi.fn() }));

const row = (patch: Record<string, unknown>) => ({ jobId: "TMV-1", customerName: "Alex Sample", customerEmail: "alex@example.invalid", customerPhone: "07700 900123", driverInitials: "SD", actualStart: "2026-10-14T09:00:00Z",
  email: { state: "sent", detail: "", at: "2026-10-14T09:01:00Z" }, sms: { state: "failed", detail: "Rejected", at: "2026-10-14T09:02:00Z" }, ...patch });

const renderPage = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ToastProvider><AlertsCenterPage /></ToastProvider></QueryClientProvider>);

beforeEach(() => {
  Object.assign(push, { isSupported: true, isSubscribed: true, isLoading: false, permission: "granted" });
  push.subscribe.mockReset().mockResolvedValue(false);
  mocks.fetchNotifications.mockReset().mockResolvedValue({ rows: [row({}), row({ jobId: "TMV-2", customerName: "Blake Example", customerEmail: "", customerPhone: "12345", driverInitials: "", sms: { state: "sent", detail: "", at: "2026-10-14T09:02:00Z" } })] });
  mocks.fetchAlerts.mockReset().mockResolvedValue({ alerts: [], pagination: { page: 1, pageSize: 25, total: 0, totalPages: 0 } });
  window.history.replaceState({}, "", "/admin?section=alerts");
});

describe("Notifications & Alerts", () => {
  it("enables this device from the push bar and gives success feedback", async () => {
    push.isSubscribed = false;
    push.subscribe.mockImplementation(async () => { push.isSubscribed = true; return true; });
    renderPage();
    const bar = screen.getByRole("region", { name: "PWA Push Notification System" });
    expect(within(bar).getByText("This Device: Not Subscribed")).toBeInTheDocument();
    fireEvent.click(within(bar).getByRole("button", { name: "Enable Device Alerts" }));
    await screen.findByText("Device alerts enabled. This browser is subscribed.");
    expect(push.subscribe).toHaveBeenCalledTimes(1);
    expect(within(bar).getByText("This Device: Subscribed")).toBeInTheDocument();
    expect(within(bar).getByRole("button", { name: "Device Alerts Enabled" })).toBeDisabled();
  });

  it("keeps Enable retryable and reports a failed subscription", async () => {
    push.isSubscribed = false;
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Enable Device Alerts" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Device alerts could not be enabled");
    expect(screen.getByRole("button", { name: "Enable Device Alerts" })).toBeEnabled();
  });

  it.each(["denied", "unsupported"])("explains %s push support while keeping broadcast available", permission => {
    push.isSubscribed = false;
    push.permission = permission;
    push.isSupported = permission !== "unsupported";
    renderPage();
    expect(screen.getByRole("button", { name: "Enable Device Alerts" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Broadcast Notice" })).toBeEnabled();
    expect(screen.getByText(permission === "denied" ? /Notifications are blocked for this site/ : /This browser doesn't support Web Push/)).toBeInTheDocument();
    expect(push.subscribe).not.toHaveBeenCalled();
  });
  it.each(["fleet", "delivery"])("offers Broadcast Notice on the %s view", async view => {
    window.history.replaceState({}, "", `/admin?section=alerts&view=${view}`);
    renderPage();
    expect(await screen.findByRole("button", { name: "Broadcast Notice" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Broadcast Notice" }));
    expect(await screen.findByRole("dialog", { name: "Send Push Notification" })).toBeInTheDocument();
  });

  it("has exactly Notifications and Alerts tabs, defaults to Notifications and restores the previous filters", async () => {
    renderPage();
    expect(screen.getByRole("heading", { name: "Notifications & Alerts" })).toBeInTheDocument();
    const tabs = within(screen.getByRole("tablist", { name: "Notifications and alerts views" }));
    expect(tabs.getAllByRole("tab").map(tab => tab.textContent)).toEqual(["Notifications", "Alerts"]);
    expect(tabs.getByRole("tab", { name: "Notifications" })).toHaveAttribute("aria-selected", "true");
    expect(tabs.getByRole("tab", { name: "Notifications" })).toHaveClass("border-b-2", "border-admin-brand", "min-h-11");
    expect(tabs.getByRole("tab", { name: "Notifications" })).not.toHaveClass("rounded-xl");
    expect(screen.getByRole("button", { name: "Today" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("From date")).toHaveValue();
    expect(screen.getByLabelText("To date")).toHaveValue();
    expect(within(screen.getByRole("radiogroup", { name: "Delivery status" })).getAllByRole("radio").map(radio => radio.textContent?.replace(/\d/g, ""))).toEqual(["All", "Sent", "Failed", "Pending"]);
    expect(screen.getByRole("searchbox", { name: "Search delivery log" })).toBeInTheDocument();
    fireEvent.click(tabs.getByRole("tab", { name: "Alerts" }));
    expect(within(screen.getByRole("radiogroup", { name: "Event type" })).getAllByRole("radio").map(radio => radio.textContent)).toEqual(["All", "Congestion", "Tunnel"]);
    expect(screen.getByRole("searchbox", { name: "Search fleet events" })).toBeInTheDocument();
    await waitFor(() => expect(mocks.fetchAlerts).toHaveBeenCalled());
  });

  it("filters alerts by category and search, and searches history for categories with All dates", async () => {
    mocks.fetchAlerts.mockResolvedValue({ rows: [
      { eventId: "C1", category: "congestion", type: "zone_in", description: "Central London", deviceName: "Van 1", driverName: "Sam Driver", detectedAt: "2026-10-14T10:00:00Z" },
      { eventId: "T1", category: "tunnel", type: "zone_in", description: "River crossing", deviceName: "Van 2", driverName: "Jo Driver", detectedAt: "2026-10-14T10:00:00Z" }
    ] });
    window.history.replaceState({}, "", "/admin?section=alerts&view=fleet&from=&to=");
    renderPage();
    await screen.findByText("Central London");
    fireEvent.click(screen.getByRole("radio", { name: "Congestion" }));
    await waitFor(() => expect(mocks.fetchAlerts).toHaveBeenLastCalledWith(expect.any(String), expect.any(String)));
    expect(screen.queryByText("River crossing")).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search fleet events" }), { target: { value: "Sam" } });
    expect(screen.getByText("Central London")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search fleet events" }), { target: { value: "missing" } });
    expect(screen.getByText("No events match these filters")).toBeInTheDocument();
  });

  it("shows the requested columns and each event separately, with UK time and selectable rows", async () => {
    const alert = { category: "congestion", type: "zone_in", description: "CHARGES - ALERTS (Congestion Zone E)", deviceName: "GK21LWO - TI", driverInitials: "TI", driverName: "Tiago", detectedAt: "2026-10-17T21:32:00Z" };
    mocks.fetchAlerts.mockResolvedValue({ rows: [{ ...alert, eventId: "E1" }, { ...alert, eventId: "E2" }] });
    window.history.replaceState({}, "", "/admin?section=alerts&view=fleet&from=&to=");
    renderPage();
    const table = await screen.findByRole("table", { name: "Alerts" });
    expect(within(table).getAllByRole("columnheader").map(cell => cell.textContent)).toEqual(["", "Category", "Event", "Location / rule", "Van", "Driver", "Detected (UK)"]);
    expect(within(table).getAllByRole("row")).toHaveLength(3);
    const cells = within(within(table).getAllByRole("row")[1]).getAllByRole("cell");
    expect(cells.map(cell => cell.textContent)).toEqual(["", "Congestion", "Entered zone", "Congestion Zone E", "GK21LWO - TI", "TITiago", "17/10/26 · 22:32"]);
    fireEvent.click(within(table).getByRole("checkbox", { name: "Select all alerts" }));
    expect(screen.getByRole("button", { name: "Hide 2 selected" })).toBeInTheDocument();
    fireEvent.click(within(table).getByRole("checkbox", { name: "Select alert E1" }));
    expect(screen.getByRole("button", { name: "Hide 1 selected" })).toBeInTheDocument();
  });

  it("opens the composer without sending anything", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Broadcast Notice" }));
    await screen.findByRole("dialog");
    const { adminFetch } = await import("../../../../lib/adminTransport");
    expect(adminFetch).not.toHaveBeenCalled();
  });

  it("shows separate notification columns for the job, customer, driver, UK start time, targets and statuses", async () => {
    window.history.replaceState({}, "", "/admin?section=alerts&view=delivery&from=&to=");
    renderPage();
    const table = await screen.findByRole("table");
    expect(within(table).getAllByRole("columnheader").map(cell => cell.textContent)).toEqual(["", "Job ID", "Customer", "Driver", "Started (UK)", "Email Target", "Email Status", "SMS Target", "SMS Status"]);
    expect(within(table).getByText("alex@example.invalid")).toBeInTheDocument();
    expect(within(table).getByText("07700 900123")).toBeInTheDocument();
    expect(within(table).getByRole("button", { name: "Open job TMV-1" })).toHaveTextContent("TMV-1");
    expect(within(table).getByText("Alex Sample")).toBeInTheDocument();
    expect(within(table).getByText("SD")).toHaveClass("rounded-full");
    expect(within(table).getAllByText("14/10/26 · 10:00")).toHaveLength(2);
    expect(within(table).getByText("No email")).toBeInTheDocument();
    expect(within(table).getByText(/not a dialable number/)).toBeInTheDocument();
    expect(within(table).getByText(/Rejected/)).toBeInTheDocument();
    fireEvent.click(within(table).getByRole("checkbox", { name: "Select all rows on this page" }));
    expect(screen.getByRole("button", { name: "Hide 2 selected" })).toBeInTheDocument();
  });

  it("offers the same delivery information as one card per job for phones", async () => {
    window.history.replaceState({}, "", "/admin?section=alerts&view=delivery&from=&to=");
    renderPage();
    const list = await screen.findByRole("list", { name: "Delivery log" });
    const cards = within(list).getAllByRole("listitem");
    expect(cards).toHaveLength(2);
    expect(within(cards[0]).getByText("alex@example.invalid")).toBeInTheDocument();
    expect(within(cards[0]).getByText("07700 900123")).toBeInTheDocument();
    expect(within(cards[0]).getByText(/TMV-1 · Driver SD/)).toBeInTheDocument();
    expect(within(cards[1]).getByText("No email on file")).toBeInTheDocument();
    expect(within(cards[1]).getByText(/not a dialable number/)).toBeInTheDocument();
    const box = within(cards[0]).getByRole("checkbox", { name: "Select TMV-1" });
    expect(box).toHaveClass("h-6", "w-6"); // 24 px minimum target on phones
    fireEvent.click(box);
    expect(await screen.findByRole("button", { name: /Hide 1 selected/ })).toBeInTheDocument();
  });

  it("keeps the status filter", async () => {
    window.history.replaceState({}, "", "/admin?section=alerts&view=delivery&status=failed&from=&to=");
    renderPage();
    const table = await screen.findByRole("table");
    expect(within(table).getByText("Alex Sample")).toBeInTheDocument();
    expect(within(table).queryByText("Blake Example")).toBeNull();
  });
});

describe("normalizePhone", () => {
  it("formats UK numbers and flags ones that cannot be dialled", () => {
    expect(normalizePhone("+44 7700 900123")).toEqual({ formatted: "07700 900123", invalid: false });
    expect(normalizePhone("07700900123")).toEqual({ formatted: "07700 900123", invalid: false });
    expect(normalizePhone("12345").invalid).toBe(true);
    expect(normalizePhone("").invalid).toBe(true);
  });

  it("opens the composer locked to one driver and job when arriving from Activity, and returns to that conversation on close", async () => {
    window.history.replaceState({}, "", "/admin?section=alerts&compose=driver&msgDriver=SD&msgJob=TMV-9");
    renderPage();
    const dialog = await screen.findByRole("dialog", { name: "Send Push Notification" });
    expect(within(dialog).getByText(/Only this driver is notified/)).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/Recipient/)).toBeDisabled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(window.location.search).toBe("?section=activity&conversation=TMV-9");
  });

  it("ignores an incomplete compose link instead of falling back to an all-driver broadcast", async () => {
    window.history.replaceState({}, "", "/admin?section=alerts&compose=driver&msgDriver=SD");
    renderPage();
    await screen.findByRole("button", { name: "Broadcast Notice" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
