import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PaperAnalyticsReport } from "./PaperAnalyticsReport";
import type { DriverSummaryItem } from "../types";
describe("Settlement receipt print totals", () => {
  it("prints Link and pending invoices without counting invoice amounts as collections", () => {
    const driver = { initials: "AB", fullName: "Driver", completed: 1, revenuePounds: 300, totalChargesPounds: 300, calculatedChargesPounds: 350, totalCollectionsPounds: 200,
      cashCollectedPounds: 100, cardCollectedPounds: 50, linkCollectedPounds: 50, bankCollectedPounds: 0, invoiceCollectedPounds: 100, invoiceUncollectedPounds: 100,
      congestionChargePounds: 0, tunnelChargePounds: 0, overtimeMinutes: 0, totalDurationMinutes: 120 } as DriverSummaryItem;
    const { container } = render(<PaperAnalyticsReport reportType="Driver Breakdown" driverSettlement={[driver]} />);
    expect(screen.getByText("Link (£)")).toBeInTheDocument(); expect(screen.getByText("Invoice Pending (£)")).toBeInTheDocument();
    expect(screen.getAllByText("Working Hours")).toHaveLength(2);
    const label = screen.getByText("Total Collected");
    expect(within(label.parentElement!).getByText("£200.00")).toBeInTheDocument();
    expect(container.querySelector("table")?.querySelectorAll("tbody tr")).toHaveLength(1);
    expect(container.querySelector("table")).toHaveTextContent("350.00");
  });
});
