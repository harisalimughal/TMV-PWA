import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AdminApp } from "./AdminApp";

vi.mock("../../api/admin", async original => ({ ...await original<typeof import("../../api/admin")>(), fetchAdminSession: vi.fn().mockResolvedValue(true) }));
vi.mock("../../lib/pwa/usePushNotifications", () => ({ usePushNotifications: () => ({ permission: "denied", isSupported: false, subscribe: vi.fn() }) }));
vi.mock("../pwa-settings/hooks/useServiceWorkerUpdate", () => ({ useServiceWorkerUpdate: () => ({ needRefresh: false, applyUpdate: vi.fn() }) }));
vi.mock("./dashboard/Layout", () => ({ Layout: ({ activeSection, onSelectSection, children }: any) => <div><span data-testid="active-section">{activeSection}</span><button onClick={() => onSelectSection("notifications")}>Open communications</button>{children}</div> }));
vi.mock("./dashboard/pages/NotificationsAlertsPage", () => ({ NotificationsAlertsPage: () => <div>Combined communications page</div> }));
vi.mock("./dashboard/pages/JobsPage", () => ({ JobsPage: () => <div>Jobs page</div> }));

describe("Combined communication route", () => {
  it("opens the default Notifications view on sidebar entry rather than keeping another page's stale Alerts hint", async () => {
    window.history.replaceState({}, "", "/admin?section=jobs&notificationsTab=alerts");
    render(<AdminApp />);
    await screen.findByText("Jobs page");
    fireEvent.click(screen.getByRole("button", { name: "Open communications" }));
    expect(await screen.findByText("Combined communications page")).toBeInTheDocument();
    expect(new URLSearchParams(location.search).get("notificationsTab")).toBeNull();
  });
  it.each(["notifications", "alerts"])("maps section=%s to the combined destination without rewriting its view hint", async section => {
    window.history.replaceState({}, "", `/admin?section=${section}`);
    render(<AdminApp />);
    expect(await screen.findByText("Combined communications page")).toBeInTheDocument();
    expect(screen.getByTestId("active-section")).toHaveTextContent("notifications");
    expect(new URLSearchParams(location.search).get("section")).toBe(section);
  });
});
