import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AdminApp } from "./AdminApp";
vi.mock("../../api/admin", async original => ({ ...await original<typeof import("../../api/admin")>(), fetchAdminSession: vi.fn().mockResolvedValue(true) }));
vi.mock("../../lib/pwa/usePushNotifications", () => ({ usePushNotifications: () => ({ permission: "denied", isSupported: false, subscribe: vi.fn() }) }));
vi.mock("../pwa-settings/hooks/useServiceWorkerUpdate", () => ({ useServiceWorkerUpdate: () => ({ needRefresh: false, applyUpdate: vi.fn() }) }));
vi.mock("./dashboard/Layout", async () => {
  const { CommandPalette } = await import("./dashboard/components/CommandPalette");
  return { Layout: ({ activeSection, onSelectSection, children }: any) => <div><span data-testid="active-section">{activeSection}</span><CommandPalette isOpen onClose={() => {}} onSelectSection={onSelectSection} />{children}</div> };
});
vi.mock("./dashboard/pages/OverviewPage", () => ({ OverviewPage: () => <p>Overview content</p> }));
vi.mock("./dashboard/pages/LogsPage", () => ({ LogsPage: () => <p>Log viewer content</p> }));

describe("Admin Logs routing", () => {
  it("opens the Logs page from the exact search result", async () => {
    window.history.replaceState({}, "", "/admin?section=overview&page=9&kind=unrelated");
    render(<AdminApp />);
    await screen.findByText("Overview content");
    expect(screen.queryByRole("button", { name: /^Logs/ })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "logs" } });
    fireEvent.click(screen.getByRole("button", { name: /^Logs/ }));
    expect(await screen.findByText("Log viewer content")).toBeInTheDocument();
    expect(screen.getByTestId("active-section")).toHaveTextContent("logs");
    expect(new URLSearchParams(location.search).get("section")).toBe("logs");
    expect(new URLSearchParams(location.search).get("page")).toBeNull();
    expect(new URLSearchParams(location.search).get("kind")).toBeNull();
  });
});
