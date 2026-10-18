import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DriverPerformanceSummary } from "./DriverPerformanceSummary";

// jsdom has no ResizeObserver, which recharts' ResponsiveContainer needs. Chart marks are checked in a real browser;
// here the numbers are checked through each chart's data table and the KPI cards.
class FakeResizeObserver { observe() {} unobserve() {} disconnect() {} }
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = FakeResizeObserver;

const api = vi.hoisted(() => ({ summary: vi.fn(), jobs: vi.fn() }));
vi.mock("../api", async original => ({ ...await original<typeof import("../api")>(), fetchDrivers: api.summary, fetchJobs: api.jobs }));

const row = (patch: Record<string, unknown>) => ({ initials: "KA", fullName: "Caio", email: "", phone: "", vanRegistration: "", active: true, hasAccount: true, assigned: 4, completed: 4, cancelled: 0, completionRate: 1,
  avgDurationMinutes: 120, totalDurationMinutes: 480, workingUnknownJobs: 0, avgDelayMinutes: 0, totalChargesPounds: 950, calculatedChargesPounds: 950, revenuePounds: 900, revenueFormatted: "£900.00",
  cashCollectedPounds: 500, cardCollectedPounds: 400, bankCollectedPounds: 0, invoiceCollectedPounds: 0, totalCollectionsPounds: 900, unknownCollectionJobs: 0, congestionChargePounds: 0, tunnelChargePounds: 0,
  overtimeMinutes: 0, missingEvidenceCount: 0, overtimeCount: 0, reviewSentCount: 3, reviewNotSentCount: 1, ...patch });
const TWO = [row({}), row({ initials: "TI", fullName: "Tiago", completed: 2, revenuePounds: 300, calculatedChargesPounds: 320, totalCollectionsPounds: 100, cashCollectedPounds: 100, cardCollectedPounds: 0, invoiceCollectedPounds: 200, totalDurationMinutes: 0, workingUnknownJobs: 2, reviewSentCount: 1, reviewNotSentCount: 0, unknownCollectionJobs: 1 })];
const params = () => new URLSearchParams(window.location.search);

const renderIt = (props: Partial<React.ComponentProps<typeof DriverPerformanceSummary>> = {}) => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <DriverPerformanceSummary from="2026-10-10T00:00:00Z" to="2026-10-16T23:00:00Z" driver="" onRange={vi.fn()} onDriver={vi.fn()} {...props} />
  </QueryClientProvider>);

beforeEach(() => {
  api.summary.mockReset().mockResolvedValue({ drivers: TWO });
  api.jobs.mockReset().mockResolvedValue({ items: [], pagination: { page: 1, pageSize: 100, total: 0 } });
  window.history.replaceState({}, "", "/admin?section=drivers&view=performance");
});

describe("Performance dashboard", () => {
  it("shows five KPI cards whose totals add up the table rows, with each financial measure kept apart", async () => {
    renderIt();
    const kpis = await screen.findByRole("group", { name: "Period summary" });
    expect(kpis).toHaveTextContent("Completed jobs6");
    expect(kpis).toHaveTextContent("Calculated charges£1,270.00");
    expect(kpis).toHaveTextContent("Final charges£1,200.00");
    expect(kpis).toHaveTextContent("Working time8h 0m");
    expect(kpis).toHaveTextContent("2 jobs missing times");
    expect(kpis).toHaveTextContent("Review requests4");
    expect(kpis).toHaveTextContent("1 not sent, of 5 tracked");
    expect(kpis).not.toHaveTextContent("Cash received");
  });

  it("only draws a review ring when something is tracked", async () => {
    api.summary.mockResolvedValue({ drivers: [row({ reviewSentCount: 0, reviewNotSentCount: 0 })] });
    renderIt();
    const kpis = await screen.findByRole("group", { name: "Period summary" });
    expect(within(kpis).queryByRole("img", { name: /tracked review requests were sent/ })).not.toBeInTheDocument();
    expect(kpis).toHaveTextContent("No review requests tracked");
  });

  it("compares with the previous period only when it loaded", async () => {
    api.summary.mockImplementation(async (from: string) => ({ drivers: from?.startsWith("2026-10-03") ? [row({ completed: 3, revenuePounds: 600, calculatedChargesPounds: 650 })] : TWO }));
    renderIt();
    expect(await screen.findByText(/\+3 \(\+100%\) vs previous period/)).toBeInTheDocument();
    expect(screen.getByText(/\+100% vs previous period/, { selector: "span" })).toBeInTheDocument();
  });

  it("charts agree with the table: same drivers, same completed jobs and charges", async () => {
    renderIt();
    const jobs = (await screen.findByRole("region", { name: /Completed jobs/ }));
    const table = within(jobs).getByRole("table", { name: "Completed jobs by driver" });
    expect(within(table).getByText("Caio").closest("tr")).toHaveTextContent("467%");
    expect(within(table).getByText("Tiago").closest("tr")).toHaveTextContent("233%");
    const charges = within(screen.getByRole("region", { name: /Charges by driver/ })).getByRole("table", { name: "Calculated and final charges by driver" });
    expect(within(charges).getByText("Tiago").closest("tr")).toHaveTextContent("£320.00");
    expect(within(charges).getByText("Tiago").closest("tr")).toHaveTextContent("£300.00");
    const comparison = screen.getByRole("table", { name: "Driver performance summary" });
    expect(within(comparison).getByText("Tiago").closest("tr")).toHaveTextContent("£300.00");
  });

  it("keeps invoices out of money received and says so", async () => {
    renderIt();
    const payments = await screen.findByRole("region", { name: /Payment methods/ });
    const table = within(payments).getByRole("table", { name: "Recorded receipts by method" });
    expect(within(table).getByText("Cash").closest("tr")).toHaveTextContent("£600.00");
    expect(within(table).getByText("Invoiced (not received)").closest("tr")).toHaveTextContent("£200.00");
    expect(payments).toHaveTextContent("1 job had no verified payment record");
  });

  it("never averages working time over jobs without a time, and never shows missing time as zero", async () => {
    renderIt();
    const region = await screen.findByRole("region", { name: /Working time/ });
    const table = within(region).getByRole("table", { name: "Working time by driver" });
    expect(within(table).getByText("Caio").closest("tr")).toHaveTextContent("2h 0m");
    expect(within(table).getByText("Tiago").closest("tr")).toHaveTextContent("Not recorded");
    expect(within(table).getByText("Tiago").closest("tr")).not.toHaveTextContent("0m");
  });

  it("opens the driver's report from a ranked bar", async () => {
    renderIt();
    const list = await screen.findByRole("list", { name: "Completed jobs by driver" });
    fireEvent.click(within(list).getByRole("button", { name: /^Caio: 4/ }));
    expect(params().get("section")).toBe("driverreport");
    expect(params().get("driver")).toBe("KA");
  });

  it("sorts the comparison table, with unknown receipts last in both directions", async () => {
    api.summary.mockResolvedValue({ drivers: [row({}), row({ initials: "TI", fullName: "Tiago", totalCollectionsPounds: undefined })] });
    renderIt();
    await screen.findByRole("table", { name: "Driver performance summary" });
    fireEvent.change(screen.getByLabelText("Sort by"), { target: { value: "receipts" } });
    const names = () => within(screen.getByRole("table", { name: "Driver performance summary" })).getAllByRole("row").slice(1).map(r => r.textContent);
    expect(names()[0]).toContain("Caio");
    fireEvent.click(screen.getByRole("button", { name: "Sort ascending" }));
    expect(names()[0]).toContain("Caio");
    expect(names()[1]).toContain("Tiago");
  });

  it("with one driver selected, shows that driver's own figures and the full report action, not a comparison", async () => {
    api.summary.mockResolvedValue({ drivers: TWO });
    renderIt({ driver: "KA" });
    expect(await screen.findByRole("heading", { name: "Caio" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: /Charges by driver/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("table", { name: "Driver performance summary" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "View full driver report" }));
    expect(params().get("driver")).toBe("KA");
    expect(params().get("section")).toBe("driverreport");
  });

  it("shows a failed request as a failure with a retry, never as no data", async () => {
    api.summary.mockRejectedValue(new Error("Backend unavailable"));
    renderIt();
    expect(await screen.findByText("Couldn't load driver performance")).toBeInTheDocument();
    expect(screen.queryByText("No completed jobs in this range")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Try again|Retry/ })).toBeInTheDocument();
  });

  it("shows a real empty state with no completed jobs", async () => {
    api.summary.mockResolvedValue({ drivers: [row({ completed: 0 })] });
    renderIt();
    expect(await screen.findByText("No completed jobs in this range")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Period summary" })).not.toBeInTheDocument();
  });

  it("exports the table with calculated, final and receipts as separate columns", async () => {
    const create = vi.fn(() => "blob:x"); const click = vi.fn();
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = create;
    (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(click);
    renderIt();
    await screen.findByRole("group", { name: "Period summary" });
    fireEvent.click(screen.getByRole("button", { name: "Export options" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /CSV/ }));
    expect(click).toHaveBeenCalled();
    const blob = (create.mock.calls[0] as unknown as [Blob])[0];
    const text = await blob.text();
    expect(text).toContain("Calculated charges (GBP)");
    expect(text).toContain("Final charges (GBP)");
    expect(text).toContain("Recorded receipts (GBP, excludes invoices)");
  });
});
