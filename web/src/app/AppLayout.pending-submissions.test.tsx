import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppLayout } from "./AppLayout";
import type { DriverProfile } from "../api/auth";
vi.mock("../components/driver/NotificationBell", () => ({ NotificationBell: () => null }));
vi.mock("../components/driver/ThemeToggle", () => ({ ThemeToggleButton: () => null }));
const driver = { initials: "MA", fullName: "MA Driver" } as DriverProfile;
describe("Driver pending-submissions menu", () => {
  it("opens a left menu and navigates to Pending Submissions", () => {
    const pending = vi.fn();
    render(<AppLayout active="jobs" onSelect={vi.fn()} driver={driver} onLogout={vi.fn()} onOpenPendingSubmissions={pending}><p>Jobs content</p></AppLayout>);
    fireEvent.click(screen.getByRole("button", { name: "Open driver menu" }));
    const menu = screen.getByRole("dialog", { name: "The Man Van" });
    expect(menu).toHaveClass("h-screen-safe");
    fireEvent.click(within(menu).getByRole("button", { name: "Pending Submissions" }));
    expect(pending).toHaveBeenCalledOnce(); expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("closes on Escape and restores focus without navigating", () => {
    render(<AppLayout active="jobs" onSelect={vi.fn()} driver={driver} onLogout={vi.fn()}><p>Jobs content</p></AppLayout>);
    const trigger = screen.getByRole("button", { name: "Open driver menu" }); trigger.focus(); fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(); expect(trigger).toHaveFocus();
  });
});
