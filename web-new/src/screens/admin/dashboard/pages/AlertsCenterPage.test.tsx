import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../../../../components/ui/Toast";
import { AlertsCenterPage, normalizePhone } from "./AlertsCenterPage";

const mocks = vi.hoisted(() => ({ fetchNotifications: vi.fn(), fetchAlerts: vi.fn(), dismissNotifications: vi.fn(), dismissAlerts: vi.fn() }));
vi.mock("../api", async () => ({ ...(await vi.importActual<object>("../api")), ...mocks }));
vi.mock("../hooks/useAttention", async () => ({
  ...(await vi.importActual<object>("../hooks/useAttention")),
  useAttention: () => ({ items: [], sources: [], failed: [], loading: false, lastUpdated: null, refetch: vi.fn(), jobsTruncated: false })
}));
vi.mock("../../../../lib/pwa/usePushNotifications", () => ({ usePushNotifications: () => ({ isSupported: true, isSubscribed: true }) }));
vi.mock("../../../../api/admin", () => ({ fetchDrivers: vi.fn().mockResolvedValue([{ initials: "SD", fullName: "Sam Driver", active: true }]) }));
vi.mock("../../../../lib/adminTransport", () => ({ adminFetch: vi.fn() }));

const row = (patch: Record<string, unknown>) => ({ jobId: "TMV-1", customerName: "Alex Sample", customerEmail: "alex@example.invalid", customerPhone: "07700 900123", driverInitials: "SD", actualStart: "2026-10-14T09:00:00Z",
  email: { state: "sent", detail: "", at: "2026-10-14T09:01:00Z" }, sms: { state: "failed", detail: "Rejected", at: "2026-10-14T09:02:00Z" }, ...patch });

const renderPage = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ToastProvider><AlertsCenterPage /></ToastProvider></QueryClientProvider>);

beforeEach(() => {
  mocks.fetchNotifications.mockReset().mockResolvedValue({ rows: [row({}), row({ jobId: "TMV-2", customerName: "Blake Example", customerEmail: "", customerPhone: "12345", driverInitials: "", sms: { state: "sent", detail: "", at: "2026-10-14T09:02:00Z" } })] });
  mocks.fetchAlerts.mockReset().mockResolvedValue({ alerts: [], pagination: { page: 1, pageSize: 25, total: 0, totalPages: 0 } });
  window.history.replaceState({}, "", "/admin?section=alerts");
});

describe("Alerts & messages", () => {
  it.each(["attention", "fleet", "delivery"])("offers Broadcast Notice on the %s view", async view => {
    window.history.replaceState({}, "", `/admin?section=alerts&view=${view}`);
    renderPage();
    expect(await screen.findByRole("button", { name: "Broadcast Notice" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Broadcast Notice" }));
    expect(await screen.findByRole("dialog", { name: "Send Push Notification" })).toBeInTheDocument();
  });

  it("opens the composer without sending anything", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Broadcast Notice" }));
    await screen.findByRole("dialog");
    const { adminFetch } = await import("../../../../lib/adminTransport");
    expect(adminFetch).not.toHaveBeenCalled();
  });

  it("shows who each message was for in the delivery log: email, phone and driver", async () => {
    window.history.replaceState({}, "", "/admin?section=alerts&view=delivery&from=&to=");
    renderPage();
    const table = await screen.findByRole("table");
    expect(within(table).getByText("alex@example.invalid")).toBeInTheDocument();
    expect(within(table).getByText("07700 900123")).toBeInTheDocument();
    expect(within(table).getByText(/TMV-1 · Driver SD/)).toBeInTheDocument();
    expect(within(table).getByText("No email on file")).toBeInTheDocument();
    expect(within(table).getByText(/not a dialable number/)).toBeInTheDocument();
    expect(within(table).getByText(/Rejected/)).toBeInTheDocument();
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
