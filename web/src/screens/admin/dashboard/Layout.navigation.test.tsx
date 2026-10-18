import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Layout } from "./Layout";

vi.mock("../../../api/admin", async original => ({ ...await original<typeof import("../../../api/admin")>(), fetchAdminProfile: vi.fn().mockResolvedValue({ email: "admin@example.invalid" }) }));
vi.mock("./components/AlertsBell", () => ({ AlertsBell: () => null }));

const layout = (client: QueryClient, section: string, onSelect = vi.fn()) => <QueryClientProvider client={client}>
  <Layout activeSection={section} onSelectSection={onSelect}><div>Page</div></Layout>
</QueryClientProvider>;

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
});
afterEach(() => vi.unstubAllGlobals());

describe("Admin shell navigation", () => {
  it("lists the ten destinations and marks the current one", () => {
    render(layout(new QueryClient(), "vehicles"));
    const nav = screen.getByRole("navigation", { name: "Sections" });
    expect(within(nav).getAllByRole("link").map(link => link.textContent)).toEqual(["Overview", "Bookings", "Jobs", "Activity", "Live Fleet", "Drivers", "Van", "Liability", "Notifications & Alerts", "Settings"]);
    expect(within(nav).getByRole("link", { name: "Van" })).toHaveAttribute("aria-current", "page");
  });

  it("highlights Drivers while a driver report is open", () => {
    render(layout(new QueryClient(), "driverreport"));
    expect(within(screen.getByRole("navigation", { name: "Sections" })).getByRole("link", { name: "Drivers" })).toHaveAttribute("aria-current", "page");
  });

  it("keeps the sidebar preference on driver reports instead of collapsing it", () => {
    const client = new QueryClient();
    const { rerender } = render(layout(client, "drivers"));
    expect(screen.getByRole("button", { name: "Collapse sidebar" })).toHaveAttribute("aria-expanded", "true");
    rerender(layout(client, "driverreport"));
    expect(screen.getByRole("button", { name: "Collapse sidebar" })).toHaveAttribute("aria-expanded", "true");
  });

  it("remembers a manual collapse across reloads", () => {
    const { unmount } = render(layout(new QueryClient(), "overview"));
    fireEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));
    expect(localStorage.getItem("tmv:admin-sidebar-collapsed")).toBe("1");
    unmount();
    render(layout(new QueryClient(), "jobs"));
    expect(screen.getByRole("button", { name: "Expand sidebar" })).toHaveAttribute("aria-expanded", "false");
  });

  it("navigates to the selected destination on a plain click", () => {
    const onSelect = vi.fn();
    render(layout(new QueryClient(), "overview", onSelect));
    fireEvent.click(within(screen.getByRole("navigation", { name: "Sections" })).getByRole("link", { name: "Liability" }));
    expect(onSelect).toHaveBeenCalledWith("evidence");
  });

  it("on a phone, opens the menu as a dialog with an Appearance choice that beats the system theme", () => {
    // A phone (max-width 767px) whose operating system is in dark mode.
    vi.stubGlobal("matchMedia", vi.fn((query: string) => ({ matches: true, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    render(layout(new QueryClient(), "overview"));
    const menuButton = screen.getByRole("button", { name: "Open navigation menu" });
    menuButton.focus(); // a real tap focuses the button; jsdom's click does not
    fireEvent.click(menuButton);
    const drawer = screen.getByRole("dialog", { name: "Main navigation" });
    expect(drawer).toHaveAttribute("aria-modal", "true");
    expect(drawer.contains(document.activeElement)).toBe(true);
    expect(document.body.style.overflow).toBe("hidden");
    const appearance = within(drawer).getByRole("radiogroup", { name: "Appearance" });
    expect(within(appearance).getAllByRole("radio").map(radio => radio.textContent)).toEqual(["Light", "Dark", "System"]);
    expect(document.documentElement.dataset.adminTheme).toBe("dark"); // no saved choice: follows the system
    fireEvent.click(within(appearance).getByRole("radio", { name: "Light" }));
    expect(localStorage.getItem("tmv:admin-theme")).toBe("light");
    expect(document.documentElement.dataset.adminTheme).toBe("light");
    expect(document.documentElement.style.colorScheme).toBe("light");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Main navigation" })).not.toBeInTheDocument();
    expect(document.activeElement).toBe(menuButton);
  });
});
