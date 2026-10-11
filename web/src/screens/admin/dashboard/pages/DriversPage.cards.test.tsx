import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DriversPage } from "./DriversPage";

const mocks = vi.hoisted(() => ({ save: vi.fn(), remove: vi.fn() }));
vi.mock("../api", () => ({
  fetchDrivers: vi.fn().mockResolvedValue({ drivers: [{ initials: "MA", fullName: "Sample Driver", hasAccount: true, active: true,
    email: "ma@example.invalid", completed: 3, revenueFormatted: "GBP 200.00", cashCollectedPounds: 100, cardCollectedPounds: 100,
    avgDelayMinutes: 0, totalDurationMinutes: 120, reviewSentCount: 2, reviewNotSentCount: 1 }] }),
  saveDriver: mocks.save, deleteDriver: mocks.remove
}));
vi.mock("../components/AddDriverModal", () => ({ AddDriverModal: ({ isOpen, onClose }: any) => isOpen ? <div role="dialog" aria-label="Edit driver"><button onClick={onClose}>Close editor</button></div> : null }));

describe("Rectangular admin driver cards", () => {
  it("uses the shared compact card style while retaining edit actions and report navigation", async () => {
    window.history.replaceState({}, "", "/admin?section=drivers&from=2026-10-10&to=2026-10-11");
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><DriversPage /></QueryClientProvider>);
    const name = await screen.findByRole("button", { name: "Sample Driver" });
    const card = name.closest(".group")!;
    expect(card).toHaveClass("rounded-[6px]", "border-admin-line", "p-6");
    expect(card).not.toHaveClass("rounded-module", "hover:-translate-y-0.5", "hover:shadow-md");
    expect(screen.getByText("2 sent")).toBeInTheDocument();
    fireEvent.click(screen.getByTitle("Edit Driver"));
    expect(screen.getByRole("dialog", { name: "Edit driver" })).toBeInTheDocument();
    expect(new URLSearchParams(location.search).get("section")).toBe("drivers");
    fireEvent.click(screen.getByRole("button", { name: "Close editor" }));
    fireEvent.click(card);
    const params = new URLSearchParams(location.search);
    expect(params.get("section")).toBe("driverreport");
    expect(params.get("driver")).toBe("MA");
    expect(params.get("reportTab")).toBe("jobs");
    expect(params.get("from")).toBe("2026-10-10");
    expect(params.get("to")).toBe("2026-10-11");
    expect(mocks.save).not.toHaveBeenCalled(); expect(mocks.remove).not.toHaveBeenCalled();
  });
});
