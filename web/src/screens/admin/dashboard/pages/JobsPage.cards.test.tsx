import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { JobsPage } from "./JobsPage";

vi.mock("../api", () => ({
  fetchJobs: vi.fn().mockResolvedValue({ items: [{ jobId: "UI-JOB", customerName: "Sample Customer", driverInitials: "WD", driverName: "Driver WD",
    bookedStart: "2026-10-11T09:00:00Z", status: "READY", amountCharged: 10000, totalCharges: 10000, rawTitle: "Sample booking" }],
    pagination: { page: 1, pageSize: 25, total: 1, totalPages: 1 } }),
  fetchDrivers: vi.fn(), fetchJobDetail: vi.fn(), markJobFinishedManually: vi.fn(), reassignJob: vi.fn()
}));
vi.mock("../hooks/useDriverOptions", () => ({ useDriverOptions: () => ({ options: [], isLoading: false }) }));
vi.mock("../components/JobDetailDrawer", () => ({ JobDetailDrawer: ({ job, onClose }: any) => <div role="dialog" aria-label="Job details">{job.jobId}<button onClick={onClose}>Close details</button></div> }));

describe("Admin job-card styling", () => {
  it("uses compact rectangular corners without changing selection, actions or opening details", async () => {
    window.history.replaceState({}, "", "/admin?section=jobs");
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><JobsPage /></QueryClientProvider>);
    const customer = await screen.findByText("Sample Customer");
    const card = customer.closest("article")!;
    expect(card).toHaveClass("rounded-[6px]", "border-admin-line", "p-4");
    const selection = screen.getByRole("checkbox", { name: "Select job UI-JOB" });
    fireEvent.click(selection);
    expect(selection).toBeChecked();
    expect(card).toHaveClass("border-admin-brand", "ring-2");
    fireEvent.click(screen.getByRole("button", { name: "Actions for job UI-JOB" }));
    expect(screen.getByText("Reassign driver")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Actions for job UI-JOB" }));
    fireEvent.click(customer.closest("button")!);
    expect(screen.getByRole("dialog", { name: "Job details" })).toHaveTextContent("UI-JOB");
    fireEvent.click(screen.getByRole("button", { name: "Close details" }));
    expect(screen.queryByRole("dialog", { name: "Job details" })).not.toBeInTheDocument();
  });
});
