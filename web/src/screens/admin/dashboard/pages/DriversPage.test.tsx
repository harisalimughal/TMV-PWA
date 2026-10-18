import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DriversPage, driversLocation } from "./DriversPage";

const mocks = vi.hoisted(() => ({ save: vi.fn(), remove: vi.fn(), roster: vi.fn(), summary: vi.fn(), jobs: vi.fn() }));
vi.mock("../../../../api/admin", () => ({ fetchDrivers: mocks.roster }));
vi.mock("../api", () => ({ fetchDrivers: mocks.summary, fetchJobs: mocks.jobs, saveDriver: mocks.save, deleteDriver: mocks.remove }));
vi.mock("../components/AddDriverModal", () => ({ AddDriverModal: ({ isOpen, driverToEdit }: any) => isOpen ? <div role="dialog" aria-label="Edit driver" data-initials={driverToEdit?.initials} data-email={driverToEdit?.email} data-van={driverToEdit?.vanRegistration} data-imei={driverToEdit?.imei} data-active={String(driverToEdit?.active)} /> : null }));

const driver = (patch: Record<string, unknown>) => ({ email: "sample@example.invalid", initials: "SD", fullName: "Sam Driver", phone: "", vanRegistration: "AB12CDE", role: "driver", active: true, hasPassword: true, lastLoginAt: null, ...patch });
const renderPage = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><DriversPage /></QueryClientProvider>);
const params = () => new URLSearchParams(window.location.search);

beforeEach(() => {
  Object.values(mocks).forEach(mock => mock.mockReset());
  mocks.roster.mockResolvedValue([driver({}), driver({ initials: "OL", fullName: "Olive Leaver", email: "olive@example.invalid", active: false, vanRegistration: "" })]);
  mocks.summary.mockResolvedValue({ drivers: [] });
  mocks.jobs.mockResolvedValue({ items: [], pagination: { page: 1, pageSize: 100, total: 0 } });
  window.history.replaceState({}, "", "/admin?section=drivers");
});

const summaryRow = (patch: Record<string, unknown>) => ({ initials: "SD", fullName: "Sam Driver", email: "sam@example.invalid", phone: "07000 000111", vanRegistration: "AB12CDE", active: true, hasAccount: true,
  assigned: 4, completed: 4, cancelled: 0, completionRate: 1, avgDurationMinutes: 120, totalDurationMinutes: 480, avgDelayMinutes: 7, totalChargesPounds: 900, revenuePounds: 900, revenueFormatted: "£900.00",
  cashCollectedPounds: 500, cardCollectedPounds: 400, bankCollectedPounds: 0, invoiceCollectedPounds: 0, congestionChargePounds: 0, tunnelChargePounds: 0, overtimeMinutes: 0, missingEvidenceCount: 0, overtimeCount: 0,
  reviewSentCount: 3, reviewNotSentCount: 1, ...patch });

describe("DriversPage", () => {
  it("opens on driver cards with the deployed page's figures for the range", async () => {
    mocks.summary.mockResolvedValue({ drivers: [summaryRow({})] });
    renderPage();
    const card = await screen.findByRole("article", { name: "Sam Driver (SD)" });
    for (const text of ["sam@example.invalid", "07000 000111", "AB12 CDE", "Completed Jobs", "Revenue Handled", "£900.00", "£500.00 cash · £400.00 card", "Avg Start Delay", "7 min late", "Total Move Time", "8h 0m", "3 sent"])
      expect(within(card).getByText(text)).toBeInTheDocument();
    expect(within(card).getByText(/1 not sent/)).toBeInTheDocument();
    expect(mocks.summary.mock.calls[0][0]).toBeTruthy();
    fireEvent.click(within(card).getByRole("button", { name: "Sam Driver" }));
    expect(params().get("section")).toBe("driverreport");
    expect(params().get("driver")).toBe("SD");
  });

  it("flags revenue handled that is far above every recorded payment instead of showing it as normal", async () => {
    mocks.summary.mockResolvedValue({ drivers: [summaryRow({ initials: "MA", fullName: "MAN VAN", revenuePounds: 898990077.8, cashCollectedPounds: 9483.6, cardCollectedPounds: 7617 })] });
    renderPage();
    const card = await screen.findByRole("article", { name: "MAN VAN (MA)" });
    expect(within(card).getByText(/A job's final charge may have been mistyped/)).toBeInTheDocument();
  });

  it("shows account state, not online status, in the directory", async () => {
    window.history.replaceState({}, "", "/admin?section=drivers&view=directory");
    renderPage();
    const table = await screen.findByRole("table");
    expect(within(table).getByText("Account active")).toBeInTheDocument();
    expect(within(table).getByText("Deactivated")).toBeInTheDocument();
    expect(within(table).queryByText(/online/i)).not.toBeInTheDocument();
  });

  it("filters the directory by search", async () => {
    window.history.replaceState({}, "", "/admin?section=drivers&view=directory");
    renderPage();
    await screen.findByRole("table");
    fireEvent.change(screen.getByRole("searchbox", { name: "Search drivers" }), { target: { value: "olive" } });
    await vi.waitFor(() => expect(screen.queryAllByText("Sam Driver")).toHaveLength(0));
    expect(screen.getAllByText("Olive Leaver").length).toBeGreaterThan(0);
  });

  it("opens the report for a driver with a bounded range", async () => {
    window.history.replaceState({}, "", "/admin?section=drivers&view=directory");
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "View report for Sam Driver" }));
    expect(params().get("section")).toBe("driverreport");
    expect(params().get("driver")).toBe("SD");
    expect(params().get("from")).toBeTruthy();
    expect(params().get("to")).toBeTruthy();
  });

  it("requires the driver code before a permanent delete", async () => {
    window.history.replaceState({}, "", "/admin?section=drivers&profile=SD");
    renderPage();
    const profile = await screen.findByRole("dialog", { name: "Sam Driver" });
    fireEvent.click(within(profile).getByRole("button", { name: "More driver actions" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /Delete permanently/ }));
    const confirm = await screen.findByRole("dialog", { name: "Delete Sam Driver permanently?" });
    const button = within(confirm).getByRole("button", { name: "Delete permanently" });
    expect(button).toBeDisabled();
    fireEvent.change(within(confirm).getByRole("textbox"), { target: { value: "sd" } });
    expect(button).toBeEnabled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("switches to the performance summary and keeps it in the URL", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("tab", { name: /Performance/ }));
    expect(params().get("view")).toBe("performance");
    expect(mocks.summary).toHaveBeenCalled();
  });

  it("opens Generate Report from a profile with that driver chosen", async () => {
    window.history.replaceState({}, "", "/admin?section=drivers&profile=SD");
    renderPage();
    const profile = await screen.findByRole("dialog", { name: "Sam Driver" });
    fireEvent.click(within(profile).getByRole("button", { name: "Generate Report" }));
    const dialog = await screen.findByRole("dialog", { name: "Generate Report" });
    expect(within(dialog).getByRole("radio", { name: "Choose drivers" })).toBeChecked();
    expect(within(dialog).getByRole("checkbox", { name: /Sam Driver/ })).toBeChecked();
  });

  it("has exactly two tabs, Drivers and Performance", async () => {
    renderPage();
    const tabs = await screen.findAllByRole("tab");
    expect(tabs.map(tab => tab.textContent)).toEqual(["Drivers", "Performance"]);
    expect(screen.getByRole("tab", { name: "Drivers" })).toHaveAttribute("aria-selected", "true");
  });

  it("switches between cards and table inside Drivers without losing the search", async () => {
    window.history.replaceState({}, "", "/admin?section=drivers&q=olive");
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Table" }));
    expect(params().get("mode")).toBe("table");
    expect(params().get("q")).toBe("olive");
    const table = await screen.findByRole("table");
    expect(within(table).getByText("Olive Leaver")).toBeInTheDocument();
    expect(within(table).queryByText("Sam Driver")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cards" }));
    expect(params().get("mode")).toBe("cards");
    expect(params().get("q")).toBe("olive");
  });

  it("maps the old three-tab links onto the new two tabs", () => {
    expect(driversLocation("cards", "")).toEqual({ view: "drivers", mode: "cards" });
    expect(driversLocation("directory", "")).toEqual({ view: "drivers", mode: "table" });
    expect(driversLocation("performance", "")).toEqual({ view: "performance", mode: "cards" });
    expect(driversLocation("drivers", "table")).toEqual({ view: "drivers", mode: "table" });
    expect(driversLocation("", "")).toEqual({ view: "drivers", mode: "cards" });
  });

  it("opens the table for a legacy directory link and shows contact and the job column", async () => {
    window.history.replaceState({}, "", "/admin?section=drivers&view=directory");
    renderPage();
    const table = await screen.findByRole("table");
    expect(within(table).getByRole("columnheader", { name: "Contact" })).toBeInTheDocument();
    expect(within(table).getByRole("columnheader", { name: "Current / next job" })).toBeInTheDocument();
    expect(within(table).getByText("sample@example.invalid")).toBeInTheDocument();
    expect(within(table).getAllByText("Phone not recorded").length).toBeGreaterThan(0);
  });

  it("finds a driver by phone number in the table", async () => {
    mocks.roster.mockResolvedValue([driver({ phone: "07700 900555" }), driver({ initials: "OL", fullName: "Olive Leaver", phone: "07700 900111", email: "olive@example.invalid" })]);
    window.history.replaceState({}, "", "/admin?section=drivers&mode=table");
    renderPage();
    await screen.findByRole("table");
    fireEvent.change(screen.getByRole("searchbox", { name: "Search drivers" }), { target: { value: "900111" } });
    await vi.waitFor(() => expect(screen.queryAllByText("Sam Driver")).toHaveLength(0));
    expect(screen.getAllByText("Olive Leaver").length).toBeGreaterThan(0);
  });

  it("keeps Profile and View report reachable from a card", async () => {
    mocks.summary.mockResolvedValue({ drivers: [summaryRow({})] });
    renderPage();
    const card = await screen.findByRole("article", { name: "Sam Driver (SD)" });
    fireEvent.click(within(card).getByRole("button", { name: "View profile for Sam Driver" }));
    expect(params().get("profile")).toBe("SD");
  });

  it("edits a driver straight from the card pencil: one click, right driver, no profile", async () => {
    mocks.summary.mockResolvedValue({ drivers: [summaryRow({ imei: "123" }), summaryRow({ initials: "OL", fullName: "Olive Leaver", email: "olive@example.invalid", vanRegistration: "", active: false })] });
    renderPage();
    const card = await screen.findByRole("article", { name: "Olive Leaver (OL)" });
    fireEvent.click(within(card).getByRole("button", { name: "Edit driver Olive Leaver" }));
    const dialog = screen.getByRole("dialog", { name: "Edit driver" });
    expect(dialog).toHaveAttribute("data-initials", "OL");
    expect(dialog).toHaveAttribute("data-email", "olive@example.invalid");
    expect(dialog).toHaveAttribute("data-active", "false");
    expect(params().get("profile")).toBeNull();
    expect(window.location.search).not.toContain("section=driverreport");
  });

  it("passes the stored vehicle and device to the edit form", async () => {
    mocks.summary.mockResolvedValue({ drivers: [summaryRow({ imei: "123" })] });
    renderPage();
    const card = await screen.findByRole("article", { name: "Sam Driver (SD)" });
    fireEvent.click(within(card).getByRole("button", { name: "Edit driver Sam Driver" }));
    const dialog = screen.getByRole("dialog", { name: "Edit driver" });
    expect(dialog).toHaveAttribute("data-van", "AB12CDE");
    expect(dialog).toHaveAttribute("data-imei", "123");
  });

  it("edits from the table in one click as well", async () => {
    window.history.replaceState({}, "", "/admin?section=drivers&mode=table");
    renderPage();
    const table = await screen.findByRole("table");
    fireEvent.click(within(table).getByRole("button", { name: "Edit driver Sam Driver" }));
    expect(screen.getByRole("dialog", { name: "Edit driver" })).toHaveAttribute("data-initials", "SD");
    expect(params().get("profile")).toBeNull();
  });
});
