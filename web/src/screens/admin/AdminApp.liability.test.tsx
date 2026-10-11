import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminApp } from "./AdminApp";

vi.mock("../../api/admin", async original => ({ ...await original<typeof import("../../api/admin")>(), fetchAdminSession: vi.fn().mockResolvedValue(true) }));
vi.mock("../../lib/pwa/usePushNotifications", () => ({ usePushNotifications: () => ({ permission: "denied", isSupported: false, subscribe: vi.fn() }) }));
vi.mock("../pwa-settings/hooks/useServiceWorkerUpdate", () => ({ useServiceWorkerUpdate: () => ({ needRefresh: false, applyUpdate: vi.fn() }) }));
vi.mock("./dashboard/Layout", () => ({ Layout: ({ activeSection, onSelectSection, children }: any) => <div><span data-testid="active-section">{activeSection}</span><button onClick={() => onSelectSection("parking")}>Legacy parking destination</button>{children}</div> }));
vi.mock("./dashboard/pages/LiabilityPage", () => ({ LIABILITY_SECTIONS: ["liabilities", "checkin", "checkout", "parking", "liability"], LiabilityPage: () => <div>Unified Liability page</div> }));

describe("Admin liability route compatibility", () => {
  beforeEach(() => window.history.replaceState({}, "", "/admin?section=liabilities"));
  it.each(["liabilities", "checkin", "checkout", "parking", "liability"])("maps %s to the unified sidebar/page", async section => {
    window.history.replaceState({}, "", `/admin?section=${section}`);
    render(<AdminApp />);
    expect(await screen.findByText("Unified Liability page")).toBeInTheDocument();
    expect(screen.getByTestId("active-section")).toHaveTextContent("liabilities");
  });
  it("dispatches navigation updates when following a legacy destination inside the unified page", async () => {
    const listener = vi.fn(); window.addEventListener("popstate", listener);
    render(<AdminApp />); await screen.findByText("Unified Liability page");
    fireEvent.click(screen.getByRole("button", { name: "Legacy parking destination" }));
    expect(new URLSearchParams(location.search).get("section")).toBe("parking");
    expect(screen.getByTestId("active-section")).toHaveTextContent("liabilities");
    expect(listener).toHaveBeenCalled(); window.removeEventListener("popstate", listener);
  });
});
