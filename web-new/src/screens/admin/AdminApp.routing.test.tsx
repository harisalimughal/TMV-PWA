import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminApp } from "./AdminApp";
import { ADMIN_SESSION_EXPIRED } from "../../lib/adminTransport";
import { setUnsaved } from "./dashboard/utils/unsavedChanges";

vi.mock("../../api/admin", async original => ({ ...await original<typeof import("../../api/admin")>(), fetchAdminSession: vi.fn().mockResolvedValue(true) }));
vi.mock("../../lib/pwa/usePushNotifications", () => ({ usePushNotifications: () => ({ permission: "denied", isSupported: false, subscribe: vi.fn() }) }));
vi.mock("../pwa-settings/hooks/useServiceWorkerUpdate", () => ({ useServiceWorkerUpdate: () => ({ needRefresh: false, applyUpdate: vi.fn() }) }));
vi.mock("./dashboard/Layout", () => ({ Layout: ({ activeSection, onSelectSection, children }: any) => <div>
  <span data-testid="route">{activeSection}</span>
  <button onClick={() => onSelectSection("jobs")}>Go to jobs</button>
  {children}</div> }));
vi.mock("./dashboard/components/JobDetailModal", () => ({ JobDetailRoute: () => null }));
vi.mock("./AdminLoginScreen", () => ({ AdminLoginScreen: () => <div>Admin sign in</div> }));
vi.mock("./dashboard/pages/OverviewPage", () => ({ OverviewPage: () => <div>Overview page</div> }));
vi.mock("./dashboard/pages/JobsPage", () => ({ JobsPage: () => <div>Jobs page</div> }));
vi.mock("./dashboard/pages/DriversPage", () => ({ DriversPage: () => <div>Drivers page</div> }));
vi.mock("./dashboard/pages/DriverReportPage", () => ({ DriverReportPage: () => <div>Driver report page</div> }));
vi.mock("./dashboard/pages/LiveFleetPage", () => ({ LiveFleetPage: () => <div>Live Fleet page</div> }));
vi.mock("./dashboard/pages/VehiclesPage", () => ({ VehiclesPage: () => <div>Vehicles page</div> }));
vi.mock("./dashboard/pages/EvidencePage", () => ({ EvidencePage: () => <div>Evidence page</div> }));
vi.mock("./dashboard/pages/AlertsCenterPage", () => ({ AlertsCenterPage: () => <div>Alerts page</div> }));
vi.mock("./dashboard/pages/SettingsPage", () => ({ SettingsPage: () => <div>Settings page</div> }));
vi.mock("./dashboard/pages/MaintenancePage", () => ({ MaintenancePage: () => <div>Maintenance page</div> }));

const query = () => Object.fromEntries(new URLSearchParams(window.location.search));

describe("AdminApp routing", () => {
  it("clears cached protected data when the session expires", async () => {
    window.history.replaceState({}, "", "/admin?section=jobs");
    const client = new QueryClient(); client.setQueryData(["jobs", "private"], { customerName: "Private" });
    render(<QueryClientProvider client={client}><AdminApp /></QueryClientProvider>);
    await screen.findByText("Jobs page");
    act(() => window.dispatchEvent(new Event(ADMIN_SESSION_EXPIRED)));
    expect(await screen.findByText("Admin sign in")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("session expired");
    expect(client.getQueryData(["jobs", "private"])).toBeUndefined();
    expect(screen.queryByText("Jobs page")).not.toBeInTheDocument();
  });
  beforeEach(() => { setUnsaved("test-editor", false); window.history.replaceState({}, "", "/admin"); });

  it.each([
    ["finished", "Jobs", { section: "jobs", status: "completed" }],
    ["van", "Vehicles", { section: "vehicles" }],
    ["parking", "Evidence", { section: "evidence", kind: "parking" }],
    ["notifications", "Alerts", { section: "alerts" }],
    ["messaging", "Settings", { section: "settings", tab: "templates" }],
    ["finance", "Overview", { section: "overview" }]
  ])("opens legacy ?section=%s on the new page and rewrites the URL", async (legacy, label, canonical) => {
    window.history.replaceState({}, "", `/admin?section=${legacy}`);
    render(<QueryClientProvider client={new QueryClient()}><AdminApp /></QueryClientProvider>);
    expect(await screen.findByText(`${label} page`)).toBeInTheDocument();
    expect(query()).toEqual(canonical);
  });

  it("starts each destination with its own clean URL state", async () => {
    window.history.replaceState({}, "", "/admin?section=vehicles&vehicle=AB12");
    render(<QueryClientProvider client={new QueryClient()}><AdminApp /></QueryClientProvider>);
    await screen.findByText("Vehicles page");
    fireEvent.click(screen.getByRole("button", { name: "Go to jobs" }));
    expect(query()).toEqual({ section: "jobs" });
    expect(await screen.findByText("Jobs page")).toBeInTheDocument();
  });

  it("asks before leaving a page with unsaved changes", async () => {
    window.history.replaceState({}, "", "/admin?section=settings");
    render(<QueryClientProvider client={new QueryClient()}><AdminApp /></QueryClientProvider>);
    await screen.findByText("Settings page");
    act(() => setUnsaved("test-editor", true));
    fireEvent.click(screen.getByRole("button", { name: "Go to jobs" }));
    expect(await screen.findByText("Discard unsaved changes?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Stay on page" }));
    expect(query()).toEqual({ section: "settings" });
    fireEvent.click(screen.getByRole("button", { name: "Go to jobs" }));
    fireEvent.click(await screen.findByRole("button", { name: "Discard and leave" }));
    expect(query()).toEqual({ section: "jobs" });
    act(() => setUnsaved("test-editor", false));
  });
});
