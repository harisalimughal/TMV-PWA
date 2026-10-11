import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LiabilityPage } from "./LiabilityPage";

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("../api", async original => ({ ...await original<typeof import("../api")>(), fetchScenarios: mocks.fetch }));
vi.mock("../hooks/useDriverOptions", () => ({ useDriverOptions: () => ({ options: [{ initials: "QA", fullName: "QA Driver", active: true }], isLoading: false }) }));
vi.mock("../components/LiabilityConfigModal", () => ({ LiabilityConfigModal: () => null }));
const renderPage = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><LiabilityPage /></QueryClientProvider>);

describe("Unified Liability page", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/admin?section=liabilities");
    mocks.fetch.mockReset().mockImplementation((kind, page) => Promise.resolve({ kind, items: [{ id: `submission-${kind}`, jobId: "QA-JOB", timestamp: "2026-10-10T09:00:00Z",
      clientName: "Alex Example", driverName: "QA Driver", driverInitials: "QA", driver: "qa@example.invalid", containerNumber: "Container 100", address: "10 Synthetic Road London",
      damageCategories: "Item condition note", photos: [], signature: null }], pagination: { page, pageSize: 25, total: 50, totalPages: 2 } }));
  });
  it("has four switchable views and only requests the active scenario", async () => {
    renderPage();
    expect(screen.getAllByRole("radio").map(item => item.textContent)).toEqual(["Check In", "Check Out", "Parking Liability", "Liability Reports"]);
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalled());
    expect(mocks.fetch.mock.calls.every(call => call[0] === "parking")).toBe(true);
    expect(screen.getByRole("radio", { name: "Parking Liability" })).toHaveAttribute("aria-checked", "true");
    for (const [label, kind] of [["Check In", "checkin"], ["Check Out", "checkout"], ["Parking Liability", "parking"], ["Liability Reports", "liability"]]) {
      fireEvent.click(screen.getByRole("radio", { name: label }));
      await waitFor(() => expect(mocks.fetch.mock.calls.some(call => call[0] === kind && call[1] === 1)).toBe(true));
      expect(screen.getByRole("radio", { name: label })).toHaveAttribute("aria-checked", "true");
      expect(screen.getByLabelText("Filter by driver")).toBeInTheDocument();
      expect(screen.getByLabelText("Search submissions")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Export CSV" })).toBeInTheDocument();
      expect(within(screen.getByRole("group", { name: "Date filters" })).getByLabelText("From date")).toBeInTheDocument();
      expect(within(screen.getByRole("group", { name: "Other filters" })).getByLabelText("Filter by driver")).toBeInTheDocument();
      expect(within(screen.getByRole("group", { name: "Other filters" })).getByLabelText("Search submissions")).toBeInTheDocument();
      expect(screen.getByLabelText("Search submissions")).toHaveClass("h-10", "rounded-card", "pl-9", "pr-4", "border-admin-line/50", "focus:ring-1");
      expect(screen.getByLabelText("Search submissions")).not.toHaveClass("rounded-[6px]", "rounded-full");
      expect(screen.getByLabelText("Filter by driver")).toHaveClass("h-10", "rounded-card", "border-admin-line/50");
      expect(within(screen.getByRole("group", { name: "Other filters" })).getByRole("radiogroup", { name: "Liability views" })).toBeInTheDocument();
    }
  });
  it("keeps Parking Liability filters separate from the table frame and above it like Jobs", async () => {
    renderPage();
    await screen.findByText("Alex Example");
    const dates = screen.getByRole("group", { name: "Date filters" });
    const controls = screen.getByRole("group", { name: "Other filters" });
    const bar = dates.parentElement!;
    const table = screen.getByRole("table");
    expect(bar.contains(table)).toBe(false);
    expect(bar.parentElement).toBe(table.parentElement!.parentElement!.parentElement);
    expect(bar.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(controls).getByRole("radiogroup", { name: "Liability views" })).toBeInTheDocument();
    expect(within(controls).getByRole("button", { name: "Refresh Data" }).compareDocumentPosition(within(controls).getByRole("button", { name: "Export CSV" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
  it("retains shared driver, search and date filters across all four views and resets pagination", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("radio", { name: "Check In" }));
    await screen.findByText("Alex Example");
    fireEvent.change(screen.getByLabelText("Filter by driver"), { target: { value: "QA" } });
    fireEvent.change(screen.getByLabelText("Search submissions"), { target: { value: "Alex" } });
    fireEvent.change(screen.getByLabelText("From date"), { target: { value: "2026-10-09" } });
    fireEvent.change(screen.getByLabelText("To date"), { target: { value: "2026-10-10" } });
    await waitFor(() => expect(mocks.fetch.mock.calls.some(call => call[2] === "QA" && call[3] === "2026-10-08T23:00:00.000Z" && call[4] === "2026-10-10T22:59:59.999Z")).toBe(true));
    fireEvent.click(await screen.findByRole("button", { name: "Next" }));
    await waitFor(() => expect(mocks.fetch.mock.calls.some(call => call[0] === "checkin" && call[1] === 2)).toBe(true));
    for (const label of ["Check Out", "Parking Liability", "Liability Reports", "Check In"]) {
      fireEvent.click(screen.getByRole("radio", { name: label }));
      expect(screen.getByLabelText("Filter by driver")).toHaveValue("QA");
      expect(screen.getByLabelText("Search submissions")).toHaveValue("Alex");
      expect(screen.getByLabelText("From date")).toHaveValue("2026-10-09");
      expect(screen.getByLabelText("To date")).toHaveValue("2026-10-10");
    }
    await waitFor(() => expect(mocks.fetch.mock.calls.at(-1)?.[1]).toBe(1));
  });
  it.each([["checkin", "Check In"], ["checkout", "Check Out"], ["parking", "Parking Liability"], ["liability", "Liability Reports"]])("restores legacy %s links", (section, label) => {
    window.history.replaceState({}, "", `/admin?section=${section}`);
    renderPage(); expect(screen.getByRole("radio", { name: label })).toHaveAttribute("aria-checked", "true");
  });
  it("supports keyboard switching and browser history restoration", () => {
    renderPage();
    screen.getByRole("radio", { name: "Parking Liability" }).focus();
    fireEvent.keyDown(screen.getByRole("radio", { name: "Parking Liability" }), { key: "ArrowRight" });
    expect(new URLSearchParams(location.search).get("liabilityTab")).toBe("liability");
    expect(screen.getByRole("radio", { name: "Liability Reports" })).toHaveFocus();
    window.history.replaceState({}, "", "/admin?section=liabilities&liabilityTab=parking");
    fireEvent(window, new PopStateEvent("popstate"));
    expect(screen.getByRole("radio", { name: "Parking Liability" })).toHaveAttribute("aria-checked", "true");
  });
  it("falls back to parking for an invalid view and honors an explicit current link", () => {
    window.history.replaceState({}, "", "/admin?section=liabilities&liabilityTab=invalid");
    renderPage();
    expect(screen.getByRole("radio", { name: "Parking Liability" })).toHaveAttribute("aria-checked", "true");
    window.history.replaceState({}, "", "/admin?section=liabilities&liabilityTab=checkout");
    fireEvent(window, new PopStateEvent("popstate"));
    expect(screen.getByRole("radio", { name: "Check Out" })).toHaveAttribute("aria-checked", "true");
  });
});
