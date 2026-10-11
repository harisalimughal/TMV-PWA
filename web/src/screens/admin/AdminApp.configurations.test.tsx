import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AdminApp } from "./AdminApp";

vi.mock("../../api/admin", async original => ({ ...await original<typeof import("../../api/admin")>(), fetchAdminSession: vi.fn().mockResolvedValue(true) }));
vi.mock("../../lib/pwa/usePushNotifications", () => ({ usePushNotifications: () => ({ permission: "denied", isSupported: false, subscribe: vi.fn() }) }));
vi.mock("../pwa-settings/hooks/useServiceWorkerUpdate", () => ({ useServiceWorkerUpdate: () => ({ needRefresh: false, applyUpdate: vi.fn() }) }));
vi.mock("./dashboard/Layout", () => ({ Layout: ({ activeSection, onSelectSection, children }: any) => <div><span data-testid="active-section">{activeSection}</span><button onClick={() => onSelectSection("configurations")}>Open configurations</button>{children}</div> }));
vi.mock("./dashboard/pages/ConfigurationsPage", () => ({ CONFIGURATION_SECTIONS: ["configurations", "pricing", "messaging", "settings"], ConfigurationsPage: () => <div>Combined configurations page</div> }));
vi.mock("./dashboard/pages/JobsPage", () => ({ JobsPage: () => <div>Jobs page</div> }));

describe("Configurations route compatibility", () => {
  it.each(["configurations", "pricing", "messaging", "settings"])("maps %s to the combined destination", async section => {
    window.history.replaceState({}, "", `/admin?section=${section}`);
    render(<AdminApp />);
    expect(await screen.findByText("Combined configurations page")).toBeInTheDocument();
    expect(screen.getByTestId("active-section")).toHaveTextContent("configurations");
    expect(new URLSearchParams(location.search).get("section")).toBe(section);
  });
  it("uses default pricing when entering from the sidebar, rather than a stale messaging hint", async () => {
    window.history.replaceState({}, "", "/admin?section=jobs&configurationTab=messaging");
    render(<AdminApp />); await screen.findByText("Jobs page");
    fireEvent.click(screen.getByRole("button", { name: "Open configurations" }));
    expect(await screen.findByText("Combined configurations page")).toBeInTheDocument();
    expect(new URLSearchParams(location.search).get("configurationTab")).toBeNull();
  });
});
