import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FinishedJobsPage } from "./FinishedJobsPage";
import type { NormalizedJob } from "../types";

const fetchJobs = vi.fn();

vi.mock("../api", () => ({
  fetchJobs: (...args: unknown[]) => fetchJobs(...args),
  fetchJobDetail: vi.fn()
}));

vi.mock("../hooks/useDriverOptions", () => ({
  useDriverOptions: () => ({ options: [], isLoading: false })
}));

vi.mock("../components/DateRangePicker", () => ({
  DateRangePicker: () => <div />,
  defaultDashboardDateRange: () => ({ from: "2026-10-01", to: "2026-10-31" })
}));

vi.mock("../components/FolderActionDropdown", () => ({
  FolderActionDropdown: () => <div />
}));

vi.mock("../components/SubmissionDetailDrawer", () => ({
  SubmissionDetailDrawer: () => null
}));

vi.mock("../components/BulkDeleteModal", () => ({
  BulkDeleteModal: () => null
}));

vi.mock("../components/DriverViewedDot", () => ({
  DriverViewedDot: () => null
}));

function completedJob(overrides: Partial<NormalizedJob> = {}): NormalizedJob {
  return {
    jobId: "TMV-REVIEW-YES",
    calendarEventId: "calendar-review-yes",
    bookedStart: "2026-10-02T09:00:00.000Z",
    bookedFinish: "2026-10-02T12:00:00.000Z",
    actualFinish: "2026-10-02T12:15:00.000Z",
    bookedMinutes: 180,
    delayMinutes: 0,
    delayBand: "ON_TIME",
    timingTrustworthy: true,
    customerName: "Review Customer",
    pickup: "1 Pickup Road, London",
    dropoff: "2 Dropoff Road, London",
    crewSize: 2,
    driverInitials: "TI",
    driverName: "Tiago",
    status: "COMPLETED",
    currentState: "COMPLETED",
    workflowCompletionPct: 100,
    basePrice: 10000,
    extraChargeSelections: [],
    extraCharges: 0,
    congestionCharge: 0,
    tunnelCharge: 0,
    overtimeMinutes: 0,
    overtimeCharge: 0,
    calculatedTotalCharges: 10000,
    totalCharges: 10000,
    amountCharged: 10000,
    reconciled: true,
    paymentMethod: "Card",
    paymentStatus: "Paid",
    reviewEmailStatus: "Yes",
    paidOnline: true,
    evidenceCompleteness: {
      arrival: "COMPLETED",
      vanLoaded: "COMPLETED",
      stopBy: "MISSING",
      emptyVan: "COMPLETED",
      organized: "MISSING",
      signature: "COMPLETED"
    },
    evidenceItems: [],
    scenarios: [],
    rawTitle: "",
    rawDescription: "",
    bookingDetails: {},
    activity: [],
    exceptions: [],
    created: "2026-10-02T08:00:00.000Z",
    updated: "2026-10-02T12:15:00.000Z",
    ...overrides
  };
}

describe("FinishedJobsPage review status", () => {
  it("keeps the card's RW Yes badge with its right-aligned completion status", async () => {
    fetchJobs.mockResolvedValue({
      items: [completedJob()],
      pagination: { page: 1, pageSize: 25, total: 1, hasMore: false }
    });

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <FinishedJobsPage />
      </QueryClientProvider>
    );

    const reviewStatus = (await screen.findAllByText("RW: Yes"))
      .find(status => status.closest("article") !== null);
    const card = reviewStatus?.closest("article");

    expect(card).not.toBeNull();
    expect(reviewStatus?.parentElement).toContainElement(within(card!).getByText("Completed"));
  });
});
