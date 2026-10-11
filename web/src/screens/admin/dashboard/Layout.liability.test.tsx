import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Layout } from "./Layout";

vi.mock("../../../api/admin", async original => ({ ...await original<typeof import("../../../api/admin")>(), fetchAdminProfile: vi.fn().mockResolvedValue({ email: "admin@example.invalid" }) }));
vi.mock("../../../components/driver/NotificationBell", () => ({ NotificationBell: () => null }));
vi.mock("./pages/ApiSettingsPage", () => ({ ApiSettingsPage: () => null }));
describe("Liability sidebar navigation", () => {
  beforeEach(() => { vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))); });
  afterEach(() => vi.unstubAllGlobals());
  it("separates adjacent sidebar tabs with inset lines in expanded and collapsed views", () => {
    render(<QueryClientProvider client={new QueryClient()}><Layout activeSection="jobs" onSelectSection={vi.fn()}><div>Content</div></Layout></QueryClientProvider>);
    const nav = screen.getByRole("navigation");
    const separators = () => [...nav.querySelectorAll('div[aria-hidden="true"]')];
    expect(separators()).toHaveLength(9);
    expect(within(nav).queryByText("Operations")).not.toBeInTheDocument();
    expect(within(nav).queryByText("Management")).not.toBeInTheDocument();
    for (const separator of separators()) expect(separator).toHaveClass("mx-2", "border-t", "border-admin-line");
    fireEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));
    expect(separators()).toHaveLength(9);
    expect(within(nav).getByRole("button", { name: "Jobs" })).toHaveAttribute("aria-current", "page");
  });
  it("centres visible named icons in the collapsed rail and keeps a clear active state", () => {
    const select = vi.fn();
    render(<QueryClientProvider client={new QueryClient()}><Layout activeSection="jobs" onSelectSection={select}><div>Content</div></Layout></QueryClientProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));
    const nav = screen.getByRole("navigation");
    const active = within(nav).getByRole("button", { name: "Jobs" });
    expect(active).toHaveAttribute("aria-current", "page");
    expect(active).toHaveClass("justify-center", "p-0", "bg-white");
    expect(active.querySelector("svg")).toHaveClass("w-5", "h-5", "flex-shrink-0");
    expect(nav).toHaveClass("px-3");
    expect(screen.getByRole("button", { name: "Expand sidebar" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: "Expand sidebar" })).toHaveClass("w-9", "h-9", "shrink-0");
    expect(within(nav).getAllByRole("button").every(button => !!button.getAttribute("aria-label") && !!button.getAttribute("title"))).toBe(true);
    fireEvent.click(within(nav).getByRole("button", { name: "Liability" }));
    expect(select).toHaveBeenCalledWith("liabilities");
    fireEvent.click(screen.getByRole("button", { name: "Expand sidebar" }));
    expect(within(nav).getByRole("button", { name: "Jobs" })).toHaveClass("px-4");
  });
  it.each([["driverreport", "Drivers"], ["finished", "Jobs"], ["parking", "Liability"]])("highlights the parent destination for %s", (activeSection, label) => {
    render(<QueryClientProvider client={new QueryClient()}><Layout activeSection={activeSection} onSelectSection={vi.fn()}><div>Content</div></Layout></QueryClientProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));
    expect(within(screen.getByRole("navigation")).getByRole("button", { name: label })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("navigation").querySelectorAll('[aria-current="page"]')).toHaveLength(1);
  });
  it("has one Liability destination instead of four scenario sidebar entries", () => {
    const select = vi.fn();
    render(<QueryClientProvider client={new QueryClient()}><Layout activeSection="liabilities" onSelectSection={select}><div>Content</div></Layout></QueryClientProvider>);
    const nav = screen.getByRole("navigation");
    expect(within(nav).getAllByRole("button", { name: "Liability" })).toHaveLength(1);
    for (const label of ["Check In", "Check Out", "Parking Liability", "Liability Report"]) expect(within(nav).queryByRole("button", { name: label })).not.toBeInTheDocument();
    fireEvent.click(within(nav).getByRole("button", { name: "Liability" }));
    expect(select).toHaveBeenCalledWith("liabilities");
    expect(screen.getByRole("heading", { name: "Liability" })).toBeInTheDocument();
  });
});
