import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OverviewPage } from "./OverviewPage";
import type { NormalizedJob } from "../types";

const fetchDrivers = vi.fn();
const fetchJobs = vi.fn();

vi.mock("../api", () => ({
  fetchDrivers: (...args: unknown[]) => fetchDrivers(...args),
  fetchJobs: (...args: unknown[]) => fetchJobs(...args),
  fetchSummary: vi.fn()
}));

vi.mock("../components/DateRangePicker", () => ({
  DateRangePicker: () => <div />,
  defaultDashboardDateRange: () => ({ from: "2026-10-01", to: "2026-10-31" })
}));

describe("OverviewPage work breakdown review reporting", () => {
  it("shows selected-range moving hours in the clean driver breakdown summary", async () => {
    fetchDrivers.mockResolvedValue({
      drivers: [{
        initials: "TI",
        fullName: "Tiago",
        active: true,
        hasAccount: true,
        assigned: 3,
        completed: 3,
        cancelled: 0,
        completionRate: 100,
        avgDurationMinutes: 0,
        totalDurationMinutes: 0,
        movingKnownSeconds: 3600,
        movingUnknownJobs: 0,
        movingPartialJobs: 0,
        avgDelayMinutes: 0,
        totalChargesPounds: 0,
        revenuePounds: 0,
        revenueFormatted: "£0.00",
        cashCollectedPounds: 0,
        cardCollectedPounds: 0,
        bankCollectedPounds: 0,
        invoiceCollectedPounds: 0,
        congestionChargePounds: 0,
        tunnelChargePounds: 0,
        overtimeMinutes: 0,
        missingEvidenceCount: 0,
        overtimeCount: 0,
        reviewSentCount: 2,
        reviewNotSentCount: 1
      }]
    });
    fetchJobs.mockResolvedValue({ items: [], pagination: { page: 1, pageSize: 500, total: 0, hasMore: false } });

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <OverviewPage />
      </QueryClientProvider>
    );

    expect(await screen.findByRole("columnheader", { name: "Moving Hours" })).toBeInTheDocument();
    expect(await screen.findByText("1.0h")).toBeInTheDocument();
    expect(screen.queryByText("RW Sent / Not sent")).not.toBeInTheDocument();
  });

  it("opens a dedicated report with retained driver/range instead of fetching an inline breakdown", async () => {
    fetchDrivers.mockResolvedValue({
      drivers: [{
        initials: "TI",
        fullName: "Tiago",
        active: true,
        hasAccount: true,
        assigned: 1,
        completed: 1,
        cancelled: 0,
        completionRate: 100,
        avgDurationMinutes: 0,
        totalDurationMinutes: 0,
        avgDelayMinutes: 0,
        totalChargesPounds: 0,
        revenuePounds: 0,
        revenueFormatted: "Â£0.00",
        cashCollectedPounds: 0,
        cardCollectedPounds: 0,
        bankCollectedPounds: 0,
        invoiceCollectedPounds: 0,
        congestionChargePounds: 0,
        tunnelChargePounds: 0,
        overtimeMinutes: 0,
        missingEvidenceCount: 0,
        overtimeCount: 0,
        reviewSentCount: 0,
        reviewNotSentCount: 1
      }]
    });
    fetchJobs.mockResolvedValue({
      items: [{
        jobId: "TMV-RW-NO",
        bookedStart: "2026-10-02T09:00:00.000Z",
        customerName: "Review Customer",
        driverInitials: "TI",
        status: "COMPLETED",
        reviewEmailStatus: "No"
      } as NormalizedJob],
      pagination: { page: 1, pageSize: 500, total: 1, hasMore: false }
    });

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <OverviewPage />
      </QueryClientProvider>
    );

    fireEvent.click(await screen.findByText("Tiago"));
    const params = new URLSearchParams(window.location.search);
    expect(params.get("section")).toBe("driverreport"); expect(params.get("driver")).toBe("TI");
    expect(params.get("from")).toBe("2026-10-01");
    expect(fetchJobs).not.toHaveBeenCalled();
  });
});
