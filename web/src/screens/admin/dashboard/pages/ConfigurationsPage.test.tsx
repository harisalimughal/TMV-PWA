import React, { useEffect } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConfigurationsPage } from "./ConfigurationsPage";

const mocks = vi.hoisted(() => ({ pricing: vi.fn(), messaging: vi.fn() }));
vi.mock("./PricingSettingsPage", () => ({ PricingSettingsPage: () => { useEffect(() => mocks.pricing(), []); return <div>Existing pricing page</div>; } }));
vi.mock("./MessagingPage", () => ({ MessagingPage: () => { useEffect(() => mocks.messaging(), []); return <div>Existing messaging page</div>; } }));
beforeEach(() => { window.history.replaceState({}, "", "/admin?section=configurations"); vi.clearAllMocks(); });

describe("Combined Configurations", () => {
  it("defaults to Pricing Settings with a right-aligned switch and mounts only pricing", () => {
    render(<ConfigurationsPage />);
    expect(screen.getByRole("radio", { name: "Pricing Settings" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radiogroup").parentElement).toHaveClass("justify-end");
    expect(mocks.pricing).toHaveBeenCalledOnce();
    expect(mocks.messaging).not.toHaveBeenCalled();
  });
  it("switches the existing pages and restores browser-history selection", () => {
    render(<ConfigurationsPage />);
    fireEvent.click(screen.getByRole("radio", { name: "Messaging Content" }));
    expect(screen.getByText("Existing messaging page")).toBeInTheDocument();
    expect(screen.queryByText("Existing pricing page")).not.toBeInTheDocument();
    expect(new URLSearchParams(location.search).get("configurationTab")).toBe("messaging");
    fireEvent.click(screen.getByRole("radio", { name: "Pricing Settings" }));
    window.history.replaceState({}, "", "/admin?section=configurations&configurationTab=messaging");
    fireEvent(window, new PopStateEvent("popstate"));
    expect(screen.getByRole("radio", { name: "Messaging Content" })).toHaveAttribute("aria-checked", "true");
  });
  it.each([["pricing", "Pricing Settings"], ["settings", "Pricing Settings"], ["messaging", "Messaging Content"]])("honors legacy %s links", (section, label) => {
    window.history.replaceState({}, "", `/admin?section=${section}`);
    render(<ConfigurationsPage />);
    expect(screen.getByRole("radio", { name: label })).toHaveAttribute("aria-checked", "true");
  });
});
