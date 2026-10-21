import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Layout } from "./Layout";

vi.mock("../../../api/admin", async original => ({ ...await original<typeof import("../../../api/admin")>(), fetchAdminProfile: vi.fn().mockResolvedValue({ email: "admin@example.invalid" }) }));
vi.mock("../../../components/driver/NotificationBell", () => ({ NotificationBell: () => null }));
vi.mock("./pages/ApiSettingsPage", () => ({ ApiSettingsPage: () => null }));

const layout = (client: QueryClient, section: string) => <QueryClientProvider client={client}>
  <Layout activeSection={section} onSelectSection={vi.fn()}><div>Report content</div></Layout>
</QueryClientProvider>;
beforeEach(() => vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))));
afterEach(() => vi.unstubAllGlobals());

describe("Driver report sidebar focus", () => {
  it("gives the hidden Logs page its title without adding a sidebar or profile entry", () => {
    render(layout(new QueryClient(), "logs"));
    expect(screen.getByRole("heading", { name: "Logs" })).toBeInTheDocument();
    expect(within(screen.getByRole("navigation")).queryByRole("button", { name: /Logs/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Logs/ })).not.toBeInTheDocument();
  });
  it.each(["overview", "drivers", "jobs", "finished", "liabilities", "pricing", "livefleet", "alerts", "notifications", "messaging"])("collapses on report entry and expands on return to %s", section => {
    const client = new QueryClient();
    const { rerender } = render(layout(client, section));
    expect(screen.getByRole("button", { name: "Collapse sidebar" })).toHaveAttribute("aria-expanded", "true");
    rerender(layout(client, "driverreport"));
    expect(screen.getByRole("button", { name: "Expand sidebar" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("complementary", { name: "Main navigation" })).toHaveClass("md:w-20");
    rerender(layout(client, section));
    expect(screen.getByRole("button", { name: "Collapse sidebar" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("complementary", { name: "Main navigation" })).toHaveClass("md:w-[260px]");
  });
  it("starts collapsed on a report deep link and respects manual expansion within the report", () => {
    const client = new QueryClient();
    const { rerender } = render(layout(client, "driverreport"));
    fireEvent.click(screen.getByRole("button", { name: "Expand sidebar" }));
    rerender(layout(client, "driverreport"));
    expect(screen.getByRole("button", { name: "Collapse sidebar" })).toHaveAttribute("aria-expanded", "true");
  });
  it("does not reset manual sidebar choices on unrelated navigation", () => {
    const client = new QueryClient();
    const { rerender } = render(layout(client, "overview"));
    fireEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));
    rerender(layout(client, "jobs"));
    expect(screen.getByRole("button", { name: "Expand sidebar" })).toBeInTheDocument();
  });
  it("closes an open mobile drawer on report entry without replacing the mobile menu", () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    const client = new QueryClient();
    const { rerender } = render(layout(client, "overview"));
    fireEvent.click(screen.getByRole("button", { name: "Open navigation menu" }));
    expect(screen.getByRole("button", { name: "Open navigation menu" })).toHaveAttribute("aria-expanded", "true");
    rerender(layout(client, "driverreport"));
    expect(screen.getByRole("button", { name: "Open navigation menu" })).toHaveAttribute("aria-expanded", "false");
    expect(document.body.style.overflow).not.toBe("hidden");
    fireEvent.click(screen.getByRole("button", { name: "Open navigation menu" }));
    expect(screen.getByRole("complementary", { name: "Main navigation" })).toHaveClass("w-[260px]", "translate-x-0");
  });
});
