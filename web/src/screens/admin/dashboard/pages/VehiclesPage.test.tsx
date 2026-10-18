import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { DateTime } from "luxon";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VanDriverRecordItem } from "../types";
import { VehiclesPage, attentionSummary, recordDetail } from "./VehiclesPage";

const api = vi.hoisted(() => ({ fetchVanDriverRecords: vi.fn(), saveVanCompliance: vi.fn(), deleteVanRecord: vi.fn() }));
vi.mock("../api", () => api);

const iso = (days: number) => DateTime.now().setZone("Europe/London").plus({ days }).toISODate()!;
const fuel = { id: "f1", type: "FUEL", submittedAt: "2026-10-12T08:00:00Z", driverName: "Aragao", driverEmail: "aragao@example.test", driverInitials: "AR", vanRegistration: "YC68VJZ", odometerReading: 48090, fuelCost: 86.4, photoUrl: "/fuel.jpg", thumbUrl: "/fuel-t.jpg" } as const;
const van: VanDriverRecordItem = {
  id: "YC68VJZ", driverName: "Aragao", driverEmail: "aragao@example.test", driverInitials: "AR", vanRegistration: "YC68VJZ", latestSubmittedAt: fuel.submittedAt,
  latestMileage: null, latestFuel: fuel as unknown as VanDriverRecordItem["latestFuel"], latestService: null, records: [fuel as unknown as VanDriverRecordItem["records"][number]],
  compliance: { vanRegistration: "YC68VJZ", roadTaxRenewalDate: iso(109), motExpiryDate: iso(222), insuranceExpiryDate: iso(300), notes: "", serviceIntervalMiles: 8000, lastServiceMileage: 40000, currentMileage: 44000 }
};

const renderPage = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><VehiclesPage /></QueryClientProvider>);

beforeEach(() => {
  window.history.replaceState({}, "", "/admin?section=vehicles");
  api.fetchVanDriverRecords.mockReset().mockResolvedValue({ items: [van], pagination: { page: 1, pageSize: 25, total: 1, totalPages: 1, hasMore: false } });
  api.saveVanCompliance.mockReset().mockImplementation(async (_reg: string, payload: object) => ({ ...van.compliance, ...payload }));
  api.deleteVanRecord.mockReset().mockResolvedValue({ ok: true });
});

describe("Vehicles (Van) page", () => {
  it("keeps the classic columns and the details under each status", async () => {
    renderPage();
    const table = await screen.findByRole("table", { name: "Drivers and vans" });
    expect(within(table).getAllByRole("columnheader").map(cell => cell.textContent)).toEqual(expect.arrayContaining(["#", "Driver", "Van", "Fuel", "Service", "Compliance"]));
    expect(within(table).getByText("aragao@example.test")).toBeInTheDocument();
    expect(within(table).getByText("48,090 mi · £86.40")).toBeInTheDocument();
    expect(within(table).getByText("Not uploaded")).toBeInTheDocument(); // no service record in range
    expect(within(table).getByText("Current")).toBeInTheDocument();
    expect(within(table).getByText(/^MOT \d/)).toBeInTheDocument();
    expect(within(table).getByText(/^Tax \d/)).toBeInTheDocument();
    expect(within(table).getByText(/^Service: Remaining miles:/)).toBeInTheDocument();
    expect(api.fetchVanDriverRecords).toHaveBeenCalledWith(expect.objectContaining({ from: expect.any(String), to: expect.any(String) }));
  });

  it("opens the preview with the three cards, the countdown and the submissions", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /Open van details for Aragao/ }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Vehicle Compliance")).toBeInTheDocument();
    expect(within(dialog).getByRole("img", { name: "Road tax: Status: OK" })).toHaveTextContent("109 days");
    expect(within(dialog).getByText("Next MOT date")).toBeInTheDocument();
    expect(within(dialog).getByText("All van submissions")).toBeInTheDocument();
    expect(within(dialog).getByText("No service record")).toBeInTheDocument();
    expect(within(dialog).getAllByText("Not uploaded").length).toBeGreaterThan(0);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("saves compliance dates with the rest of the document unchanged and shows the new date", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /Open van details for Aragao/ }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Edit compliance dates" }));
    fireEvent.change(within(dialog).getByLabelText("MOT expiry"), { target: { value: "2027-05-25" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save compliance" }));
    await screen.findByText("25 May 2027");
    expect(api.saveVanCompliance).toHaveBeenCalledWith("YC68VJZ", expect.objectContaining({
      motExpiryDate: "2027-05-25", roadTaxRenewalDate: iso(109), insuranceExpiryDate: iso(300), serviceIntervalMiles: 8000
    }));
  });

  it("validates the service interval before saving", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /Open van details for Aragao/ }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Edit service interval" }));
    fireEvent.change(within(dialog).getByLabelText("Service interval (miles)"), { target: { value: "-5" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save service settings" }));
    expect(await within(dialog).findByText("Enter a valid service interval.")).toBeInTheDocument();
    expect(api.saveVanCompliance).not.toHaveBeenCalled();
  });

  it("deletes a submission only after confirming", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /Open van details for Aragao/ }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /Delete Fuel record from/ }));
    expect(api.deleteVanRecord).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole("button", { name: "Delete record" }));
    await vi.waitFor(() => expect(api.deleteVanRecord).toHaveBeenCalledWith("f1"));
    expect(await screen.findByText("No submissions found.")).toBeInTheDocument();
  });

  it("describes each record type from its real fields only", () => {
    expect(recordDetail(null)).toBeNull();
    expect(recordDetail({ ...fuel, odometerReading: null, fuelCost: null } as never)).toBeNull();
    expect(recordDetail({ ...fuel, type: "SERVICE", serviceMileage: 40610, serviceType: "Interim service", serviceDate: "2026-07-17" } as never)).toBe("40,610 mi · Interim service · 17 Jul 2026");
  });

  const overdueVan = { ...van, id: "OV1", vanRegistration: "OV1", driverName: "Overdue Owen", driverEmail: "owen@example.test", compliance: { ...van.compliance!, vanRegistration: "OV1", motExpiryDate: iso(-5), roadTaxRenewalDate: iso(10) } } as VanDriverRecordItem;
  const missingVan = { ...van, id: "MS1", vanRegistration: "MS1", driverName: "Missing Mia", driverEmail: "mia@example.test", compliance: { ...van.compliance!, vanRegistration: "MS1", motExpiryDate: "" } } as VanDriverRecordItem;

  it("has one vehicle view: no All vehicles / Needs attention switch", async () => {
    renderPage();
    await screen.findByRole("table", { name: "Drivers and vans" });
    expect(screen.queryByRole("radiogroup", { name: "Show" })).toBeNull();
    expect(screen.queryByRole("radio", { name: /All vehicles/ })).toBeNull();
    expect(screen.queryByRole("tab")).toBeNull();
  });

  it("labels warnings in the row with text, not only colour, and leaves compliant vans unmarked", async () => {
    api.fetchVanDriverRecords.mockResolvedValue({ items: [van, overdueVan, missingVan], pagination: { page: 1, pageSize: 25, total: 3, totalPages: 1, hasMore: false } });
    renderPage();
    const table = await screen.findByRole("table", { name: "Drivers and vans" });
    expect(within(table).getAllByText(/Needs attention/)).toHaveLength(2);
    expect(within(table).getByText(/MOT overdue, Tax due soon/)).toBeInTheDocument();
    expect(within(table).getAllByText(/MOT not recorded/).length).toBeGreaterThanOrEqual(2);
    expect(within(table).getByText(/· expired/)).toBeInTheDocument();
  });

  it("keeps the thresholds: overdue is red, due soon and missing are amber, a missing date is never compliant", () => {
    expect(attentionSummary(van.compliance)).toBeNull();
    expect(attentionSummary(overdueVan.compliance)).toEqual({ text: "MOT overdue, Tax due soon", tone: "danger" });
    expect(attentionSummary({ ...van.compliance!, roadTaxRenewalDate: iso(10) })).toEqual({ text: "Tax due soon", tone: "warning" });
    expect(attentionSummary(missingVan.compliance)?.text).toBe("MOT not recorded");
    expect(attentionSummary(null)?.text).toBe("MOT not recorded, Tax not recorded");
  });

  it("filters to vehicles that need attention and old links still land there", async () => {
    window.history.replaceState({}, "", "/admin?section=vehicles&show=attention");
    api.fetchVanDriverRecords.mockResolvedValue({ items: [van, overdueVan], pagination: { page: 1, pageSize: 25, total: 2, totalPages: 1, hasMore: false } });
    renderPage();
    const table = await screen.findByRole("table", { name: "Drivers and vans" });
    expect(within(table).getByText("Overdue Owen")).toBeInTheDocument();
    expect(within(table).queryByText("Aragao")).toBeNull();
    const toggle = screen.getByRole("button", { name: /Needs attention.*on this page/ });
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(toggle);
    expect(await within(await screen.findByRole("table", { name: "Drivers and vans" })).findByText("Aragao")).toBeInTheDocument();
  });
});
