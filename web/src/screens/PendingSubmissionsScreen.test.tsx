import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PendingSubmissionsScreen } from "./PendingSubmissionsScreen";
const fetchPending = vi.hoisted(() => vi.fn());
vi.mock("../api/jobs", () => ({ fetchPendingSubmissions: fetchPending }));
const pending = { jobId: "PENDING-1", customerName: "Customer", actualFinish: "2026-10-12T08:00:00Z", bookedStart: "2026-10-12T07:00:00Z", requiredAt: "2026-10-12T08:01:00Z" };
describe("Pending submissions", () => {
  beforeEach(() => fetchPending.mockReset().mockResolvedValue({ jobs: [pending] }));
  it("lists outstanding entries and opens the selected job", async () => {
    const open = vi.fn(); render(<PendingSubmissionsScreen onOpenJob={open} />);
    fireEvent.click(await screen.findByRole("button", { name: /Customer.*PENDING-1/ }));
    expect(open).toHaveBeenCalledWith("PENDING-1");
  });
  it("removes a submitted entry when refreshed and shows an empty state", async () => {
    render(<PendingSubmissionsScreen onOpenJob={vi.fn()} />);
    await screen.findByText("Customer");
    fetchPending.mockResolvedValue({ jobs: [] });
    fireEvent.click(screen.getByRole("button", { name: "Refresh pending submissions" }));
    expect(await screen.findByText("No pending submissions")).toBeInTheDocument();
    expect(screen.queryByText("Customer")).not.toBeInTheDocument();
  });
  it("shows a retry on failure without inventing a completed submission", async () => {
    fetchPending.mockRejectedValueOnce(new Error("Offline"));
    render(<PendingSubmissionsScreen onOpenJob={vi.fn()} />);
    expect(await screen.findByText("Offline")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry pending submissions" }));
    await waitFor(() => expect(screen.getByText("Customer")).toBeInTheDocument());
  });
});
